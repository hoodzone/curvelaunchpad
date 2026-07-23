export function BondingCurveProgress({
  progressBps,
  graduated,
  halted,
  compact = false,
}: {
  progressBps: number;
  graduated: boolean;
  halted: boolean;
  compact?: boolean;
}) {
  const pct = Math.min(100, progressBps / 100);
  const done = graduated || halted;

  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-slate-400">Bonding curve</span>
          <span className={done ? "font-semibold text-brand-500" : "font-semibold text-slate-200"}>
            {done ? (graduated ? "Graduated 🎓" : "Ready to graduate") : `${pct.toFixed(1)}%`}
          </span>
        </div>
      )}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            done
              ? "bg-gradient-to-r from-brand-600 to-brand-400"
              : "bg-gradient-to-r from-brand-700 via-brand-500 to-brand-400"
          }`}
          style={{ width: `${done ? 100 : Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}
