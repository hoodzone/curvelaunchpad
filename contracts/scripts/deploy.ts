import { network } from "hardhat";
import { parseEther, formatEther, type Address } from "viem";

/**
 * Deploys the Launchpad to the configured network and prints the address plus
 * the values the frontend needs (NEXT_PUBLIC_LAUNCHPAD_ADDRESS, deploy block).
 *
 * Usage:
 *   pnpm deploy:robinhood        # mainnet (chainId 4663)
 *   pnpm deploy:testnet          # testnet
 */
async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  if (!wallet) {
    throw new Error("No wallet configured. Set DEPLOYER_PRIVATE_KEY in contracts/.env");
  }

  const deployer = wallet.account.address;
  const feeRecipient = (process.env.FEE_RECIPIENT || deployer) as Address;
  const feeBps = BigInt(process.env.FEE_BPS ?? "100");
  const targetRaise = parseEther(process.env.DEFAULT_TARGET_RAISE_ETH ?? "4");

  const balance = await publicClient.getBalance({ address: deployer });
  console.log("Deployer:      ", deployer);
  console.log("Balance:       ", formatEther(balance), "ETH");
  console.log("Fee recipient: ", feeRecipient);
  console.log("Fee (bps):     ", feeBps.toString());
  console.log("Target raise:  ", formatEther(targetRaise), "ETH");

  const blockBefore = await publicClient.getBlockNumber();

  const launchpad = await viem.deployContract("Launchpad", [
    deployer,
    feeRecipient,
    feeBps,
    targetRaise,
  ]);

  console.log("\n✅ Launchpad deployed");
  console.log("Address:       ", launchpad.address);
  console.log("Deploy block:  ", blockBefore.toString());

  const router = process.env.DEX_ROUTER;
  if (router && router !== "") {
    console.log("\nSetting DEX router:", router);
    const hash = await launchpad.write.setDexRouter([router as Address]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log("Router set.");
  } else {
    console.log("\n(No DEX_ROUTER set — graduation will wait until setDexRouter is called.)");
  }

  console.log("\n--- Copy into .env.local (repo root) ---");
  console.log(`NEXT_PUBLIC_LAUNCHPAD_ADDRESS=${launchpad.address}`);
  console.log(`NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK=${blockBefore.toString()}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
