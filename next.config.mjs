import { fileURLToPath } from "node:url";

const x402Stub = fileURLToPath(new URL("./stubs/x402.js", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Allow arbitrary token image URLs (creators supply their own).
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
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
