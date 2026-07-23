"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import { launchpadAbi, LAUNCHPAD_ADDRESS, isLaunchpadConfigured } from "./contracts";
import { parseDataUri } from "./metadata";
import { DEMO_MODE, useDemo } from "./demo";
import type { TokenMetadata, TokenSummary, TradeItem } from "./types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

interface TokensResult {
  data?: { tokens: TokenSummary[]; configured: boolean };
  isLoading: boolean;
  isError: boolean;
}
interface TokenResult {
  data?: { token: TokenSummary | null };
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
}
interface TradesResult {
  data?: { trades: TradeItem[] };
  isLoading: boolean;
  refetch: () => unknown;
}

export function useTokens(refetchMs = 8000): TokensResult {
  const demo = useDemo();
  const rq = useQuery({
    queryKey: ["tokens"],
    queryFn: () => getJson<{ tokens: TokenSummary[]; configured: boolean }>("/api/tokens"),
    refetchInterval: refetchMs,
    enabled: !DEMO_MODE,
  });
  if (DEMO_MODE) {
    return { data: { tokens: demo.tokens, configured: true }, isLoading: !demo.ready, isError: false };
  }
  return rq;
}

export function useToken(address: string, refetchMs = 4000): TokenResult {
  const demo = useDemo();
  const rq = useQuery({
    queryKey: ["token", address.toLowerCase()],
    queryFn: () => getJson<{ token: TokenSummary | null }>(`/api/token/${address}`),
    refetchInterval: refetchMs,
    enabled: !DEMO_MODE && !!address,
  });
  if (DEMO_MODE) {
    return {
      data: { token: demo.getToken(address) },
      isLoading: !demo.ready,
      isError: false,
      refetch: () => {},
    };
  }
  return rq;
}

export function useTrades(address: string, refetchMs = 5000): TradesResult {
  const demo = useDemo();
  const rq = useQuery({
    queryKey: ["trades", address.toLowerCase()],
    queryFn: () => getJson<{ trades: TradeItem[] }>(`/api/trades/${address}`),
    refetchInterval: refetchMs,
    enabled: !DEMO_MODE && !!address,
  });
  if (DEMO_MODE) {
    return { data: { trades: demo.getTrades(address) }, isLoading: !demo.ready, refetch: () => {} };
  }
  return rq;
}

/** Platform fee (bps), read live from the launchpad (100 bps default / demo). */
export function useFeeBps(): bigint {
  const { data } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: launchpadAbi,
    functionName: "feeBps",
    query: { enabled: isLaunchpadConfigured, staleTime: 60_000 },
  });
  return (data as bigint | undefined) ?? 100n;
}

/** Resolve a token's metadata JSON. Handles on-chain data: URIs synchronously
 *  and http(s) URIs via fetch (best-effort). */
export function useTokenMetadata(uri?: string) {
  const inline = parseDataUri(uri);
  return useQuery({
    queryKey: ["meta", uri],
    enabled: !!uri && !inline && /^https?:\/\//.test(uri ?? ""),
    staleTime: 5 * 60_000,
    initialData: inline ?? undefined,
    queryFn: async (): Promise<TokenMetadata> => {
      try {
        const res = await fetch(uri!);
        if (!res.ok) return {};
        return (await res.json()) as TokenMetadata;
      } catch {
        return {};
      }
    },
  });
}
