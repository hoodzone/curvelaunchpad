import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { DemoBanner } from "@/components/DemoBanner";
import { CHAIN_NAME } from "@/lib/chain";

export const metadata: Metadata = {
  title: "CurveLaunch — Memecoin Launchpad on Robinhood Chain",
  description:
    "Launch and trade memecoins on a fair bonding curve. Built for Robinhood Chain.",
  openGraph: {
    title: "CurveLaunch",
    description: "Fair-launch memecoins on a bonding curve — on Robinhood Chain.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <DemoBanner />
          <Header />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
          <footer className="border-t border-white/5 py-8 text-center text-xs text-slate-500">
            <p>
              CurveLaunch runs on {CHAIN_NAME}. Memecoins are high-risk. Nothing here is financial
              advice — do your own research.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
