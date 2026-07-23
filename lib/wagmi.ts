import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodChain, RPC_URL } from "./chain";

/**
 * wagmi config using the injected connector (MetaMask & friends). MetaMask ships
 * Robinhood Chain support, so no WalletConnect projectId is required. If the
 * user's wallet is on the wrong network the UI prompts an add/switch.
 */
export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [robinhoodChain.id]: http(RPC_URL),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
