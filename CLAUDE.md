# Latency Potato — deployment runbook

Hot-potato latency game for Robinhood Chain (ID 4663, 100ms blocks, FCFS
sequencing). Contracts are tested (21/21) and compile on solc 0.8.28 (cancun).

## Layout

```
contracts/   LatencyPotato.sol (game), PotatoToken.sol (optional token),
             PotatoTwapOracle.sol (V3 TWAP), TestMocks.sol (tests only)
test/        hardhat test suite — run before ANY deploy
scripts/     deploy.js — deploys + wires everything
frontend/    Vite + React + wagmi app
bot/         FCFS sniper bot (Node/viem)
```

## Deploy procedure (mainnet)

The user launches $POTATO on a launchpad and provides the token CA.

1. `npm install` (root). If solc download fails, it's pinned in devDeps.
2. `npm test` — all 21 must pass. Do not deploy on any failure.
3. Copy `.env.example` → `.env`. ASK THE USER for: PRIVATE_KEY,
   PROTOCOL_TREASURY, DEV_TREASURY, TOKEN_CA (launchpad token address).
   Never invent or guess these values. Never commit `.env`.
4. Confirm with the user this is a MAINNET deploy with real funds, then:
   `npx hardhat run scripts/deploy.js --network robinhood`
5. Take the printed GAME_ADDRESS / TOKEN_ADDRESS and paste into:
   - `frontend/src/config.js` → GAME_ADDRESS, TOKEN_ADDRESS
   - `bot/.env` (copy from bot/.env.example) → GAME_ADDRESS
6. `cd frontend && npm install && npm run build` — verify it builds, then
   `npm run dev` for the user to smoke-test against mainnet.
7. Smoke test on-chain (small money): call `takePotato()` with exactly
   `currentPrice()` (0.005 ETH), verify holder/price/timer update, then either
   let it expire and `settleRound()` or have a second wallet steal it.

## Post-launch (once a DEX pool exists for the token)

- Deploy `PotatoTwapOracle(pool, token, weth, 300)`; call `game.setOracle(it)`.
  Until then the token-payment path uses owner-set POTATO_PER_ETH — keep it
  honest or the 5% discount path misprices.
- `game.setSwapRouter(router, weth)` enables `harvestSidepot(minEthOut)`.

## Key mechanics (for reference)

- Steal price = last price × 1.10. Split: 105% refund to robbed player,
  3% jackpot, 2% protocol treasury.
- Settlement: 50% winner / 40% rollover / 10% dev treasury. Price resets.
- Token payment path: 5% discount, tokens sent to dead address, refund drawn
  from jackpotPool (reverts if pool can't cover 107% of last price — expected
  early in a round).

## Safety rules for the deploying agent

- Run the full test suite before deploying. Never skip.
- Never print, log, or echo PRIVATE_KEY.
- Confirm treasury addresses with the user before deploying — they are hard
  to change socially even though setTreasuries() exists.
- This is unaudited code going to mainnet at the user's explicit request —
  remind them once, then proceed if they confirm.
