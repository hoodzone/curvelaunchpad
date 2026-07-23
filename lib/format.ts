import { formatUnits } from "viem";

/** Compact number formatting: 1234 -> "1.23K", 1.2e6 -> "1.2M". */
export function compact(n: number, digits = 2): string {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs < 1000) {
    return trimZeros(n.toFixed(abs < 1 ? Math.max(digits, 4) : digits));
  }
  const units = [
    { v: 1e12, s: "T" },
    { v: 1e9, s: "B" },
    { v: 1e6, s: "M" },
    { v: 1e3, s: "K" },
  ];
  for (const u of units) {
    if (abs >= u.v) return trimZeros((n / u.v).toFixed(digits)) + u.s;
  }
  return n.toFixed(digits);
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Format a wei value as an ETH string with sensible precision. */
export function fmtEth(wei: bigint, maxFrac = 4): string {
  const n = Number(formatUnits(wei, 18));
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  return trimZeros(n.toFixed(maxFrac));
}

/** Format a token amount (18 decimals) compactly. */
export function fmtToken(wei: bigint): string {
  return compact(Number(formatUnits(wei, 18)));
}

/** Wei-per-token price to a readable ETH string (handles very small prices). */
export function fmtPrice(priceWei: bigint): string {
  const n = Number(formatUnits(priceWei, 18));
  if (n === 0) return "0";
  if (n < 1e-6) return n.toExponential(2);
  return trimZeros(n.toFixed(9));
}

export function shortAddr(addr: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

export function timeAgo(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const s = Math.max(0, now - unixSeconds);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Deterministic gradient for a token avatar fallback, from its address. */
export function avatarGradient(addr: string): string {
  const h1 = parseInt(addr.slice(2, 8), 16) % 360;
  const h2 = (h1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${h1} 80% 55%), hsl(${h2} 80% 45%))`;
}
