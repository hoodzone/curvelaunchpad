"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  useConnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatUnits, parseEther, parseUnits, maxUint256, type Address } from "viem";
import type { TokenSummary } from "@/lib/types";
import { launchpadAbi, memeTokenAbi, LAUNCHPAD_ADDRESS } from "@/lib/contracts";
import { CHAIN_ID, CHAIN_NAME, CURRENCY_SYMBOL, explorerToken } from "@/lib/chain";
import { buyQuote, sellQuote } from "@/lib/curve";
import { fmtEth, fmtToken } from "@/lib/format";
import { useFeeBps } from "@/lib/hooks";

type Side = "buy" | "sell";
const SLIPPAGES = [1, 3, 5, 10];

export function BuySellWidget({ token, onTraded }: { token: TokenSummary; onTraded?: () => void }) {
  const tokenAddr = token.address as Address;
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChain } = useSwitchChain();
  const feeBps = useFeeBps();

  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [action, setAction] = useState<"approve" | "buy" | "sell" | null>(null);

  const graduated = token.pool.graduated || token.pool.halted;
  const virtualEth = BigInt(token.pool.virtualEth);
  const virtualToken = BigInt(token.pool.virtualToken);
  const ethReserve = BigInt(token.pool.ethReserve);

  const { data: ethBal, refetch: refetchEth } = useBalance({
    address,
    query: { enabled: !!address },
  });
  const { data: tokenBalRaw, refetch: refetchTokenBal } = useReadContract({
    address: tokenAddr,
    abi: memeTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: tokenAddr,
    abi: memeTokenAbi,
    functionName: "allowance",
    args: address ? [address, LAUNCHPAD_ADDRESS] : undefined,
    query: { enabled: !!address && side === "sell" },
  });

  const tokenBal = (tokenBalRaw as bigint | undefined) ?? 0n;
  const allowance = (allowanceRaw as bigint | undefined) ?? 0n;

  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: confirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Parse the input into a wei bigint for the active side.
  const amountWei = useMemo(() => {
    if (!amount || Number(amount) <= 0) return 0n;
    try {
      return side === "buy" ? parseEther(amount) : parseUnits(amount, 18);
    } catch {
      return 0n;
    }
  }, [amount, side]);

  // Live quote (client-side mirror of the on-chain math).
  const quote = useMemo(() => {
    if (amountWei === 0n) return 0n;
    return side === "buy"
      ? buyQuote(virtualEth, virtualToken, amountWei, feeBps)
      : sellQuote(virtualEth, virtualToken, ethReserve, amountWei, feeBps);
  }, [side, amountWei, virtualEth, virtualToken, ethReserve, feeBps]);

  const minOut = useMemo(() => {
    if (quote === 0n) return 0n;
    // minOut = quote * (10000 - slippage*100) / 10000
    return (quote * BigInt(10000 - slippage * 100)) / 10000n;
  }, [quote, slippage]);

  const needsApproval = side === "sell" && amountWei > 0n && allowance < amountWei;

  // React to confirmed transactions.
  useEffect(() => {
    if (!confirmed || !action) return;
    if (action === "approve") {
      refetchAllowance();
    } else {
      setAmount("");
      refetchEth();
      refetchTokenBal();
      onTraded?.();
    }
    setTxHash(undefined);
    setAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);

  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);

  async function handleApprove() {
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: tokenAddr,
        abi: memeTokenAbi,
        functionName: "approve",
        args: [LAUNCHPAD_ADDRESS, maxUint256],
      });
      setAction("approve");
      setTxHash(hash);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function handleTrade() {
    setError(null);
    if (amountWei === 0n) return;
    try {
      let hash: `0x${string}`;
      if (side === "buy") {
        hash = await writeContractAsync({
          address: LAUNCHPAD_ADDRESS,
          abi: launchpadAbi,
          functionName: "buy",
          args: [tokenAddr, minOut, deadline()],
          value: amountWei,
        });
      } else {
        hash = await writeContractAsync({
          address: LAUNCHPAD_ADDRESS,
          abi: launchpadAbi,
          functionName: "sell",
          args: [tokenAddr, amountWei, minOut, deadline()],
        });
      }
      setAction(side);
      setTxHash(hash);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const busy = isWriting || isConfirming;

  // ---- Non-tradable / connection states ----
  if (graduated) {
    return (
      <div className="card p-5">
        <div className="mb-2 text-lg font-semibold text-brand-500">🎓 Graduated</div>
        <p className="text-sm text-slate-400">
          This token filled its bonding curve and moved to the DEX. Trade it on the open market.
        </p>
        <a
          href={explorerToken(tokenAddr)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost mt-4 w-full"
        >
          View token on explorer
        </a>
      </div>
    );
  }

  return (
    <div className="card p-5">
      {/* Buy / Sell toggle */}
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-ink-800 p-1">
        {(["buy", "sell"] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSide(s);
              setAmount("");
              setError(null);
            }}
            className={`rounded-lg py-2 text-sm font-semibold capitalize transition ${
              side === s
                ? s === "buy"
                  ? "bg-brand-500 text-ink-950"
                  : "bg-rose-500 text-white"
                : "text-slate-300 hover:bg-white/5"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <label className="label">
        {side === "buy" ? `You pay (${CURRENCY_SYMBOL})` : `You sell (${token.symbol})`}
      </label>
      <div className="relative">
        <input
          inputMode="decimal"
          className="input pr-16 text-lg"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
          {side === "buy" ? CURRENCY_SYMBOL : token.symbol}
        </span>
      </div>

      {/* Quick amounts */}
      <div className="mt-2 flex gap-1.5">
        {side === "buy"
          ? ["0.05", "0.1", "0.5", "1"].map((v) => (
              <button key={v} className="chip flex-1 bg-white/5 hover:bg-white/10" onClick={() => setAmount(v)}>
                {v}
              </button>
            ))
          : [25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                className="chip flex-1 bg-white/5 hover:bg-white/10"
                onClick={() => setAmount(formatUnits((tokenBal * BigInt(pct)) / 100n, 18))}
              >
                {pct}%
              </button>
            ))}
      </div>

      {/* Balances */}
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>
          Balance:{" "}
          {side === "buy"
            ? `${ethBal ? fmtEth(ethBal.value) : "0"} ${CURRENCY_SYMBOL}`
            : `${fmtToken(tokenBal)} ${token.symbol}`}
        </span>
      </div>

      {/* Quote */}
      <div className="mt-4 rounded-xl bg-ink-850 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">You receive (est.)</span>
          <span className="font-semibold">
            {side === "buy"
              ? `${fmtToken(quote)} ${token.symbol}`
              : `${fmtEth(quote)} ${CURRENCY_SYMBOL}`}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>Min. received ({slippage}% slippage)</span>
          <span>
            {side === "buy" ? `${fmtToken(minOut)} ${token.symbol}` : `${fmtEth(minOut)} ${CURRENCY_SYMBOL}`}
          </span>
        </div>
      </div>

      {/* Slippage */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">Slippage</span>
        <div className="flex gap-1">
          {SLIPPAGES.map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={`rounded-lg px-2 py-1 text-xs ${
                slippage === s ? "bg-brand-500 text-ink-950 font-semibold" : "bg-white/5 text-slate-300"
              }`}
            >
              {s}%
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>
      )}

      {/* Action button */}
      <div className="mt-4">
        {!isConnected ? (
          <button
            className="btn-brand w-full"
            onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          >
            Connect Wallet
          </button>
        ) : chainId !== CHAIN_ID ? (
          <button className="btn-danger w-full" onClick={() => switchChain({ chainId: CHAIN_ID })}>
            Switch to {CHAIN_NAME}
          </button>
        ) : needsApproval ? (
          <button className="btn-brand w-full" disabled={busy} onClick={handleApprove}>
            {busy ? "Approving…" : `Approve ${token.symbol}`}
          </button>
        ) : (
          <button
            className={`w-full ${side === "buy" ? "btn-brand" : "btn-danger"}`}
            disabled={busy || amountWei === 0n || quote === 0n}
            onClick={handleTrade}
          >
            {busy ? "Confirming…" : side === "buy" ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}
          </button>
        )}
      </div>
    </div>
  );
}

function errMsg(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/User rejected|User denied|rejected the request/i.test(msg)) return "Transaction rejected.";
  if (/insufficient funds/i.test(msg)) return "Insufficient balance for this trade + gas.";
  if (/slippage/i.test(msg)) return "Price moved past your slippage. Try again or raise slippage.";
  // Keep it short — surface the first line only.
  return msg.split("\n")[0].slice(0, 140);
}
