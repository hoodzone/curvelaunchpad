"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { useTokens } from "@/lib/hooks";
import { memeTokenAbi } from "@/lib/contracts";
import { CURRENCY_SYMBOL } from "@/lib/chain";
import { fmtEth, fmtToken } from "@/lib/format";
import { TokenAvatar } from "./TokenAvatar";
import { WalletButton } from "./WalletButton";
import type { TokenSummary } from "@/lib/types";

export function PortfolioView() {
  const { address, isConnected } = useAccount();
  const { data, isLoading } = useTokens();
  const tokens: TokenSummary[] = data?.tokens ?? [];

  const { data: balances } = useReadContracts({
    contracts: tokens.map((t) => ({
      address: t.address as Address,
      abi: memeTokenAbi,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
    })),
    query: { enabled: !!address && tokens.length > 0 },
  });

  const holdings = useMemo(() => {
    if (!balances) return [];
    return tokens
      .map((t, i) => {
        const bal = (balances[i]?.result as bigint | undefined) ?? 0n;
        const price = BigInt(t.priceWei);
        const valueWei = (bal * price) / 10n ** 18n;
        return { token: t, balance: bal, valueWei };
      })
      .filter((h) => h.balance > 0n)
      .sort((a, b) => Number(b.valueWei - a.valueWei));
  }, [balances, tokens]);

  const total = holdings.reduce((acc, h) => acc + h.valueWei, 0n);

  if (!isConnected) {
    return (
      <div className="card flex flex-col items-center gap-4 p-12 text-center">
        <div className="text-4xl">👛</div>
        <h2 className="text-lg font-semibold">Connect your wallet</h2>
        <p className="max-w-sm text-sm text-slate-400">
          See the memecoins you hold and their current value on the curve.
        </p>
        <WalletButton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card flex items-center justify-between p-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Portfolio value</div>
          <div className="text-3xl font-bold">
            {fmtEth(total)} <span className="text-lg text-slate-400">{CURRENCY_SYMBOL}</span>
          </div>
        </div>
        <div className="text-right text-sm text-slate-400">
          {holdings.length} token{holdings.length === 1 ? "" : "s"}
        </div>
      </div>

      {isLoading ? (
        <div className="card h-40 skeleton rounded-2xl" />
      ) : holdings.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <div className="text-3xl">🫙</div>
          <p className="text-sm text-slate-400">You don&apos;t hold any launchpad tokens yet.</p>
          <Link href="/" className="btn-brand mt-1">
            Explore tokens
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-white/5">
          {holdings.map((h) => (
            <Link
              key={h.token.address}
              href={`/token/${h.token.address}`}
              className="flex items-center justify-between p-4 transition hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3">
                <TokenAvatar address={h.token.address} symbol={h.token.symbol} />
                <div>
                  <div className="font-semibold">{h.token.name}</div>
                  <div className="text-sm text-slate-400">
                    {fmtToken(h.balance)} {h.token.symbol}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">
                  {fmtEth(h.valueWei)} {CURRENCY_SYMBOL}
                </div>
                <div className="text-xs text-slate-500">
                  {h.token.pool.graduated ? "Graduated" : `${(h.token.progressBps / 100).toFixed(0)}% curve`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
