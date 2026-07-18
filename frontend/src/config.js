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

// Fill in after deployment:
export const GAME_ADDRESS = '0x0000000000000000000000000000000000000000';
export const TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

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
