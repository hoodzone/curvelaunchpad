"use client";

import type { TradeItem } from "@/lib/types";
import { CURRENCY_SYMBOL, explorerAddress, explorerTx } from "@/lib/chain";
import { fmtEth, fmtToken, shortAddr, timeAgo } from "@/lib/format";

export function TradesFeed({ trades, symbol }: { trades: TradeItem[]; symbol: string }) {
  if (trades.length === 0) {
    return (
      <div className="grid place-items-center py-10 text-sm text-slate-500">No trades yet.</div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 font-medium">Account</th>
            <th className="py-2 font-medium">Type</th>
            <th className="py-2 text-right font-medium">{CURRENCY_SYMBOL}</th>
            <th className="py-2 text-right font-medium">{symbol}</th>
            <th className="py-2 text-right font-medium">When</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={`${t.txHash}-${t.tokenAmount}`} className="border-t border-white/5">
              <td className="py-2.5">
                <a
                  href={explorerAddress(t.trader)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-slate-300 hover:text-brand-400"
                >
                  {shortAddr(t.trader)}
                </a>
              </td>
              <td className="py-2.5">
                <span
                  className={`chip ${
                    t.isBuy ? "bg-brand-500/15 text-brand-400" : "bg-rose-500/15 text-rose-300"
                  }`}
                >
                  {t.isBuy ? "Buy" : "Sell"}
                </span>
              </td>
              <td className="py-2.5 text-right font-mono">{fmtEth(BigInt(t.ethAmount))}</td>
              <td className="py-2.5 text-right font-mono">{fmtToken(BigInt(t.tokenAmount))}</td>
              <td className="py-2.5 text-right text-slate-400">
                <a
                  href={explorerTx(t.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand-400"
                >
                  {timeAgo(t.timestamp)}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
