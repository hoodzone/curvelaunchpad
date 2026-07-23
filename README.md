# CurveLaunch — Memecoin Launchpad on Robinhood Chain

A pump.fun-style, fair-launch memecoin launchpad built for **Robinhood Chain**
(EVM L2, Arbitrum Orbit / Nitro stack, chainId **4663**, gas token **ETH**).

Every token launches onto its own **bonding curve** — no presale, no team
allocation. Anyone buys/sells against a constant-product curve; when a token
raises its target it **graduates**: liquidity migrates to a DEX and the LP
tokens are burned, locking liquidity forever.

```
curvelaunchpad/
├── app/ · components/ · lib/   # Next.js 14 dApp at the repo root (Vercel-ready)
└── contracts/                  # Solidity (Hardhat) — Launchpad + MemeToken + curve math
```

---

## How the curve works

Each token uses a constant-product curve on **virtual reserves** `Ve` (ETH) and
`Vt` (token), with `k = Ve · Vt` held constant per trade:

- **buy:** `tokensOut = Vt · ethIn / (Ve + ethIn)`
- **sell:** `ethOut = Ve · tokenIn / (Vt + tokenIn)`

Constants (per token):

| Parameter | Value |
|---|---|
| Total supply | 1,000,000,000 |
| Sold on curve | 800,000,000 (80%) |
| Reserved for DEX LP | 200,000,000 (20%) |
| Initial virtual token `Vt₀` | 1,000,000,000 |
| Initial virtual ETH `Ve₀` | `target / 4` |
| Graduation target | configurable (default 4 ETH) |

The reserves are seeded so the curve sells exactly the 800M curve allocation as
the raise reaches the target. Two invariants hold by construction and are
checked in `contracts/sim-check.mjs`:

- `virtualEth == Ve₀ + ethReserve`
- `virtualToken >= LP_TOKEN_RESERVE` (the curve never sells the LP allocation)

**Graduation is two-phase** so it works on a brand-new chain whose canonical DEX
router may not be known yet:

1. When the raise hits the target, curve trading **halts** (the crossing buy only
   halts — migration is never done inside a trade, so a failing/griefed liquidity
   add can't block buys).
2. Anyone can then call `finalizeGraduation(token)` (permissionless) once the
   owner has set a router via `setDexRouter`. Liquidity is added with **full
   min-amounts** so a pre-created / skewed pair can't siphon the raise, and LP
   tokens are sent to `0x…dEaD` (locked).

---

## Contracts

### Verify locally (no external downloads needed)

```bash
cd contracts
pnpm install
pnpm compile:check   # compiles with solc-js (solc 0.8.24, viaIR)
pnpm sim             # 6300+ assertions over the curve/graduation math
pnpm generate:abi    # regenerate ../lib/abi/*.ts from the Solidity
```

> The full Hardhat test suite (`pnpm test`) and `pnpm compile` need network
> access to `binaries.soliditylang.org` to fetch the solc binary. In sandboxes
> that block it, use `compile:check` + `sim` above, which are self-contained.

### Deploy to Robinhood Chain

You need a wallet funded with ETH on Robinhood Chain (bridge via the Arbitrum
canonical bridge — see `docs.robinhood.com/chain/bridging`). Then:

```bash
cd contracts
cp .env.example .env      # set DEPLOYER_PRIVATE_KEY, FEE_RECIPIENT, etc.

pnpm deploy:standalone    # recommended — compiles with solc-js + deploys via viem
# or
pnpm deploy:robinhood     # Hardhat (needs network access to fetch the solc binary)
```

`deploy:standalone` is self-contained (no Hardhat solc download) and prints the
exact `NEXT_PUBLIC_*` values to paste into Vercel. **Run it on your own machine
— never paste a real private key into a shared/cloud session.**

The script prints the launchpad address and deploy block:

```
NEXT_PUBLIC_LAUNCHPAD_ADDRESS=0x…
NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK=…
```

Once a DEX exists on Robinhood Chain, set its router:
`launchpad.setDexRouter(<uniswapV2RouterAddress>)`.

---

## Web app (repo root)

```bash
pnpm install
cp .env.example .env.local   # optional — without it the app runs in Demo Mode
pnpm dev                     # http://localhost:3000
```

Environment (`.env.local`):

```
NEXT_PUBLIC_CHAIN_ID=4663
NEXT_PUBLIC_RPC_URL=https://rpc.mainnet.chain.robinhood.com
NEXT_PUBLIC_EXPLORER_URL=https://robinhoodchain.blockscout.com
NEXT_PUBLIC_LAUNCHPAD_ADDRESS=0x…
NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK=…
RPC_URL=            # optional dedicated provider for server-side reads
```

Features:

- **Explore** — live grid of tokens with search + sort (new / market cap / curve progress)
- **Launch** — create a token in ~30s; metadata (image, description, socials) is stored **on-chain** as a data URI (no IPFS needed)
- **Token page** — price chart, bonding-curve progress, buy/sell widget with slippage, live trades feed
- **Portfolio** — your holdings valued on the curve
- **Wallet** — MetaMask (injected) with add/switch to Robinhood Chain

The API routes (`/api/tokens`, `/api/token/[address]`, `/api/trades/[address]`)
read on-chain state and `Trade`/`TokenCreated` event logs via viem. For
high-traffic production, swap in a dedicated indexer (Ponder/Subsquid).

### Demo Mode

Until `NEXT_PUBLIC_LAUNCHPAD_ADDRESS` is set, the app runs a fully in-browser
**Demo Mode**: a simulated launchpad (seeded tokens, working buy/sell, live
price charts, portfolio) persisted in `localStorage`, so a fresh Vercel deploy
is interactive immediately. Deploy the contract, set the address, and the app
switches to real on-chain mode automatically — no code changes.

### Deploy the frontend (Vercel)

The repo root **is** the Next.js app, so Vercel auto-detects it — import the
repo and deploy, with no root-directory or build config needed. Add the
`NEXT_PUBLIC_*` env vars when you're ready to go live on-chain (without them the
deploy simply runs in Demo Mode).

---

## Network details (Robinhood Chain mainnet)

| | |
|---|---|
| Chain ID | 4663 |
| RPC | `https://rpc.mainnet.chain.robinhood.com` (public, rate-limited) |
| Explorer | `https://robinhoodchain.blockscout.com` |
| Gas token | ETH |
| Stack | Arbitrum Orbit (Nitro) |

Every value is env-overridable, so pointing at a testnet or a dedicated RPC
provider (Alchemy, QuickNode, dRPC, …) needs no code changes.

---

## Security notes

- `buy` / `sell` / `finalizeGraduation` / `withdrawFees` are `nonReentrant` and follow checks-effects-interactions.
- The contract is solvent by construction: ETH balance == `accruedFees + Σ ethReserve`.
- `MemeToken` is a standard fixed-supply ERC20 with no callbacks.
- This is unaudited software for a fair-launch memecoin platform. Memecoins are
  high-risk; nothing here is financial advice. Get a professional audit before
  handling real value at scale.
