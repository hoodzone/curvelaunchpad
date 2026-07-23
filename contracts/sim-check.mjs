// Numeric mirror of Launchpad's integer curve math (BigInt), used to validate
// the bonding-curve and graduation arithmetic without an EVM. It replicates the
// exact floor/ceil mulDiv rounding the Solidity uses.
//
//   node sim-check.mjs
//
const E = 10n ** 18n;
const BPS = 10_000n;

const TOTAL_SUPPLY = 1_000_000_000n * E;
const INITIAL_VIRTUAL_TOKEN = 1_000_000_000n * E;
const LP_TOKEN_RESERVE = 200_000_000n * E;
const CURVE_SUPPLY = 800_000_000n * E;

const mulDivFloor = (a, b, c) => (a * b) / c;
const mulDivCeil = (a, b, c) => (a * b + (c - 1n)) / c;

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("  ✗ " + msg);
  }
}

function newPool(target) {
  return {
    virtualEth: target / 4n,
    virtualToken: INITIAL_VIRTUAL_TOKEN,
    ethReserve: 0n,
    target,
    halted: false,
    tokensSold: 0n,
  };
}

function buy(p, grossIn, feeBps) {
  if (p.halted) throw new Error("halted");
  const remaining = p.target - p.ethReserve;
  const grossCap = feeBps === 0n ? remaining : mulDivCeil(remaining, BPS, BPS - feeBps);
  let refund = 0n;
  if (grossIn > grossCap) {
    refund = grossIn - grossCap;
    grossIn = grossCap;
  }
  let fee = mulDivFloor(grossIn, feeBps, BPS);
  let curveEth = grossIn - fee;
  // Graduate based on the resulting reserve, mirroring Launchpad.buy.
  let graduate = false;
  if (curveEth >= remaining) {
    curveEth = remaining;
    fee = grossIn - curveEth;
    graduate = true;
  }
  let tokensOut = mulDivFloor(p.virtualToken, curveEth, p.virtualEth + curveEth);
  const sellable = p.virtualToken - LP_TOKEN_RESERVE;
  if (tokensOut > sellable) tokensOut = sellable;

  p.virtualEth += curveEth;
  p.virtualToken -= tokensOut;
  p.ethReserve += curveEth;
  p.tokensSold += tokensOut;
  if (graduate) p.halted = true;
  return { tokensOut, fee, refund, curveEth, graduate };
}

function sell(p, tokenIn, feeBps) {
  if (p.halted) throw new Error("halted");
  let grossEthOut = mulDivFloor(p.virtualEth, tokenIn, p.virtualToken + tokenIn);
  if (grossEthOut > p.ethReserve) throw new Error("insufficient liquidity");
  const fee = mulDivFloor(grossEthOut, feeBps, BPS);
  const ethOut = grossEthOut - fee;
  p.virtualEth -= grossEthOut;
  p.virtualToken += tokenIn;
  p.ethReserve -= grossEthOut;
  p.tokensSold -= tokenIn;
  return { ethOut, fee, grossEthOut };
}

function invariants(p, label) {
  assert(p.virtualEth === p.target / 4n + p.ethReserve, `${label}: virtualEth == Ve0 + ethReserve`);
  assert(p.virtualToken >= LP_TOKEN_RESERVE, `${label}: virtualToken >= LP_TOKEN_RESERVE`);
  assert(p.ethReserve <= p.target, `${label}: ethReserve <= target`);
  assert(p.tokensSold <= CURVE_SUPPLY + 1n, `${label}: tokensSold <= CURVE_SUPPLY`);
}

// --- Scenario 1: incremental buys, price rises, invariants hold ---
{
  const feeBps = 100n;
  const target = 4n * E;
  const p = newPool(target);
  let lastPrice = 0n;
  for (let i = 0; i < 20; i++) {
    const price = mulDivFloor(p.virtualEth, E, p.virtualToken);
    assert(price >= lastPrice, `S1: price monotonic non-decreasing (step ${i})`);
    lastPrice = price;
    buy(p, E / 10n, feeBps); // 0.1 ETH each
    invariants(p, `S1 step ${i}`);
  }
  assert(!p.halted, "S1: not yet graduated after 2 ETH of buys");
}

