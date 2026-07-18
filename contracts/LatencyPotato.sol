// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 *  LATENCY POTATO — a 100ms-block hot-potato game for Robinhood Chain
 *  (Chain ID 4663, FCFS sequencing, no priority gas auction).
 *
 *  Game loop:
 *    - Anyone calls takePotato() paying `currentPrice` in ETH (or $POTATO
 *      at a 5% discount, burned on use).
 *    - The previous holder is instantly refunded their buy-in + 5% profit.
 *    - Of the 10% price step: 5% -> previous holder profit, 3% -> jackpot,
 *      2% -> protocol fee treasury.
 *    - Price compounds 10% per take; the 30s timer resets on every take.
 *    - If nobody snipes before roundEndTime, the last holder wins:
 *      50% of jackpot paid out, 40% rolls over, 10% -> dev treasury.
 *
 *  Because sequencing is strictly first-come-first-served with 100ms blocks,
 *  winning is a pure latency race — no gas bidding possible.
 *
 *  UNAUDITED — do not deploy with real funds without a professional audit.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @dev Works with ANY standard ERC-20 (launchpad tokens included) — no
///      burnFrom required. "Burning" = transfer to the dead address.
interface IPotatoToken is IERC20 {}

/// @notice Any oracle returning $POTATO per 1 ETH (18 decimals). See
///         PotatoTwapOracle.sol for a Uniswap V3 TWAP implementation.
interface IPotatoOracle {
    function potatoPerEth() external view returns (uint256);
}

