"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useConnect,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { decodeEventLog, getAddress } from "viem";
import { launchpadAbi, LAUNCHPAD_ADDRESS } from "@/lib/contracts";
import { CHAIN_ID, CHAIN_NAME } from "@/lib/chain";
import { buildTokenUri, isImageUrl } from "@/lib/metadata";
import { DEMO_MODE, useDemo } from "@/lib/demo";
import { TokenAvatar } from "./TokenAvatar";
import { ImageDropzone } from "./ImageDropzone";

export function CreateTokenForm() {
  const router = useRouter();
  const { isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChain } = useSwitchChain();
  const demo = useDemo();
  const effConnected = DEMO_MODE ? demo.connected : isConnected;
  const effWrongNet = !DEMO_MODE && chainId !== CHAIN_ID;

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { writeContractAsync, isPending } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const symbolOk = symbol.length >= 2 && symbol.length <= 11;
  const valid = name.trim().length > 0 && symbolOk;

  // On confirmation, pull the new token address from the TokenCreated event.
  useEffect(() => {
    if (!isSuccess || !receipt) return;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: launchpadAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "TokenCreated") {
          const addr = getAddress((ev.args as { token: string }).token);
          router.push(`/token/${addr}`);
          return;
        }
      } catch {
        /* not our event */
      }
    }
    // Fallback: go home if we somehow miss the event.
    router.push("/");
  }, [isSuccess, receipt, router]);

  const uriPreview = useMemo(
    () => buildTokenUri({ image, description, website, twitter, telegram }),
    [image, description, website, twitter, telegram]
  );

  async function handleCreate() {
    setError(null);
    if (!valid) {
      setError("Enter a name and a 2–11 character symbol.");
      return;
    }

    // Demo mode: create the token in the in-browser simulation and go to it.
    if (DEMO_MODE) {
      const addr = demo.createToken({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        uri: uriPreview,
      });
      if (addr) router.push(`/token/${addr}`);
      return;
    }

    try {
      const hash = await writeContractAsync({
        address: LAUNCHPAD_ADDRESS,
        abi: launchpadAbi,
        functionName: "createToken",
        args: [name.trim(), symbol.trim().toUpperCase(), uriPreview],
      });
      setTxHash(hash);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/reject/i.test(msg) ? "Transaction rejected." : msg.split("\n")[0].slice(0, 160));
    }
  }

  const busy = isPending || isConfirming || isSuccess;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Form */}
      <div className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              placeholder="Robinhood Doge"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Symbol *</label>
            <input
              className="input uppercase"
              placeholder="RHDOGE"
              value={symbol}
              maxLength={11}
              onChange={(e) => setSymbol(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
            />
            {symbol && !symbolOk && (
              <p className="mt-1 text-xs text-rose-300">Symbol must be 2–11 characters.</p>
            )}
          </div>
        </div>

        <ImageDropzone value={image} onChange={setImage} />

        <div>
          <label className="label">Description</label>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="What's the meme?"
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Website</label>
            <input className="input" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <div>
            <label className="label">Twitter / X</label>
            <input className="input" placeholder="@handle" value={twitter} onChange={(e) => setTwitter(e.target.value)} />
          </div>
          <div>
            <label className="label">Telegram</label>
            <input className="input" placeholder="t.me/…" value={telegram} onChange={(e) => setTelegram(e.target.value)} />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>
        )}

        {!effConnected ? (
          <button
            className="btn-brand w-full"
            onClick={() => (DEMO_MODE ? demo.connect() : connectors[0] && connect({ connector: connectors[0] }))}
          >
            Connect Wallet
          </button>
        ) : effWrongNet ? (
          <button className="btn-danger w-full" onClick={() => switchChain({ chainId: CHAIN_ID })}>
            Switch to {CHAIN_NAME}
          </button>
        ) : (
          <button className="btn-brand w-full" disabled={!valid || busy} onClick={handleCreate}>
            {isSuccess
              ? "Launched! Redirecting…"
              : busy
                ? "Launching…"
                : "🚀 Launch Token"}
          </button>
        )}
        <p className="text-center text-xs text-slate-500">
          Launching is free (you only pay gas). 1B supply, 800M sold on the curve, 200M seeded to the
          DEX at graduation.
        </p>
      </div>

      {/* Live preview */}
      <div className="card h-fit space-y-4 p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Preview</div>
        <div className="flex items-center gap-3">
          <TokenAvatar
            address="0x0000000000000000000000000000000000000000"
            symbol={symbol || "?"}
            image={isImageUrl(image) ? image : undefined}
            size={56}
          />
          <div className="min-w-0">
            <div className="truncate font-semibold">{name || "Your token"}</div>
            <div className="text-sm text-slate-400">${symbol || "SYMBOL"}</div>
          </div>
        </div>
        <p className="line-clamp-4 text-sm text-slate-400">
          {description || "Your token description will appear here."}
        </p>
        <div className="rounded-xl bg-ink-850 p-3 text-xs text-slate-500">
          <div className="flex justify-between">
            <span>Total supply</span>
            <span className="text-slate-300">1,000,000,000</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Curve / DEX split</span>
            <span className="text-slate-300">80% / 20%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
