import Link from "next/link";
import { WalletButton } from "./WalletButton";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 backdrop-blur-lg">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-ink-950 shadow-glow">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 17c4-9 6 3 9-2s3-6 9-9" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">
              Curve<span className="text-brand-500">Launch</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm text-slate-300 sm:flex">
            <Link href="/" className="rounded-lg px-3 py-1.5 hover:bg-white/5">
              Explore
            </Link>
            <Link href="/portfolio" className="rounded-lg px-3 py-1.5 hover:bg-white/5">
              Portfolio
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/create" className="btn-brand hidden sm:inline-flex">
            + Launch Token
          </Link>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