/// @notice Minimal V2-style router interface for side-pot conversion.
interface ISwapRouterV2 {
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

contract LatencyPotato is ReentrancyGuard, Ownable2Step {
    // ---------------------------------------------------------------- config
    uint256 public roundDuration = 30 seconds;
    uint256 public constant BASE_PRICE = 0.005 ether;
    uint256 public priceMultiplier = 110; // /100 => +10% per take

    // Split of each take (denominated vs the PREVIOUS price, so that
    // refund(105) + jackpot(3) + treasury(2) == 110 == price paid):
    uint256 public constant REFUND_PCT = 105;   // prev holder: buy-in + 5%
    uint256 public constant JACKPOT_PCT = 3;    // -> jackpotPool
    uint256 public constant PROTOCOL_PCT = 2;   // -> protocol fee treasury

    // Settlement split of jackpotPool:
    uint256 public constant WINNER_PCT = 50;
    uint256 public constant ROLLOVER_PCT = 40;
    uint256 public constant DEV_PCT = 10;

    uint256 public constant POTATO_DISCOUNT_PCT = 95; // pay 95% when in $POTATO
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // ---------------------------------------------------------------- state
    uint256 public currentPrice = BASE_PRICE;
    address public currentHolder;
    uint256 public roundEndTime;
    uint256 public jackpotPool;
    uint256 public round; // monotonically increasing round id

    /// @dev Price the current holder actually paid (basis for their refund).
    uint256 public lastPaidPrice;

    address public protocolTreasury;
    address public devTreasury;
    IPotatoToken public potatoToken;

    /// @notice Fallback $POTATO per 1 ETH rate, 18 decimals. Used only when
    ///         no oracle is set (e.g. before the POTATO pool has liquidity).
    uint256 public potatoPerEth;

    /// @notice Preferred price source: a TWAP oracle on the POTATO/WETH pool.
    ///         When set, it overrides the owner rate — removing the owner
    ///         mispricing vector on the discount path.
    IPotatoOracle public oracle;

    /// @notice Router + path for converting the $POTATO tax side-pot to ETH.
    ISwapRouterV2 public swapRouter;
    address public weth;

    /// @dev Pull-payment escrow: if a push refund fails (e.g. a contract
    ///      holder that reverts in receive()), we escrow instead of bricking
    ///      the game — a reverting receiver must never be able to hold the
    ///      potato hostage.
    mapping(address => uint256) public pendingWithdrawals;

    // Leaderboard-friendly accounting
    mapping(address => uint256) public wins;
    mapping(address => uint256) public totalClaimed;

    // ---------------------------------------------------------------- events
    event PotatoTaken(
        uint256 indexed round,
        address indexed taker,
        address indexed previousHolder,
        uint256 pricePaid,
        uint256 newPrice,
        uint256 roundEndTime,
        bool paidInPotato
    );
    event RoundSettled(
        uint256 indexed round,
        address indexed winner,
        uint256 winnerPayout,
        uint256 rollover,
        uint256 devCut
    );
    event JackpotBoosted(address indexed from, uint256 amount);
    event RefundEscrowed(address indexed holder, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    // ---------------------------------------------------------------- errors
    error RoundNotOver();
    error WrongPayment(uint256 required, uint256 sent);
    error AlreadyHolding();
    error TokenNotConfigured();
    error InsufficientJackpotLiquidity();
    error NothingToWithdraw();
    error TransferFailed();
    error ZeroAddress();

    constructor(address _protocolTreasury, address _devTreasury)
        Ownable(msg.sender)
    {
        if (_protocolTreasury == address(0) || _devTreasury == address(0)) {
            revert ZeroAddress();
        }
        protocolTreasury = _protocolTreasury;
        devTreasury = _devTreasury;
        round = 1;
    }

    // ================================================================ views

    function timeLeftMs() external view returns (uint256) {
        if (roundEndTime == 0 || block.timestamp >= roundEndTime) return 0;
        return (roundEndTime - block.timestamp) * 1000;
    }

    function roundActive() public view returns (bool) {
        return currentHolder != address(0) && block.timestamp <= roundEndTime;
    }

    /// @notice Live $POTATO/ETH rate: TWAP oracle when configured, owner
    ///         fallback rate otherwise.
    function potatoRate() public view returns (uint256) {
        if (address(oracle) != address(0)) {
            uint256 r = oracle.potatoPerEth();
            if (r > 0) return r;
        }
        return potatoPerEth;
    }

    /// @notice $POTATO cost for the current price, incl. the 5% discount.
    function potatoPriceNow() public view returns (uint256) {
        return (currentPrice * potatoRate() * POTATO_DISCOUNT_PCT) / (1 ether * 100);
    }

    // ================================================================ game

    /// @notice Grab the potato by paying exactly `currentPrice` in ETH.
    ///         If the previous round expired, it is settled first and your
    ///         payment opens the new round at BASE_PRICE.
    function takePotato() external payable nonReentrant {
        _maybeSettle();
        if (msg.value != currentPrice) revert WrongPayment(currentPrice, msg.value);
        _take(msg.sender, msg.value, false);
    }

    /// @notice Grab the potato paying in $POTATO at a 5% discount.
    ///         Tokens are burned (deflationary). Requires prior approval or
    ///         an EIP-2612 permit. The previous holder's ETH refund is drawn
    ///         from the jackpotPool since no ETH enters on this path.
    function takePotatoWithToken() external nonReentrant {
        if (address(potatoToken) == address(0) || potatoRate() == 0) {
            revert TokenNotConfigured();
        }
        _maybeSettle();

        uint256 cost = potatoPriceNow();
        // ETH obligations this take creates (paid from the jackpot pool):
        uint256 ethObligation = currentHolder == address(0)
            ? 0
            : (lastPaidPrice * (REFUND_PCT + PROTOCOL_PCT)) / 100;
        if (jackpotPool < ethObligation) revert InsufficientJackpotLiquidity();

        // Deflation: spent tokens go to the dead address — unrecoverable,
        // works with any standard ERC-20 (no burnFrom needed for launchpad CAs).
        potatoToken.transferFrom(msg.sender, DEAD, cost);
        jackpotPool -= ethObligation;
        _take(msg.sender, 0, true);
    }

    /// @notice Settle an expired round. Callable by anyone (keepers welcome).
    function settleRound() external nonReentrant {
        if (currentHolder == address(0)) revert RoundNotOver();
        if (block.timestamp <= roundEndTime) revert RoundNotOver();
        _settle();
    }

    /// @notice Escape hatch for escrowed refunds (see pendingWithdrawals).
    function withdraw() external nonReentrant {
        uint256 amt = pendingWithdrawals[msg.sender];
        if (amt == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amt}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amt);
    }

    /// @notice Accepts ETH from the $POTATO transfer tax (or any donor) and
    ///         routes 100% of it into the live jackpot.
    receive() external payable {
        jackpotPool += msg.value;
        emit JackpotBoosted(msg.sender, msg.value);
    }

    // ================================================================ internal

    function _maybeSettle() internal {
        if (currentHolder != address(0) && block.timestamp > roundEndTime) {
            _settle();
        }
    }

    function _take(address taker, uint256 ethPaid, bool paidInPotato) internal {
        if (taker == currentHolder) revert AlreadyHolding();

        address prev = currentHolder;
        uint256 pricePaid = currentPrice;

        if (prev == address(0)) {
            // First take of a fresh round: no one to refund — the whole
            // buy-in seeds the jackpot.
            if (ethPaid > 0) jackpotPool += ethPaid;
        } else {
            // Of the 110 units paid (vs prev price = 100):
            //   105 -> previous holder (buy-in + 5% profit)
            //     3 -> jackpotPool
            //     2 -> protocol treasury
            uint256 refund = (lastPaidPrice * REFUND_PCT) / 100;
            uint256 toJackpot = (lastPaidPrice * JACKPOT_PCT) / 100;
            uint256 toProtocol = (lastPaidPrice * PROTOCOL_PCT) / 100;

            // The 3% jackpot cut is only real money on the ETH path — the
            // token path brings no ETH in (tokens are burned), so crediting
            // it there would let jackpotPool drift above actual balance.
            if (!paidInPotato) jackpotPool += toJackpot;
            // Dust from integer division also goes to the jackpot on the ETH
            // path (ethPaid - refund - toJackpot - toProtocol >= 0).
            if (ethPaid > refund + toJackpot + toProtocol) {
                jackpotPool += ethPaid - refund - toJackpot - toProtocol;
            }

            _pushOrEscrow(prev, refund);
            _push(protocolTreasury, toProtocol);
        }

        lastPaidPrice = pricePaid;
        currentHolder = taker;
        currentPrice = (pricePaid * priceMultiplier) / 100;
        roundEndTime = block.timestamp + roundDuration;

        emit PotatoTaken(round, taker, prev, pricePaid, currentPrice, roundEndTime, paidInPotato);
    }

    function _settle() internal {
        address winner = currentHolder;
        uint256 pool = jackpotPool;

        uint256 winnerCut = (pool * WINNER_PCT) / 100;
        uint256 devCut = (pool * DEV_PCT) / 100;
        uint256 rollover = pool - winnerCut - devCut; // ~40%, absorbs dust

        jackpotPool = rollover;

        wins[winner] += 1;
        totalClaimed[winner] += winnerCut;

        emit RoundSettled(round, winner, winnerCut, rollover, devCut);

        // Reset BEFORE external calls (checks-effects-interactions).
        round += 1;
        currentHolder = address(0);
        currentPrice = BASE_PRICE;
        lastPaidPrice = 0;
        roundEndTime = 0;

        _pushOrEscrow(winner, winnerCut);
        _push(devTreasury, devCut);
    }

    /// @dev Push ETH; on failure escrow it so a hostile receiver can't
    ///      grief the game loop.
    function _pushOrEscrow(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount, gas: 50_000}("");
        if (!ok) {
            pendingWithdrawals[to] += amount;
            emit RefundEscrowed(to, amount);
        }
    }

