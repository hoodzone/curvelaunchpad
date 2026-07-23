"use client";

import Link from "next/link";
import type { TokenSummary } from "@/lib/types";
import { CURRENCY_SYMBOL } from "@/lib/chain";
import { fmtEth, timeAgo } from "@/lib/format";
import { useTokenMetadata } from "@/lib/hooks";
import { TokenAvatar } from "./TokenAvatar";
import { BondingCurveProgress } from "./BondingCurveProgress";

export function TokenCard({ token }: { token: TokenSummary }) {
  const { data: meta } = useTokenMetadata(token.uri);
  const mcap = fmtEth(BigInt(token.marketCapWei));
  const graduated = token.pool.graduated;
  const halted = token.pool.halted;

  return (
    <Link
      href={`/token/${token.address}`}
      className="card group flex flex-col gap-3 p-4 transition-transform duration-150 hover:-translate-y-0.5 hover:border-brand-500/30"
    >
      <div className="flex items-start gap-3">
        <TokenAvatar address={token.address} symbol={token.symbol} image={meta?.image} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{token.name}</h3>
            <span className="chip bg-white/5 text-slate-300">${token.symbol}</span>
          </div>
          <p className="line-clamp-2 text-xs text-slate-400">
            {meta?.description || "A fresh memecoin on the curve."}
          </p>
        </div>
      </div>

      <BondingCurveProgress
        progressBps={token.progressBps}
        graduated={graduated}
        halted={halted}
        compact
      />

      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-slate-500">MC </span>
          <span className="font-semibold text-slate-200">
            {mcap} {CURRENCY_SYMBOL}
          </span>
        </div>
        <div className="text-slate-500">{timeAgo(token.createdAt)}</div>
      </div>
    </Link>
  );
}
