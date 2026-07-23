import Link from "next/link";
import { TokenGrid } from "@/components/TokenGrid";
import { CHAIN_NAME } from "@/lib/chain";

export default function HomePage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-ink-850 to-ink-900 px-6 py-12 sm:px-10 sm:py-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative max-w-2xl">
          <div className="chip mb-4 bg-brand-500/10 text-brand-400">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse-glow" />
            Live on {CHAIN_NAME}
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Launch a memecoin in <span className="text-brand-500">30 seconds.</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-300">
            Fair launches on a bonding curve — no presale, no team allocation. Every token starts at
            the same price and graduates to the DEX once it fills the curve.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/create" className="btn-brand">
              🚀 Launch a token
            </Link>
            <a href="#explore" className="btn-ghost">
              Explore tokens
            </a>
          </div>
        </div>
      </section>

      {/* Explore */}
      <section id="explore" className="scroll-mt-20">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold">Explore</h2>
            <p className="text-sm text-slate-400">Fresh launches and climbing curves.</p>
          </div>
        </div>
        <TokenGrid />
      </section>
    </div>
  );
}
