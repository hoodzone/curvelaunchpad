import type { TokenMetadata } from "./types";

const JSON_DATA_PREFIX = "data:application/json";

/**
 * Encode token metadata as a self-contained on-chain data URI. This avoids any
 * dependency on IPFS/pinning services — the metadata lives directly in the
 * token's `tokenURI`. Keep it small (image is a URL, not embedded bytes).
 */
export function buildTokenUri(meta: TokenMetadata): string {
  const clean: TokenMetadata = {};
  if (meta.image) clean.image = meta.image.trim();
  if (meta.description) clean.description = meta.description.trim().slice(0, 500);
  if (meta.website) clean.website = meta.website.trim();
  if (meta.twitter) clean.twitter = meta.twitter.trim();
  if (meta.telegram) clean.telegram = meta.telegram.trim();
  const json = JSON.stringify(clean);
  // URL-encoded (not base64): keeps the on-chain payload small when it embeds a
  // compressed logo data URI (base64 image inside base64 JSON would bloat ~33%).
  return `${JSON_DATA_PREFIX},${encodeURIComponent(json)}`;
}

/** Synchronously parse a data:application/json URI. Returns null for other schemes. */
export function parseDataUri(uri?: string): TokenMetadata | null {
  if (!uri || !uri.startsWith(JSON_DATA_PREFIX)) return null;
  try {
    const comma = uri.indexOf(",");
    const payload = uri.slice(comma + 1);
    const isB64 = uri.slice(0, comma).includes("base64");
    const json = isB64
      ? typeof window === "undefined"
        ? Buffer.from(payload, "base64").toString("utf8")
        : decodeURIComponent(escape(atob(payload)))
      : decodeURIComponent(payload);
    return JSON.parse(json) as TokenMetadata;
  } catch {
    return null;
  }
}

/** True if a string looks like a usable http(s) or data image URL. */
export function isImageUrl(url?: string): boolean {
  if (!url) return false;
  return /^https?:\/\//.test(url) || url.startsWith("data:image/");
}

/**
 * Return `url` only if it is a safe http(s) link, else null. Blocks
 * `javascript:`, `data:`, and other schemes that would enable XSS when a
 * creator-supplied metadata value is used as an anchor href.
 */
export function safeHttpUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
