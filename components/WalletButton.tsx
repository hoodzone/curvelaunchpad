"use client";

import { useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { CHAIN_ID, CHAIN_NAME, CURRENCY_SYMBOL } from "@/lib/chain";
import { fmtEth, shortAddr } from "@/lib/format";
import { DEMO_MODE, useDemo } from "@/lib/demo";

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: balance } = useBalance({ address, query: { enabled: !!address } });
  const [open, setOpen] = useState(false);
  const demo = useDemo();

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  // In demo mode there is no real wallet — use a simulated one.
  if (DEMO_MODE) {
    if (!demo.connected) {
      return (
        <button className="btn-brand" onClick={() => demo.connect()}>
          Connect Wallet
        </button>
      );
    }
    return (
      <div className="relative">
        <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>
          <span className="h-2 w-2 rounded-full bg-brand-500 shadow-glow" />
          <span className="font-mono">Demo</span>
          <span className="hidden text-slate-400 sm:inline">
            · {fmtEth(demo.ethBalance)} {CURRENCY_SYMBOL}
          </span>
        </button>
        {open && (
          <div className="absolute right-0 z-20 mt-2 w-44 card p-2 text-sm" onMouseLeave={() => setOpen(false)}>
            <div className="px-2 py-1.5 text-xs text-slate-400">Demo wallet</div>
            <button
              className="w-full rounded-lg px-2 py-1.5 text-left text-rose-300 hover:bg-white/5"
              onClick={() => {
                demo.disconnect();
                setOpen(false);
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!isConnected) {
    return (
      <button
        className="btn-brand"
        disabled={isPending || !injected}
        onClick={() => injected && connect({ connector: injected })}
      >
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  if (wrongNetwork) {
    return (
      <button className="btn-danger" disabled={switching} onClick={() => switchChain({ chainId: CHAIN_ID })}>
        {switching ? "Switching…" : `Switch to ${CHAIN_NAME}`}
      </button>
    );
  }

  return (
    <div className="relative">
      <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>
        <span className="h-2 w-2 rounded-full bg-brand-500 shadow-glow" />
        <span className="font-mono">{shortAddr(address!)}</span>
        {balance && (
          <span className="hidden text-slate-400 sm:inline">
            · {fmtEth(balance.value)} {CURRENCY_SYMBOL}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-2 w-48 card p-2 text-sm"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="px-2 py-1.5 text-xs text-slate-400">Connected</div>
          <button
            className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
            onClick={() => {
              navigator.clipboard?.writeText(address!);
              setOpen(false);
            }}
          >
            Copy address
          </button>
          <button
            className="w-full rounded-lg px-2 py-1.5 text-left text-rose-300 hover:bg-white/5"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
