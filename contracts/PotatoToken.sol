// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 *  $POTATO — Deflationary utility token for the 100ms Latency Potato game
 *  on Robinhood Chain (Chain ID 4663, 100ms blocks, FCFS sequencing).
 *
 *  Tax mechanics (swaps only — wallet-to-wallet transfers are tax-free):
 *    - 3% total tax on buys/sells (detected via registered AMM pool addresses)
 *    - 1% burned to the dead address
 *    - 2% sent (in $POTATO) to the LatencyPotato game contract to bolster
 *      the jackpot's $POTATO side-pot
 *
 *  Includes EIP-2612 Permit for gasless approvals.
 *
 *  UNAUDITED — do not deploy with real funds without a professional audit.
 */

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract PotatoToken is ERC20, ERC20Burnable, ERC20Permit, Ownable2Step {
    // ---------------------------------------------------------------- consts
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether; // 1B, 18 dec
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 public constant TAX_BPS = 300;     // 3.00% total swap tax
    uint256 public constant BURN_BPS = 100;    // 1.00% -> dead address
    uint256 public constant JACKPOT_BPS = 200; // 2.00% -> game contract
    uint256 private constant BPS_DENOM = 10_000;

    // ---------------------------------------------------------------- state
    /// @notice LatencyPotato game contract — receives the 2% jackpot tax.
    address public gameContract;

    /// @notice Uniswap V2 pairs / V3 pools flagged as taxable swap venues.
    mapping(address => bool) public isAmmPool;

    /// @notice Addresses exempt from tax (game contract, treasury, router…).
    mapping(address => bool) public isTaxExempt;

    // ---------------------------------------------------------------- events
    event GameContractSet(address indexed game);
    event AmmPoolSet(address indexed pool, bool taxed);
    event TaxExemptSet(address indexed account, bool exempt);
    event SwapTaxed(address indexed from, address indexed to, uint256 burned, uint256 toJackpot);

    // ---------------------------------------------------------------- errors
    error ZeroAddress();

    constructor()
        ERC20("Latency Potato", "POTATO")
        ERC20Permit("Latency Potato")
        Ownable(msg.sender)
    {
        isTaxExempt[msg.sender] = true;
        _mint(msg.sender, TOTAL_SUPPLY);
    }

    // ---------------------------------------------------------------- admin

    /// @notice Point the token at the LatencyPotato game contract.
    ///         The game is automatically tax-exempt so jackpot payouts in
    ///         $POTATO never get re-taxed.
    function setGameContract(address _game) external onlyOwner {
        if (_game == address(0)) revert ZeroAddress();
        gameContract = _game;
        isTaxExempt[_game] = true;
        emit GameContractSet(_game);
    }

    /// @notice Register/unregister a Uniswap V2 pair or V3 pool as a taxed
    ///         swap venue. Buys (pool -> user) and sells (user -> pool) are
    ///         taxed; plain wallet-to-wallet transfers are not.
    function setAmmPool(address pool, bool taxed) external onlyOwner {
        if (pool == address(0)) revert ZeroAddress();
        isAmmPool[pool] = taxed;
        emit AmmPoolSet(pool, taxed);
    }

    function setTaxExempt(address account, bool exempt) external onlyOwner {
        isTaxExempt[account] = exempt;
        emit TaxExemptSet(account, exempt);
    }

    // ---------------------------------------------------------------- tax hook

    /// @dev OZ v5 single transfer hook. Applies the 3% swap tax when either
    ///      side of the transfer is a registered AMM pool, unless either side
    ///      is exempt. Mints/burns (address(0)) are never taxed.
    function _update(address from, address to, uint256 amount) internal override {
        bool isMintOrBurn = from == address(0) || to == address(0);
        bool isSwap = isAmmPool[from] || isAmmPool[to];
        bool exempt = isTaxExempt[from] || isTaxExempt[to];

        if (isMintOrBurn || !isSwap || exempt || gameContract == address(0)) {
            super._update(from, to, amount);
            return;
        }

        uint256 burnAmt = (amount * BURN_BPS) / BPS_DENOM;
        uint256 jackpotAmt = (amount * JACKPOT_BPS) / BPS_DENOM;
        uint256 sendAmt = amount - burnAmt - jackpotAmt;

        super._update(from, DEAD, burnAmt);            // 1% burned forever
        super._update(from, gameContract, jackpotAmt); // 2% -> jackpot side-pot
        super._update(from, to, sendAmt);              // 97% delivered

        emit SwapTaxed(from, to, burnAmt, jackpotAmt);
    }
}
