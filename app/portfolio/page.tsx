import { PortfolioView } from "@/components/PortfolioView";

export default function PortfolioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
        <p className="mt-1 text-slate-400">Your memecoin holdings on the curve.</p>
      </div>
      <PortfolioView />
    </div>
  );
}
