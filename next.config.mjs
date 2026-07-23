import { fileURLToPath } from "node:url";

const x402Stub = fileURLToPath(new URL("./stubs/x402.js", import.meta.url));

// Restrict network calls to our own origin + the configured RPC. This is the
// key drainer control: a compromised page can't exfiltrate data or reach a
// malicious endpoint. Computed from the build-time RPC env.
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
let rpcOrigin = "https://rpc.mainnet.chain.robinhood.com";
try {
  rpcOrigin = new URL(rpcUrl).origin;
} catch {
  /* keep default */
}
const isDev = process.env.NODE_ENV !== "production";

// `'unsafe-inline'` is required for Next's inline hydration/RSC scripts under
// static rendering; it is safe here because the app has no HTML-injection sinks
// (no dangerouslySetInnerHTML, all text is React-escaped, all hrefs sanitized),
// and external script src is still blocked (only 'self'). `'unsafe-eval'` is
// added in dev only (React Fast Refresh needs it). The drainer-critical
// directives below (connect-src, frame-ancestors, object-src, base-uri,
// form-action) stay strict.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${rpcOrigin}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

// Security headers applied to every response.
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Extra guard against wallet-draining overlays / embedding.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    // Allow arbitrary token image URLs (creators supply their own), https only.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  webpack: (config, { webpack }) => {
    // The Base Account connector (bundled inside @wagmi/connectors) transitively
    // imports optional @x402/* payment packages we don't install or use. Replace
    // the whole namespace with a harmless stub so the build resolves cleanly.
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^@x402(\/|$)/, x402Stub));
    // Silence optional pretty-printer / ws deps that wallet libs reference.
    config.resolve.fallback = { ...config.resolve.fallback, "pino-pretty": false };
    return config;
  },
};

export default nextConfig;
