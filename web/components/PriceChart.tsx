"use client";

import { useMemo } from "react";
import { formatUnits } from "viem";
import type { TradeItem } from "@/lib/types";
import { CURRENCY_SYMBOL } from "@/lib/chain";
import { fmtPrice } from "@/lib/format";

/**
 * Lightweight dependency-free price chart. Plots price-after-trade over time as
 * a smooth area line. Falls back to a friendly empty state when there is < 2
 * data points. Includes the current price as the final point.
 */
export function PriceChart({
  trades,
  currentPriceWei,
}: {
  trades: TradeItem[];
  currentPriceWei: bigint;
}) {
  const points = useMemo(() => {
    // trades come newest-first; chart wants oldest-first.
    const series = [...trades]
      .sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp)
      .map((t) => Number(formatUnits(BigInt(t.priceWei), 18)));
    series.push(Number(formatUnits(currentPriceWei, 18)));
    return series;
  }, [trades, currentPriceWei]);

  const W = 600;
  const H = 220;
  const pad = 8;

  if (points.length < 2) {
    return (
      <div className="grid h-[220px] place-items-center rounded-xl bg-ink-850 text-sm text-slate-500">
        Not enough trades to chart yet — be the first to move the price.
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || max || 1;

  const x = (i: number) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);

  const linePath = points.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(2)} ${H - pad} L ${x(0).toFixed(2)} ${H - pad} Z`;

  const up = points[points.length - 1] >= points[0];
  const stroke = up ? "#00e676" : "#f43f5e";

  return (
    <div className="rounded-xl bg-ink-850 p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={pad}
            x2={W - pad}
            y1={pad + g * (H - 2 * pad)}
            y2={pad + g * (H - 2 * pad)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}
        <path d={areaPath} fill="url(#areaFill)" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="4" fill={stroke} />
      </svg>
      <div className="flex justify-between px-1 pt-1 text-[11px] text-slate-500">
        <span>
          low {fmtPrice(BigInt(Math.round(min * 1e18)))} {CURRENCY_SYMBOL}
        </span>
        <span>
          high {fmtPrice(BigInt(Math.round(max * 1e18)))} {CURRENCY_SYMBOL}
        </span>
      </div>
    </div>
  );
}
