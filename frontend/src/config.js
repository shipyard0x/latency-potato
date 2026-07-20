import { http, createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';

// ---------------------------------------------------------------------------
// Robinhood Chain — Arbitrum Orbit L2, 100ms blocks, FCFS sequencing
// ---------------------------------------------------------------------------
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://rpc.mainnet.chain.robinhood.com'],
      webSocket: ['wss://feed.mainnet.chain.robinhood.com'],
    },
  },
});

export const SEQUENCER_FEED_WS = 'wss://feed.mainnet.chain.robinhood.com';

// Deployed on Robinhood Chain mainnet, 2026-07-20:
export const GAME_ADDRESS = '0xE9906122eef7C4aa465e0a1CD03E97cB639C0b06';
export const TOKEN_ADDRESS = '0x227D7245A0498b4e90658b25F31ffe1a9Ab8261D';

/// LatencyPotato.BASE_PRICE — the opening price of every round (0.005 ether).
/// A Solidity `constant`; mirrored here so the UI can price the first grab of
/// a fresh/just-settled round, which the contract always opens at BASE_PRICE.
export const BASE_PRICE = 5000000000000000n;

/// true once real deployed addresses are pasted above — all contract reads
/// are disabled until then so the placeholder zero-address can never crash
/// or spam the RPC.
export const IS_CONFIGURED =
  GAME_ADDRESS !== '0x0000000000000000000000000000000000000000';

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected()],
  transports: {
    [robinhoodChain.id]: http('https://rpc.mainnet.chain.robinhood.com'),
  },
  // Individual eth_calls instead of multicall — the chain may not have
  // multicall3 deployed, and viem throws on chains without it configured.
  batch: { multicall: false },
  // 100ms blocks -> poll aggressively so UI state stays hot
  pollingInterval: 200,
});
