// Compiles the contracts with solc-js and emits typed ABI files the web app
// imports (kept in sync with the Solidity source, no hand-copying).
//
//   node generate-abi.mjs
//
import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const outDir = resolve(root, "..", "lib", "abi");
mkdirSync(outDir, { recursive: true });

const read = (rel) => ({ content: readFileSync(join(root, rel), "utf8") });
const sources = {
  "contracts/MemeToken.sol": read("contracts/MemeToken.sol"),
  "contracts/Launchpad.sol": read("contracts/Launchpad.sol"),
  "contracts/interfaces/IDexRouter.sol": read("contracts/interfaces/IDexRouter.sol"),
};

function findImports(importPath) {
  try {
    const base = importPath.startsWith("@") ? resolve(root, "node_modules", importPath) : resolve(root, importPath);
    return { contents: readFileSync(base, "utf8") };
  } catch (e) {
    return { error: `Not found: ${importPath} (${e.message})` };
  }
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "shanghai",
    outputSelection: { "*": { "*": ["abi"] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (out.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}

function emit(file, contract, varName, outfile) {
  const abi = out.contracts[file][contract].abi;
  const body =
    `// AUTO-GENERATED from contracts/${contract}.sol — do not edit by hand.\n` +
    `// Regenerate with: pnpm --dir contracts generate:abi\n` +
    `export const ${varName} = ${JSON.stringify(abi, null, 2)} as const;\n`;
  writeFileSync(join(outDir, outfile), body);
  console.log(`  ✔ ${outfile} (${abi.length} entries)`);
}

emit("contracts/Launchpad.sol", "Launchpad", "launchpadAbi", "launchpad.ts");
emit("contracts/MemeToken.sol", "MemeToken", "memeTokenAbi", "memeToken.ts");
console.log("ABI files written to web/lib/abi/");
