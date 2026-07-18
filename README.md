# Latency Potato

A hot-potato latency race for a chain with **100ms blocks and strict FCFS
sequencing** — no priority gas auction, so the only edge is wire speed.

## Layout

```
contracts/
  PotatoToken.sol    ERC-20 + Permit, 1B supply, 3% swap tax (1% burn / 2% jackpot)
  LatencyPotato.sol  Game: 30s rounds, +10% price/take, +5% instant profit,
                     3% jackpot / 2% protocol split, 50/40/10 settlement
frontend/            Vite + React + Tailwind + wagmi/viem, vaporwave CRT UI
bot/                 Node.js/viem FCFS sniper (fires T-150ms, latency-adjusted)
```

## Deploy (Foundry example)

```bash
forge create contracts/PotatoToken.sol:PotatoToken --rpc-url $RPC --private-key $PK
forge create contracts/LatencyPotato.sol:LatencyPotato \
  --constructor-args $PROTOCOL_TREASURY $DEV_TREASURY --rpc-url $RPC --private-key $PK

# Wire them together:
cast send $TOKEN "setGameContract(address)" $GAME ...
cast send $GAME  "setPotatoToken(address)" $TOKEN ...
cast send $GAME  "setPotatoPerEth(uint256)" 1000000000000000000000000 ...  # 1M POTATO/ETH
cast send $TOKEN "setAmmPool(address,bool)" $UNISWAP_POOL true ...
```

Then paste the addresses into `frontend/src/config.js` and `bot/.env`.

## Run

```bash
# Frontend
cd frontend && npm i && npm run dev

# Sniper bot (burner wallet only!)
cd bot && cp .env.example .env  # fill in key + game address
npm i && npm run snipe
```

## Test suite

21 tests, all passing (`npm i && npm test`): token supply/tax/permit, full game
lifecycle, settlement splits, auto-settle, griefing escrow, POTATO payment
path, oracle override, side-pot harvest, and a solvency invariant.

Two bugs the suite caught and fixed:
1. Settlement briefly credited the winner an unfunded "buy-in back" — removed.
2. The POTATO path credited a phantom 3% jackpot cut with no ETH behind it —
   now only credited on the ETH path.

## Design notes & caveats

- **Payment math**: each take pays `lastPaid × 1.10`. Split vs `lastPaid`:
  105% refund to previous holder, 3% jackpot, 2% protocol — sums exactly to
  the 110% paid. First take of a round seeds the jackpot with the full buy-in.
- **$POTATO path**: tokens are **burned**; the previous holder's ETH refund is
  drawn from `jackpotPool` (reverts with `InsufficientJackpotLiquidity` if the
  pool can't cover it). `potatoPerEth` is owner-set — swap in a TWAP oracle
  before mainnet or it's a manipulation vector.
- **Griefing resistance**: refunds are push-with-escrow — a contract that
  reverts in `receive()` can't freeze the game; its funds sit in
  `pendingWithdrawals` (call `withdraw()`).
- **Token tax**: the 2% game share arrives as $POTATO tokens (a side-pot held
  by the game); the game's `receive()` separately routes any **ETH** sent to
  it (e.g. from a tax-swap keeper) 100% into `jackpotPool`.
- **POTATO path needs pool liquidity**: paying in tokens draws the previous
  holder's refund (105%) + protocol cut (2%) from `jackpotPool`. Right after a
  fresh round the pool holds only 100% of the buy-in, so the token path
  reverts until tax inflow/donations top it up — by design, not a bug.
- **Oracle**: deploy `PotatoTwapOracle` (5-min Uniswap V3 TWAP) and call
  `game.setOracle()` — it overrides the owner rate and closes the mispricing
  vector. Owner rate remains as bootstrap fallback.
- **Side-pot**: `game.harvestSidepot(minEthOut)` (owner/keeper) swaps accrued
  POTATO tax through a V2-style router into jackpot ETH.
- **⚠️ UNAUDITED.** Compiles clean on solc 0.8.x + OZ v5, but get a real audit
  before touching mainnet funds. Game mechanics resemble gambling — check
  your jurisdiction's rules before launching.
