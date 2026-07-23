// Self-contained deployer for the Launchpad. Compiles with solc-js (no Hardhat
// solc download needed) and deploys with viem. Run it from your OWN machine
// with a funded key — never paste a real private key into a shared session.
//
//   cd contracts
//   pnpm install
//   cp .env.example .env      # fill in DEPLOYER_PRIVATE_KEY etc.
//   node deploy-standalone.mjs
//
import solc from "solc";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, parseEther, formatEther, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Load .env (simple parser so there's no extra dependency).
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(__dirname, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env file — rely on real env vars */
}

// ---- config from env ----
const RPC_URL = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = Number(process.env.ROBINHOOD_CHAIN_ID || 4663);
let PK = process.env.DEPLOYER_PRIVATE_KEY || "";
const FEE_BPS = BigInt(process.env.FEE_BPS ?? "100");
const TARGET = parseEther(process.env.DEFAULT_TARGET_RAISE_ETH ?? "4");
const DEX_ROUTER = process.env.DEX_ROUTER || "";

if (!PK) {
  console.error("❌ Set DEPLOYER_PRIVATE_KEY in contracts/.env (a wallet funded with ETH on Robinhood Chain).");
  process.exit(1);
}
if (!PK.startsWith("0x")) PK = "0x" + PK;

// ---- compile ----
console.log("Compiling contracts (solc 0.8.24, viaIR)…");
const read = (rel) => ({ content: readFileSync(join(__dirname, rel), "utf8") });
const input = {
  language: "Solidity",
  sources: {
    "contracts/Launchpad.sol": read("contracts/Launchpad.sol"),
    "contracts/MemeToken.sol": read("contracts/MemeToken.sol"),
    "contracts/interfaces/IDexRouter.sol": read("contracts/interfaces/IDexRouter.sol"),
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "shanghai",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
function findImports(p) {
  try {
    const base = p.startsWith("@") ? resolve(__dirname, "node_modules", p) : resolve(__dirname, p);
    return { contents: readFileSync(base, "utf8") };
  } catch (e) {
    return { error: `Not found: ${p} (${e.message})` };
  }
}
const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errs = (out.errors ?? []).filter((e) => e.severity === "error");
if (errs.length) {
  errs.forEach((e) => console.error(e.formattedMessage));
  process.exit(1);
}
const artifact = out.contracts["contracts/Launchpad.sol"]["Launchpad"];
const abi = artifact.abi;
const bytecode = "0x" + artifact.evm.bytecode.object;

// ---- deploy ----
const chain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});
const account = privateKeyToAccount(PK);
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) });

const feeRecipient = process.env.FEE_RECIPIENT || account.address;
const balance = await publicClient.getBalance({ address: account.address });

console.log("\nNetwork:       ", `${chain.name} (chainId ${CHAIN_ID})`);
console.log("Deployer:      ", account.address);
console.log("Balance:       ", formatEther(balance), "ETH");
console.log("Fee recipient: ", feeRecipient);
console.log("Fee (bps):     ", FEE_BPS.toString());
console.log("Target raise:  ", formatEther(TARGET), "ETH");

if (balance === 0n) {
  console.error("\n❌ Deployer has 0 ETH on Robinhood Chain — bridge some ETH for gas first.");
  process.exit(1);
}

const deployBlock = await publicClient.getBlockNumber();
console.log("\nDeploying Launchpad…");
const hash = await walletClient.deployContract({
  abi,
  bytecode,
  args: [account.address, feeRecipient, FEE_BPS, TARGET],
});
console.log("tx:", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const address = receipt.contractAddress;
console.log("\n✅ Launchpad deployed at:", address);

if (DEX_ROUTER) {
  console.log("Setting DEX router:", DEX_ROUTER);
  const h = await walletClient.writeContract({ address, abi, functionName: "setDexRouter", args: [DEX_ROUTER] });
  await publicClient.waitForTransactionReceipt({ hash: h });
  console.log("Router set.");
}

console.log("\n--- Add these to Vercel (Project → Settings → Environment Variables) ---");
console.log(`NEXT_PUBLIC_LAUNCHPAD_ADDRESS=${address}`);
console.log(`NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK=${deployBlock.toString()}`);
console.log(`NEXT_PUBLIC_RPC_URL=${RPC_URL}`);
console.log(`NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}`);
console.log(`NEXT_PUBLIC_EXPLORER_URL=https://robinhoodchain.blockscout.com`);
