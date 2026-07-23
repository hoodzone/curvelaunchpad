/**
 * Client-side mirror of the Launchpad's integer curve math. Used for instant
 * quote previews as the user types. The actual transaction always reads the
 * authoritative on-chain quote and applies a slippage guard, so tiny rounding
 * differences here are cosmetic only.
 */

export const WAD = 10n ** 18n;
export const BPS = 10_000n;

export const TOTAL_SUPPLY = 1_000_000_000n * WAD;
export const INITIAL_VIRTUAL_TOKEN = 1_000_000_000n * WAD;
export const LP_TOKEN_RESERVE = 200_000_000n * WAD;
export const CURVE_SUPPLY = 800_000_000n * WAD;

const mulDivFloor = (a: bigint, b: bigint, c: bigint) => (a * b) / c;

/** Net tokens out for `ethIn` wei (fee-inclusive), mirroring Launchpad.buy. */
export function buyQuote(
  virtualEth: bigint,
  virtualToken: bigint,
  ethIn: bigint,
  feeBps: bigint
): bigint {
  if (ethIn <= 0n) return 0n;
  const fee = mulDivFloor(ethIn, feeBps, BPS);
  const curveEth = ethIn - fee;
  let out = mulDivFloor(virtualToken, curveEth, virtualEth + curveEth);
  const sellable = virtualToken - LP_TOKEN_RESERVE;
  if (out > sellable) out = sellable > 0n ? sellable : 0n;
  return out;
}

/** Net ETH out (wei) for selling `tokenIn`, mirroring Launchpad.sell. */
export function sellQuote(
  virtualEth: bigint,
  virtualToken: bigint,
  ethReserve: bigint,
  tokenIn: bigint,
  feeBps: bigint
): bigint {
  if (tokenIn <= 0n) return 0n;
  let gross = mulDivFloor(virtualEth, tokenIn, virtualToken + tokenIn);
  if (gross > ethReserve) gross = ethReserve;
  const fee = mulDivFloor(gross, feeBps, BPS);
  return gross - fee;
}

/** Spot price: wei per whole (1e18) token. */
export function priceWei(virtualEth: bigint, virtualToken: bigint): bigint {
  if (virtualToken === 0n) return 0n;
  return mulDivFloor(virtualEth, WAD, virtualToken);
}

/** Fully-diluted market cap in wei (price * total supply / 1e18). */
export function marketCapWei(price: bigint): bigint {
  return mulDivFloor(price, TOTAL_SUPPLY, WAD);
}

/** Progress toward graduation in basis points (0..10000). */
export function progressBps(ethReserve: bigint, target: bigint): number {
  if (target === 0n) return 0;
  const bps = (ethReserve * BPS) / target;
  return Number(bps > BPS ? BPS : bps);
}
