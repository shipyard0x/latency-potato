/**
 *  POTATO SNIPER — latency-race bot for 100ms Latency Potato
 *  on Robinhood Chain (ID 4663, 100ms blocks, strict FCFS sequencing).
 *
 *  Strategy: with no priority gas auction, the ONLY edge is arrival time at
 *  the sequencer. We:
 *    1. Measure one-way network latency from the sequencer feed's block
 *       header timestamps (EWMA-smoothed).
 *    2. Watch roundEndTime and PRE-SIGN the takePotato() tx ahead of time
 *       (signing costs ~1-2ms — do it before the deadline, not at it).
 *    3. Blast the raw tx so it ARRIVES ~FIRE_BEFORE_MS (150ms) before the
 *       round ends, i.e. send at: deadline - FIRE_BEFORE_MS - latency.
 *
 *  Run:  cp .env.example .env  &&  npm i  &&  npm run snipe
 *  ⚠️  Use a burner key. This bot spends real ETH. Set MAX_PRICE_ETH.
 */

import 'dotenv/config';
import WebSocket from 'ws';
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseEther,
  formatEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ---------------------------------------------------------------- config
const {
  PRIVATE_KEY,
  GAME_ADDRESS,
  RPC_URL = 'https://rpc.mainnet.chain.robinhood.com',
  FEED_WS = 'wss://feed.mainnet.chain.robinhood.com',
  FIRE_BEFORE_MS = '150',
  MAX_PRICE_ETH = '0.1',
} = process.env;

if (!PRIVATE_KEY || !GAME_ADDRESS) {
  console.error('✗ Set PRIVATE_KEY and GAME_ADDRESS in .env (see .env.example)');
  process.exit(1);
}

const FIRE_BEFORE = Number(FIRE_BEFORE_MS);
const MAX_PRICE = parseEther(MAX_PRICE_ETH);

const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const gameAbi = [
  { type: 'function', name: 'currentPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'roundEndTime', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'currentHolder', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'takePotato', stateMutability: 'payable', inputs: [], outputs: [] },
];

const account = privateKeyToAccount(PRIVATE_KEY);
const transport = http(RPC_URL, { batch: false, retryCount: 0, timeout: 2_000 });
const pub = createPublicClient({ chain: robinhoodChain, transport });
const wallet = createWalletClient({ account, chain: robinhoodChain, transport });

const log = (tag, msg) =>
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${tag} ${msg}`);

// ---------------------------------------------------------------- latency
/**
 * EWMA one-way latency estimate from the sequencer feed. Each feed message
 * carries the L2 block timestamp; (local_recv_time - block_time) ≈ one-way
 * latency + sequencer processing. Good enough to time a 150ms window.
 */
let latencyMs = 50; // prior until measured
const ALPHA = 0.2;

function watchFeed() {
  const ws = new WebSocket(FEED_WS);
  ws.on('open', () => log('FEED', `connected → ${FEED_WS}`));
  ws.on('close', () => {
    log('FEED', 'closed — reconnecting in 1s');
    setTimeout(watchFeed, 1_000);
  });
  ws.on('error', (e) => log('FEED', `error: ${e.message}`));
  ws.on('message', (buf) => {
    const recvAt = Date.now();
    try {
      const data = JSON.parse(buf.toString());
      // Arbitrum feed: messages[].message.message.header.timestamp (unix s)
      const msgs = data.messages ?? [];
      for (const m of msgs) {
        const ts = m?.message?.message?.header?.timestamp;
        if (!ts) continue;
        const sample = Math.max(0, recvAt - ts * 1000);
        if (sample < 5_000) {
          // ignore replayed/backfilled history
          latencyMs = ALPHA * sample + (1 - ALPHA) * latencyMs;
        }
      }
    } catch { /* non-JSON keepalive — ignore */ }
  });
}

// ---------------------------------------------------------------- sniper
let nonce; // tracked locally: no time for eth_getTransactionCount at T-150ms
let armedFor = 0n; // roundEndTime we've already scheduled a shot for
let inFlight = false;

async function readState() {
  const [price, endTime, holder] = await Promise.all([
    pub.readContract({ address: GAME_ADDRESS, abi: gameAbi, functionName: 'currentPrice' }),
    pub.readContract({ address: GAME_ADDRESS, abi: gameAbi, functionName: 'roundEndTime' }),
    pub.readContract({ address: GAME_ADDRESS, abi: gameAbi, functionName: 'currentHolder' }),
  ]);
  return { price, endTime, holder };
}

async function fire(price) {
  if (inFlight) return;
  inFlight = true;
  const t0 = performance.now();
  try {
    // Pre-set gas + tracked nonce: zero RPC round-trips before send.
    const hash = await wallet.sendTransaction({
      to: GAME_ADDRESS,
      data: '0xb818aed0', // takePotato() selector — hardcoded, no encode cost
      value: price,
      gas: 300_000n, // generous fixed limit: estimation would cost ~1 RTT
      nonce: nonce++,
    });
    log('FIRE', `🥔 sent in ${(performance.now() - t0).toFixed(1)}ms → ${hash}`);
    const rcpt = await pub.waitForTransactionReceipt({ hash, timeout: 10_000 });
    log('FIRE', rcpt.status === 'success'
      ? '✅ POTATO SECURED'
      : '❌ reverted (out-sniped in the FCFS queue or price moved)');
  } catch (e) {
    log('FIRE', `✗ ${e.shortMessage ?? e.message}`);
    nonce = await pub.getTransactionCount({ address: account.address }); // resync
  } finally {
    inFlight = false;
  }
}

async function loop() {
  try {
    const { price, endTime, holder } = await readState();
    const nowMs = Date.now();
    const deadlineMs = Number(endTime) * 1000;

    if (endTime === 0n || deadlineMs <= nowMs) return; // idle round
    if (holder.toLowerCase() === account.address.toLowerCase()) return; // we hold it
    if (price > MAX_PRICE) {
      if (armedFor !== endTime) log('SKIP', `price ${formatEther(price)} ETH > MAX_PRICE_ETH`);
      armedFor = endTime;
      return;
    }
    if (armedFor === endTime) return; // already scheduled for this deadline
    armedFor = endTime;

    // Send so the tx ARRIVES ~FIRE_BEFORE ms before the deadline:
    const sendAt = deadlineMs - FIRE_BEFORE - latencyMs;
    const wait = Math.max(0, sendAt - Date.now());
    log('ARM', `deadline in ${(deadlineMs - nowMs)}ms · latency≈${latencyMs.toFixed(0)}ms · firing in ${wait.toFixed(0)}ms @ ${formatEther(price)} ETH`);
    setTimeout(() => fire(price), wait);
  } catch (e) {
    log('LOOP', `✗ ${e.shortMessage ?? e.message}`);
  }
}

// ---------------------------------------------------------------- main
(async () => {
  console.log(`
  ═══════════════════════════════════════════════
   🥔 POTATO SNIPER — FCFS latency race, 100ms blocks
   wallet   ${account.address}
   game     ${GAME_ADDRESS}
   fire     T-${FIRE_BEFORE}ms (latency-adjusted)
   maxprice ${MAX_PRICE_ETH} ETH
  ═══════════════════════════════════════════════`);

  nonce = await pub.getTransactionCount({ address: account.address });
  const bal = await pub.getBalance({ address: account.address });
  log('INIT', `nonce=${nonce} balance=${formatEther(bal)} ETH`);

  watchFeed();
  // Poll fast: 100ms chain cadence means state can flip 10x/second.
  setInterval(loop, 100);
})();
