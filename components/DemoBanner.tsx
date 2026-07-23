"use client";

import { DEMO_MODE } from "@/lib/demo";

export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-200 sm:text-sm">
      <span className="font-semibold">Demo mode</span> — the launchpad is simulated in your browser
      (no real transactions). Deploy the contract and set{" "}
      <code className="rounded bg-black/30 px-1 py-0.5">NEXT_PUBLIC_LAUNCHPAD_ADDRESS</code> to go
      live on Robinhood Chain.
    </div>
  );
}
