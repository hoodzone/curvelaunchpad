"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { useToken, useTokenMetadata, useTrades } from "@/lib/hooks";
import { CURRENCY_SYMBOL, explorerAddress, explorerToken } from "@/lib/chain";
import { fmtEth, fmtPrice, shortAddr, timeAgo } from "@/lib/format";
import { TokenAvatar } from "./TokenAvatar";
import { BondingCurveProgress } from "./BondingCurveProgress";
import { BuySellWidget } from "./BuySellWidget";
import { PriceChart } from "./PriceChart";
import { TradesFeed } from "./TradesFeed";

export function TokenDetail({ address }: { address: string }) {
  const { data, isLoading, isError, refetch } = useToken(address);
  const { data: tradesData, refetch: refetchTrades } = useTrades(address);
  const token = data?.token ?? null;
  const { data: meta } = useTokenMetadata(token?.uri);

  if (isLoading) return <DetailSkeleton />;
  if (isError || !token) {
    return (
      <div className="card p-10 text-center">
        <h2 className="text-lg font-semibold">Token not found</h2>
        <p className="mt-1 text-sm text-slate-400">
          This address isn&apos;t a launched token, or the RPC is unreachable.
        </p>
        <Link href="/" className="btn-ghost mt-4">
          Back to explore
        </Link>
      </div>
    );
  }

  const trades = tradesData?.trades ?? [];
  const priceWei = BigInt(token.priceWei);
  const raised = fmtEth(BigInt(token.pool.ethReserve));
  const target = fmtEth(BigInt(token.pool.graduationTarget));

  const onTraded = () => {
    refetch();
    refetchTrades();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <TokenAvatar address={token.address} symbol={token.symbol} image={meta?.image} size={64} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{token.name}</h1>
              <span className="chip bg-white/5 text-slate-300">${token.symbol}</span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm text-slate-400">
              <span>
                by{" "}
                <a
                  href={explorerAddress(token.creator)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono hover:text-brand-400"
                >
                  {shortAddr(token.creator)}
                </a>
              </span>
              <span>·</span>
              <span>{timeAgo(token.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">Price</div>
          <div className="text-xl font-bold">
            {fmtPrice(priceWei)} {CURRENCY_SYMBOL}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left column */}
        <div className="space-y-6">
          <div className="card p-4">
            <PriceChart trades={trades} currentPriceWei={priceWei} />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Market cap" value={`${fmtEth(BigInt(token.marketCapWei))} ${CURRENCY_SYMBOL}`} />
            <Stat label="Raised" value={`${raised} / ${target}`} />
            <Stat label="Curve" value={`${(token.progressBps / 100).toFixed(1)}%`} />
            <Stat
              label="Status"
              value={token.pool.graduated ? "Graduated" : token.pool.halted ? "Filling LP" : "Live"}
              accent={token.pool.graduated}
            />
          </div>

          {/* Curve progress */}
          <div className="card p-5">
            <BondingCurveProgress
              progressBps={token.progressBps}
              graduated={token.pool.graduated}
              halted={token.pool.halted}
            />
            <p className="mt-3 text-xs text-slate-500">
              When the curve raises {target} {CURRENCY_SYMBOL}, liquidity migrates to the DEX and LP
              tokens are burned — locking liquidity forever.
            </p>
          </div>

          {/* About + socials */}
          {(meta?.description || meta?.website || meta?.twitter || meta?.telegram) && (
            <div className="card p-5">
              <h3 className="mb-2 font-semibold">About</h3>
              {meta?.description && <p className="text-sm text-slate-300">{meta.description}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {meta?.website && <SocialLink href={meta.website} label="Website" />}
                {meta?.twitter && <SocialLink href={normalizeTwitter(meta.twitter)} label="Twitter" />}
                {meta?.telegram && <SocialLink href={normalizeTelegram(meta.telegram)} label="Telegram" />}
                <a href={explorerToken(token.address)} target="_blank" rel="noopener noreferrer" className="chip bg-white/5 hover:bg-white/10">
                  Explorer ↗
                </a>
              </div>
            </div>
          )}

          {/* Trades */}
          <div className="card p-5">
            <h3 className="mb-2 font-semibold">Trades</h3>
            <TradesFeed trades={trades} symbol={token.symbol} />
          </div>
        </div>

        {/* Right column */}
        <div className="lg:sticky lg:top-20 lg:h-fit">
          <BuySellWidget token={token} onTraded={onTraded} />
          <div className="mt-3 break-all rounded-xl bg-ink-850 p-3 text-xs text-slate-500">
            Contract:{" "}
            <a href={explorerToken(token.address)} target="_blank" rel="noopener noreferrer" className="font-mono hover:text-brand-400">
              {token.address}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 truncate font-semibold ${accent ? "text-brand-500" : "text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="chip bg-white/5 hover:bg-white/10">
      {label} ↗
    </a>
  );
}

function normalizeTwitter(t: string) {
  if (/^https?:\/\//.test(t)) return t;
  return `https://x.com/${t.replace(/^@/, "")}`;
}
function normalizeTelegram(t: string) {
  if (/^https?:\/\//.test(t)) return t;
  return `https://t.me/${t.replace(/^@/, "").replace(/^t\.me\//, "")}`;
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="skeleton h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <div className="skeleton h-6 w-40 rounded" />
          <div className="skeleton h-4 w-24 rounded" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="skeleton h-[260px] rounded-2xl" />
        <div className="skeleton h-[420px] rounded-2xl" />
      </div>
    </div>
  );
}
