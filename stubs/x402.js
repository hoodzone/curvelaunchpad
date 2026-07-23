// Stub for the optional @x402/* packages pulled in transitively by the Base
// Account connector inside @wagmi/connectors. This app only uses the `injected`
// connector, so these code paths are never executed. The stub keeps the bundler
// happy without installing Solana/x402 payment dependencies we don't need.
const noop = () => {};
module.exports = new Proxy(noop, {
  get: () => noop,
});