// --- Scenario 2: overshoot graduates exactly on target, refunds excess ---
{
  const feeBps = 100n;
  const target = 4n * E;
  const p = newPool(target);
  const res = buy(p, 100n * E, feeBps); // massively overshoot
  assert(p.halted, "S2: pool halted");
  assert(p.ethReserve === target, "S2: ethReserve lands exactly on target");
  assert(p.virtualEth === target / 4n + target, "S2: virtualEth == Ve0 + target");
  assert(res.refund > 0n, "S2: excess ETH refunded");
  // gross spent = 100 ETH - refund; must equal target + fee.
  const grossSpent = 100n * E - res.refund;
  assert(grossSpent === target + res.fee, "S2: grossSpent == target + fee");
  // fee is ~1% of the gross that funded the curve.
  assert(res.fee >= (target * 100n) / 10_000n - 2n, "S2: fee ~= 1% of target");
  invariants(p, "S2 final");
  // Curve sold ~CURVE_SUPPLY (within dust of 1 token).
  const soldDelta = CURVE_SUPPLY > p.tokensSold ? CURVE_SUPPLY - p.tokensSold : p.tokensSold - CURVE_SUPPLY;
  assert(soldDelta <= E, "S2: tokens sold ~= CURVE_SUPPLY (within 1 token)");
  // LP side = total held by launchpad = TOTAL_SUPPLY - tokensSold.
  const lpTokens = TOTAL_SUPPLY - p.tokensSold;
  assert(lpTokens >= LP_TOKEN_RESERVE, "S2: LP token side >= LP_TOKEN_RESERVE");
}

// --- Scenario 3: buy then full sell returns (nearly) all ETH minus 2 fees ---
{
  const feeBps = 100n;
  const target = 4n * E;
  const p = newPool(target);
  const b = buy(p, E, feeBps); // 1 ETH in
  const s = sell(p, b.tokensOut, feeBps); // sell it all back
  // After a symmetric round trip the pool returns to (almost) its start state.
  assert(p.tokensSold === 0n, "S3: all tokens returned to curve");
  // Net ETH the trader recovered is < curveEth (lost the sell-side fee + rounding).
  assert(s.ethOut < b.curveEth, "S3: round-trip loses fees");
  // Remaining ethReserve equals what the seller could not withdraw (dust) — tiny.
  assert(p.ethReserve <= 2n, "S3: ethReserve dust after full round trip");
  invariants(p, "S3 final");
}

// --- Scenario 4: zero-fee configuration graduates cleanly ---
{
  const feeBps = 0n;
  const target = 8n * E;
  const p = newPool(target);
  const res = buy(p, 1_000n * E, feeBps);
  assert(p.halted, "S4: graduated");
  assert(res.fee === 0n, "S4: no fee");
  assert(p.ethReserve === target, "S4: ethReserve == target");
  assert(res.refund === 1_000n * E - target, "S4: refund == input - target");
  invariants(p, "S4 final");
}

// --- Scenario 5: many small buys accumulate to graduation without overshoot ---
{
  const feeBps = 100n;
  const target = 4n * E;
  const p = newPool(target);
  let graduated = false;
  for (let i = 0; i < 100000 && !graduated; i++) {
    const r = buy(p, E / 2n, feeBps); // 0.5 ETH steps
    if (r.graduate) graduated = true;
  }
  assert(graduated, "S5: eventually graduates via small buys");
  assert(p.ethReserve === target, "S5: ethReserve exactly target");
  invariants(p, "S5 final");
}

// --- Scenario 6: reaching the target ALWAYS halts (no stuck-at-target state) ---
// Sweeps many buy sizes (incl. odd wei amounts that stress fee rounding) and
// asserts the pool can never sit at ethReserve == target without being halted.
{
  const feeBps = 100n;
  const target = 4n * E;
  for (let step = 1n; step <= 400n; step++) {
    const p = newPool(target);
    const size = (target * step) / 400n + (step % 7n); // varied + odd-wei jitter
    let guard = 0;
    while (!p.halted && guard++ < 100000) {
      buy(p, size, feeBps);
      assert(p.ethReserve <= target, `S6: ethReserve never exceeds target (step ${step})`);
      assert(!(p.ethReserve === target && !p.halted), `S6: at-target implies halted (step ${step})`);
    }
    assert(p.halted && p.ethReserve === target, `S6: graduates exactly on target (step ${step})`);
  }
}

console.log(`\nBonding-curve math simulation: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
