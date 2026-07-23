import { defineChain } from "viem";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "4663");
export const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Robinhood Chain";
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://robinhoodchain.blockscout.com";
export const CURRENCY_SYMBOL = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL ?? "ETH";

/**
 * Robinhood Chain — an EVM Layer 2 on the Arbitrum Orbit (Nitro) stack.
 * Mainnet went live on 2026-07-01 with chainId 4663 and ETH as the gas token.
 * Every field is env-overridable so a different endpoint / testnet can be used
 * without code changes.
 */
export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: { name: "Ether", symbol: CURRENCY_SYMBOL, decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: EXPLORER_URL },
  },
  testnet: false,
});

export function explorerTx(hash: string) {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerAddress(address: string) {
  return `${EXPLORER_URL}/address/${address}`;
}

export function explorerToken(address: string) {
  return `${EXPLORER_URL}/token/${address}`;
}
