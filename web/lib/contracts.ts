import type { Address } from "viem";
import { launchpadAbi } from "./abi/launchpad";
import { memeTokenAbi } from "./abi/memeToken";

export const LAUNCHPAD_ADDRESS = (process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

export const LAUNCHPAD_DEPLOY_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK ?? "0"
);

export const isLaunchpadConfigured =
  LAUNCHPAD_ADDRESS !== "0x0000000000000000000000000000000000000000";

export { launchpadAbi, memeTokenAbi };
