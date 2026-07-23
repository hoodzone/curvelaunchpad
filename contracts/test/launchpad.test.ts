import { expect } from "chai";
import { network } from "hardhat";
import { parseEther, getAddress, type Address, decodeEventLog } from "viem";

const DAY = 60n * 60n * 24n;

async function deployFixture() {
  const { viem } = await network.connect();
  const [deployer, feeWallet, alice, bob] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const feeBps = 100n; // 1%
  const target = parseEther("4");

  const launchpad = await viem.deployContract("Launchpad", [
    deployer.account.address,
    feeWallet.account.address,
    feeBps,
    target,
  ]);

  return { viem, publicClient, deployer, feeWallet, alice, bob, launchpad, feeBps, target };
}

async function createToken(f: Awaited<ReturnType<typeof deployFixture>>, creator = f.alice) {
  const hash = await f.launchpad.write.createToken(["Doge", "DOGE", "ipfs://meta"], {
    account: creator.account,
  });
  const receipt = await f.publicClient.waitForTransactionReceipt({ hash });
  // The token address is the first (and only) contract created in this tx.
  const created = receipt.logs
    .map((log) => {
      try {
        const ev = decodeEventLog({ abi: f.launchpad.abi, ...log });
        return ev.eventName === "TokenCreated" ? (ev.args as any).token : null;
      } catch {
        return null;
      }
    })
    .find(Boolean) as Address;
  return getAddress(created);
}

function deadline() {
  return BigInt(Math.floor(Date.now() / 1000)) + DAY;
}

