import { type HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";

const RPC_URL = process.env.ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const TESTNET_RPC_URL =
  process.env.ROBINHOOD_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Needed by Launchpad.buy/sell (many locals + rich Trade event).
      viaIR: true,
      // Robinhood Chain runs the Arbitrum Nitro stack; "shanghai" is safe.
      evmVersion: "shanghai",
    },
  },
  networks: {
    // Robinhood Chain mainnet (chainId 4663, native gas token ETH).
    robinhood: {
      url: RPC_URL,
      chainId: 4663,
      accounts,
    },
    robinhoodTestnet: {
      url: TESTNET_RPC_URL,
      chainId: Number(process.env.ROBINHOOD_TESTNET_CHAIN_ID ?? 46630),
      accounts,
    },
  },
};

export default config;
