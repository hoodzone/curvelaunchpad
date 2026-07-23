import "server-only";
import { createPublicClient, http, type Address, parseAbiItem, getAddress } from "viem";
import { robinhoodChain, RPC_URL } from "./chain";
import { launchpadAbi } from "./abi/launchpad";
import { memeTokenAbi } from "./abi/memeToken";
import { LAUNCHPAD_ADDRESS, LAUNCHPAD_DEPLOY_BLOCK, isLaunchpadConfigured } from "./contracts";
import { marketCapWei, priceWei, progressBps } from "./curve";
import type { TokenSummary, TradeItem } from "./types";

/** Server-side viem client. Prefers a private RPC_URL to avoid public rate limits. */
export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.RPC_URL || RPC_URL),
});

export { isLaunchpadConfigured, LAUNCHPAD_ADDRESS };

const tokenCreatedEvent = parseAbiItem(
  "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, string uri, uint256 graduationTarget, uint256 timestamp)"
);

const tradeEvent = parseAbiItem(
  "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 feeAmount, uint256 virtualEth, uint256 virtualToken, uint256 ethReserve, uint256 timestamp)"
);

/** Read the platform fee (bps) once; cheap and rarely changes. */
async function feeBps(): Promise<bigint> {
  return publicClient.readContract({
    address: LAUNCHPAD_ADDRESS,
    abi: launchpadAbi,
    functionName: "feeBps",
  });
}

/** All launched token addresses, newest first (paginated on-chain). */
export async function listTokenAddresses(offset = 0n, limit = 60n): Promise<Address[]> {
  if (!isLaunchpadConfigured) return [];
  const page = (await publicClient.readContract({
    address: LAUNCHPAD_ADDRESS,
    abi: launchpadAbi,
    functionName: "getTokens",
    args: [offset, limit],
  })) as readonly Address[];
  return [...page];
}

/** Build a full TokenSummary for one token from on-chain state + creation event. */
export async function getTokenSummary(tokenRaw: string): Promise<TokenSummary | null> {
  if (!isLaunchpadConfigured) return null;
  let token: Address;
  try {
    token = getAddress(tokenRaw);
  } catch {
    return null;
  }

  const [pool, name, symbol, uri] = await Promise.all([
    publicClient.readContract({
      address: LAUNCHPAD_ADDRESS,
      abi: launchpadAbi,
      functionName: "getPool",
      args: [token],
    }),
    publicClient.readContract({ address: token, abi: memeTokenAbi, functionName: "name" }),
    publicClient.readContract({ address: token, abi: memeTokenAbi, functionName: "symbol" }),
    publicClient
      .readContract({ address: token, abi: memeTokenAbi, functionName: "tokenURI" })
      .catch(() => ""),
  ]);

  const p = pool as unknown as {
    token: Address;
    creator: Address;
    virtualEth: bigint;
    virtualToken: bigint;
    ethReserve: bigint;
    graduationTarget: bigint;
    createdAt: bigint;
    halted: boolean;
    graduated: boolean;
  };

  if (p.token === "0x0000000000000000000000000000000000000000") return null;

  const price = priceWei(p.virtualEth, p.virtualToken);
  return {
    address: token,
    name: name as string,
    symbol: symbol as string,
    uri: uri as string,
    creator: p.creator,
    createdAt: Number(p.createdAt),
    pool: {
      virtualEth: p.virtualEth.toString(),
      virtualToken: p.virtualToken.toString(),
      ethReserve: p.ethReserve.toString(),
      graduationTarget: p.graduationTarget.toString(),
      halted: p.halted,
      graduated: p.graduated,
    },
    priceWei: price.toString(),
    marketCapWei: marketCapWei(price).toString(),
    progressBps: progressBps(p.ethReserve, p.graduationTarget),
  };
}

export async function listTokenSummaries(offset = 0n, limit = 60n): Promise<TokenSummary[]> {
  const addrs = await listTokenAddresses(offset, limit);
  const summaries = await Promise.all(addrs.map((a) => getTokenSummary(a).catch(() => null)));
  return summaries.filter((s): s is TokenSummary => s !== null);
}

/**
 * Fetch recent Trade events for a token by scanning logs from the deploy block.
 * On a young chain with modest volume this is fine; swap in a dedicated indexer
 * (Ponder/Subsquid) for high-traffic production use.
 */
export async function getTrades(tokenRaw: string, limit = 50): Promise<TradeItem[]> {
  if (!isLaunchpadConfigured) return [];
  let token: Address;
  try {
    token = getAddress(tokenRaw);
  } catch {
    return [];
  }

  const logs = await publicClient.getLogs({
    address: LAUNCHPAD_ADDRESS,
    event: tradeEvent,
    args: { token },
    fromBlock: LAUNCHPAD_DEPLOY_BLOCK,
    toBlock: "latest",
  });

  const items: TradeItem[] = logs.map((log) => {
    const a = log.args as {
      trader: Address;
      isBuy: boolean;
      ethAmount: bigint;
      tokenAmount: bigint;
      feeAmount: bigint;
      virtualEth: bigint;
      virtualToken: bigint;
      timestamp: bigint;
    };
    return {
      token,
      trader: a.trader,
      isBuy: a.isBuy,
      ethAmount: a.ethAmount.toString(),
      tokenAmount: a.tokenAmount.toString(),
      feeAmount: a.feeAmount.toString(),
      priceWei: priceWei(a.virtualEth, a.virtualToken).toString(),
      blockNumber: Number(log.blockNumber),
      timestamp: Number(a.timestamp),
      txHash: log.transactionHash,
    };
  });

  // newest first
  items.sort((x, y) => y.blockNumber - x.blockNumber || y.timestamp - x.timestamp);
  return items.slice(0, limit);
}

export { feeBps };