describe("Launchpad", () => {
  it("creates a token with full supply held by the launchpad", async () => {
    const f = await deployFixture();
    const token = await createToken(f);

    const meme = await f.viem.getContractAt("MemeToken", token);
    const total = await meme.read.totalSupply();
    const held = await meme.read.balanceOf([f.launchpad.address]);
    expect(total).to.equal(parseEther("1000000000"));
    expect(held).to.equal(total);

    const pool = await f.launchpad.read.getPool([token]);
    expect(pool.creator).to.equal(getAddress(f.alice.account.address));
    expect(pool.virtualToken).to.equal(parseEther("1000000000"));
    expect(pool.virtualEth).to.equal(f.target / 4n);
    expect(pool.graduated).to.equal(false);
  });

  it("lets a user buy tokens and charges the platform fee", async () => {
    const f = await deployFixture();
    const token = await createToken(f);
    const meme = await f.viem.getContractAt("MemeToken", token);

    const ethIn = parseEther("0.5");
    const quote = await f.launchpad.read.getBuyQuote([token, ethIn]);
    expect(quote).to.be.greaterThan(0n);

    await f.launchpad.write.buy([token, quote, deadline()], {
      account: f.bob.account,
      value: ethIn,
    });

    const bal = await meme.read.balanceOf([f.bob.account.address]);
    expect(bal).to.equal(quote);

    // Fee = 1% of ethIn accrues to the platform.
    const fees = await f.launchpad.read.accruedFees();
    expect(fees).to.equal(ethIn / 100n);
  });

  it("round-trips buy then sell with fees deducted both ways", async () => {
    const f = await deployFixture();
    const token = await createToken(f);
    const meme = await f.viem.getContractAt("MemeToken", token);

    const ethIn = parseEther("1");
    await f.launchpad.write.buy([token, 0n, deadline()], {
      account: f.bob.account,
      value: ethIn,
    });
    const bought = await meme.read.balanceOf([f.bob.account.address]);

    await meme.write.approve([f.launchpad.address, bought], { account: f.bob.account });
    const sellQuote = await f.launchpad.read.getSellQuote([token, bought]);

    const before = await f.publicClient.getBalance({ address: f.bob.account.address });
    const hash = await f.launchpad.write.sell([token, bought, sellQuote, deadline()], {
      account: f.bob.account,
    });
    const receipt = await f.publicClient.waitForTransactionReceipt({ hash });
    const gas = receipt.gasUsed * receipt.effectiveGasPrice;
    const after = await f.publicClient.getBalance({ address: f.bob.account.address });

    expect(after - before + gas).to.equal(sellQuote);
    // Selling everything back returns the tokens to the launchpad.
    expect(await meme.read.balanceOf([f.bob.account.address])).to.equal(0n);
  });

  it("reverts on slippage", async () => {
    const f = await deployFixture();
    const token = await createToken(f);
    const ethIn = parseEther("0.5");
    const quote = await f.launchpad.read.getBuyQuote([token, ethIn]);
    await expect(
      f.launchpad.write.buy([token, quote + 1n, deadline()], {
        account: f.bob.account,
        value: ethIn,
      })
    ).to.be.rejected;
  });

  it("graduates when the raise target is reached and migrates liquidity", async () => {
    const f = await deployFixture();

    // Deploy + wire a mock DEX router.
    const router = await f.viem.deployContract("MockDexRouter", [f.launchpad.address]);
    await f.launchpad.write.setDexRouter([router.address], { account: f.deployer.account });

    const token = await createToken(f);
    const meme = await f.viem.getContractAt("MemeToken", token);

    // Overshoot the target; the excess ETH must be refunded and the pool graduates.
    const before = await f.publicClient.getBalance({ address: f.bob.account.address });
    const hash = await f.launchpad.write.buy([token, 0n, deadline()], {
      account: f.bob.account,
      value: parseEther("10"),
    });
    const receipt = await f.publicClient.waitForTransactionReceipt({ hash });
    const gas = receipt.gasUsed * receipt.effectiveGasPrice;
    const after = await f.publicClient.getBalance({ address: f.bob.account.address });

    const pool = await f.launchpad.read.getPool([token]);
    expect(pool.halted).to.equal(true);
    expect(pool.graduated).to.equal(true);
    expect(pool.ethReserve).to.equal(0n); // moved into the LP

    // Buyer only spent enough to reach the target (4 ETH + 1% fee) + gas.
    const spent = before - after - gas;
    expect(spent).to.be.lessThan(parseEther("4.05"));
    expect(spent).to.be.greaterThan(parseEther("4"));

    // Router received the launchpad's remaining token balance as liquidity.
    expect(await meme.read.balanceOf([f.launchpad.address])).to.equal(0n);
    expect(await meme.read.balanceOf([router.address])).to.be.greaterThan(0n);

    // Trading is closed post-graduation.
    await expect(
      f.launchpad.write.buy([token, 0n, deadline()], {
        account: f.bob.account,
        value: parseEther("0.1"),
      })
    ).to.be.rejected;
  });

  it("halts but waits for a router when none is configured", async () => {
    const f = await deployFixture();
    const token = await createToken(f);

    await f.launchpad.write.buy([token, 0n, deadline()], {
      account: f.bob.account,
      value: parseEther("10"),
    });

    let pool = await f.launchpad.read.getPool([token]);
    expect(pool.halted).to.equal(true);
    expect(pool.graduated).to.equal(false); // no router yet
    expect(pool.ethReserve).to.equal(f.target); // ETH still held

    // Owner configures the router; anyone can then finalize.
    const router = await f.viem.deployContract("MockDexRouter", [f.launchpad.address]);
    await f.launchpad.write.setDexRouter([router.address], { account: f.deployer.account });
    await f.launchpad.write.finalizeGraduation([token], { account: f.bob.account });

    pool = await f.launchpad.read.getPool([token]);
    expect(pool.graduated).to.equal(true);
    expect(pool.ethReserve).to.equal(0n);
  });

  it("only lets the owner change fees and router", async () => {
    const f = await deployFixture();
    await expect(
      f.launchpad.write.setFee([50n, f.alice.account.address], { account: f.alice.account })
    ).to.be.rejected;
    await expect(
      f.launchpad.write.setDexRouter([f.alice.account.address], { account: f.alice.account })
    ).to.be.rejected;
    // Owner can.
    await f.launchpad.write.setFee([50n, f.feeWallet.account.address], {
      account: f.deployer.account,
    });
    expect(await f.launchpad.read.feeBps()).to.equal(50n);
  });

  it("withdraws accrued fees to the fee recipient", async () => {
    const f = await deployFixture();
    const token = await createToken(f);
    await f.launchpad.write.buy([token, 0n, deadline()], {
      account: f.bob.account,
      value: parseEther("2"),
    });
    const fees = await f.launchpad.read.accruedFees();
    expect(fees).to.equal(parseEther("2") / 100n);

    const before = await f.publicClient.getBalance({ address: f.feeWallet.account.address });
    await f.launchpad.write.withdrawFees({ account: f.bob.account });
    const after = await f.publicClient.getBalance({ address: f.feeWallet.account.address });
    expect(after - before).to.equal(fees);
    expect(await f.launchpad.read.accruedFees()).to.equal(0n);
  });
});
