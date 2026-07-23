import type { Address } from "viem";

/** On-chain pool state as returned by Launchpad.getPool(). */
export interface PoolState {
  token: Address;
  creator: Address;
  virtualEth: bigint;
  virtualToken: bigint;
  ethReserve: bigint;
  graduationTarget: bigint;
  createdAt: bigint;
  halted: boolean;
  graduated: boolean;
}

/** Everything the UI needs to render a token card / detail header. */
export interface TokenSummary {
  address: Address;
  name: string;
  symbol: string;
  uri: string;
  creator: Address;
  createdAt: number;
  pool: {
    virtualEth: string; // stringified bigint (wei) — JSON-safe
    virtualToken: string;
    ethReserve: string;
    graduationTarget: string;
    halted: boolean;
    graduated: boolean;
  };
  priceWei: string; // wei per whole token
  marketCapWei: string;
  progressBps: number; // 0..10000 toward graduation
}

export interface TradeItem {
  token: Address;
  trader: Address;
  isBuy: boolean;
  ethAmount: string; // wei
  tokenAmount: string;
  feeAmount: string;
  priceWei: string; // wei per whole token after the trade
  blockNumber: number;
  timestamp: number;
  txHash: string;
}

/** Metadata JSON pointed to by a token's `uri` (best-effort, all optional). */
export interface TokenMetadata {
  image?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}