    /// @dev Trusted treasuries: plain push, revert on failure.
    function _push(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ================================================================ admin

    function setPotatoToken(address _token) external onlyOwner {
        if (_token == address(0)) revert ZeroAddress();
        potatoToken = IPotatoToken(_token);
    }

    /// @notice Set the $POTATO/ETH conversion rate (18 decimals).
    ///         Replace with an on-chain TWAP before mainnet.
    function setPotatoPerEth(uint256 rate) external onlyOwner {
        potatoPerEth = rate;
    }

    function setTreasuries(address _protocol, address _dev) external onlyOwner {
        if (_protocol == address(0) || _dev == address(0)) revert ZeroAddress();
        protocolTreasury = _protocol;
        devTreasury = _dev;
    }

    function setRoundDuration(uint256 seconds_) external onlyOwner {
        require(seconds_ >= 5 && seconds_ <= 300, "5s-300s");
        roundDuration = seconds_;
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = IPotatoOracle(_oracle); // zero address = fall back to rate
    }

    function setSwapRouter(address _router, address _weth) external onlyOwner {
        if (_router == address(0) || _weth == address(0)) revert ZeroAddress();
        swapRouter = ISwapRouterV2(_router);
        weth = _weth;
    }

    // ================================================================ side-pot

    /// @notice Convert the $POTATO tax side-pot (2% of every taxed swap lands
    ///         here as tokens) into ETH for the jackpot. The router pays ETH
    ///         to this contract, and receive() routes it into jackpotPool.
    ///         Owner-only with a caller-supplied minimum to prevent sandwich
    ///         extraction; run it from a keeper on a schedule.
    function harvestSidepot(uint256 minEthOut) external onlyOwner nonReentrant {
        uint256 bal = potatoToken.balanceOf(address(this));
        if (bal == 0) return;
        potatoToken.approve(address(swapRouter), bal);
        address[] memory path = new address[](2);
        path[0] = address(potatoToken);
        path[1] = weth;
        swapRouter.swapExactTokensForETH(bal, minEthOut, path, address(this), block.timestamp);
    }
}
