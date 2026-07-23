// Standalone solc-js compilation check. Verifies the contracts compile with the
// pinned compiler and the installed OpenZeppelin sources, without needing the
// Hardhat solc downloader (useful in restricted/offline environments).
//
//   node compile-check.mjs
//
import solc from "solc";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

const sources = {
  "contracts/MemeToken.sol": read("contracts/MemeToken.sol"),
  "contracts/Launchpad.sol": read("contracts/Launchpad.sol"),
  "contracts/interfaces/IDexRouter.sol": read("contracts/interfaces/IDexRouter.sol"),
};

function read(rel) {
  return { content: readFileSync(join(root, rel), "utf8") };
}

// Resolve imports (OpenZeppelin from node_modules, local relative paths).
function findImports(importPath) {
  try {
    if (importPath.startsWith("@")) {
      return { contents: readFileSync(resolve(root, "node_modules", importPath), "utf8") };
    }
    return { contents: readFileSync(resolve(root, importPath), "utf8") };
  } catch (e) {
    return { error: `File not found: ${importPath} (${e.message})` };
  }
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "shanghai",
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object"] },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

const errors = (output.errors ?? []).filter((e) => e.severity === "error");
const warnings = (output.errors ?? []).filter((e) => e.severity === "warning");

for (const w of warnings) console.warn(w.formattedMessage);

if (errors.length > 0) {
  for (const e of errors) console.error(e.formattedMessage);
  console.error(`\n❌ ${errors.length} compilation error(s).`);
  process.exit(1);
}

const version = solc.version();
console.log(`solc ${version}`);
for (const file of Object.keys(output.contracts ?? {})) {
  for (const name of Object.keys(output.contracts[file])) {
    const bytecode = output.contracts[file][name].evm.bytecode.object;
    if (bytecode && bytecode.length > 0) {
      console.log(`  ✔ ${file}:${name} (${bytecode.length / 2} bytes)`);
    }
  }
}
console.log(`\n✅ Compilation succeeded (${warnings.length} warning(s)).`);
