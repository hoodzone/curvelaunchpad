"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTokens } from "@/lib/hooks";
import type { TokenSummary } from "@/lib/types";
import { TokenCard } from "./TokenCard";

type SortKey = "new" | "mcap" | "progress";

export function TokenGrid() {
  const { data, isLoading, isError } = useTokens();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("new");

  const tokens = useMemo(() => {
    let list: TokenSummary[] = data?.tokens ?? [];
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(needle) ||
          t.symbol.toLowerCase().includes(needle) ||
          t.address.toLowerCase().includes(needle)
      );
    }
    const sorted = [...list];
    if (sort === "mcap") {
      sorted.sort((a, b) => Number(BigInt(b.marketCapWei) - BigInt(a.marketCapWei)));
    } else if (sort === "progress") {
      sorted.sort((a, b) => b.progressBps - a.progressBps);
    } else {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
    }
    return sorted;
  }, [data, q, sort]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          className="input sm:max-w-xs"
          placeholder="Search name, symbol, or address…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 text-sm">
          {(["new", "mcap", "progress"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`rounded-lg px-3 py-1.5 capitalize transition ${
                sort === k ? "bg-brand-500 text-ink-950 font-semibold" : "text-slate-300 hover:bg-white/5"
              }`}
            >
              {k === "mcap" ? "Market cap" : k}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : isError ? (
        <div className="card p-8 text-center text-slate-400">
          Couldn&apos;t reach the RPC. Check your network settings and try again.
        </div>
      ) : tokens.length === 0 ? (
        <EmptyState hasQuery={!!q.trim()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tokens.map((t) => (
            <div key={t.address} className="animate-fade-up">
              <TokenCard token={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card h-40 p-4">
          <div className="skeleton h-11 w-11 rounded-full" />
          <div className="skeleton mt-3 h-4 w-2/3 rounded" />
          <div className="skeleton mt-2 h-3 w-full rounded" />
          <div className="skeleton mt-4 h-2.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-12 text-center">
      <div className="text-4xl">🪙</div>
      <h3 className="text-lg font-semibold">{hasQuery ? "No matches" : "No tokens yet"}</h3>
      <p className="max-w-sm text-sm text-slate-400">
        {hasQuery
          ? "Try a different search."
          : "Be the first to launch a memecoin on the curve. It takes about 30 seconds."}
      </p>
      {!hasQuery && (
        <Link href="/create" className="btn-brand mt-2">
          + Launch the first token
        </Link>
      )}
    </div>
  );
}

