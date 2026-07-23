"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isLaunchpadConfigured } from "./contracts";
import { WAD, BPS, LP_TOKEN_RESERVE, INITIAL_VIRTUAL_TOKEN, marketCapWei, priceWei, progressBps } from "./curve";
import type { TokenSummary, TradeItem } from "./types";

/**
 * DEMO MODE — a fully in-browser simulation of the launchpad, active whenever no
 * real contract address is configured (NEXT_PUBLIC_LAUNCHPAD_ADDRESS unset). It
 * lets the deployed site be interactive (create / buy / sell / charts) before
 * the contract is live. State persists in localStorage. As soon as a real
 * launchpad address is set, DEMO_MODE is false and the app talks to the chain.
 */
export const DEMO_MODE = !isLaunchpadConfigured;

const KEY = "curvelaunch-demo-v2";
const FEE_BPS: bigint = 100n;
const TARGET = 4n * WAD;
const START_ETH = 10n * WAD;
const DEMO_ADDRESS = "0xD3m0000000000000000000000000000000000001";

const mulDiv = (a: bigint, b: bigint, c: bigint) => (a * b) / c;
const mulDivCeil = (a: bigint, b: bigint, c: bigint) => (a * b + (c - 1n)) / c;

// ---------------------------------------------------------------------------
// State model (bigints held in memory; serialized as tagged strings)
// ---------------------------------------------------------------------------

interface Pool {
  virtualEth: bigint;
  virtualToken: bigint;
  ethReserve: bigint;
  graduationTarget: bigint;
  halted: boolean;
  graduated: boolean;
}
interface DToken {
  address: string;
  name: string;
  symbol: string;
  uri: string;
  creator: string;
  createdAt: number;
  pool: Pool;
}
interface DTrade {
  token: string;
  trader: string;
  isBuy: boolean;
  ethAmount: bigint;
  tokenAmount: bigint;
  feeAmount: bigint;
  priceWei: bigint;
  blockNumber: number;
  timestamp: number;
  txHash: string;
}
interface State {
  ethBalance: bigint;
  connected: boolean;
  address: string;
  blockNumber: number;
  tokens: DToken[];
  balances: Record<string, bigint>;
  trades: Record<string, DTrade[]>;
}

function freshPool(): Pool {
  return {
    virtualEth: TARGET / 4n,
    virtualToken: INITIAL_VIRTUAL_TOKEN,
    ethReserve: 0n,
    graduationTarget: TARGET,
    halted: false,
    graduated: false,
  };
}

// ---------------------------------------------------------------------------
// Curve transitions (mirror Launchpad.buy / .sell)
// ---------------------------------------------------------------------------

function applyBuy(pool: Pool, ethIn: bigint) {
  const remaining = pool.graduationTarget - pool.ethReserve;
  const grossCap = FEE_BPS === 0n ? remaining : mulDivCeil(remaining, BPS, BPS - FEE_BPS);
  let grossIn = ethIn;
  let refund = 0n;
  if (grossIn > grossCap) {
    refund = grossIn - grossCap;
    grossIn = grossCap;
  }
  let fee = mulDiv(grossIn, FEE_BPS, BPS);
  let curveEth = grossIn - fee;
  let graduate = false;
  if (curveEth >= remaining) {
    curveEth = remaining;
    fee = grossIn - curveEth;
    graduate = true;
  }
  let tokensOut = mulDiv(pool.virtualToken, curveEth, pool.virtualEth + curveEth);
  const sellable = pool.virtualToken - LP_TOKEN_RESERVE;
  if (tokensOut > sellable) tokensOut = sellable;

  pool.virtualEth += curveEth;
  pool.virtualToken -= tokensOut;
  pool.ethReserve += curveEth;
  if (graduate) {
    pool.halted = true;
    pool.graduated = true; // no DEX in demo — treat as fully graduated
  }
  return { tokensOut, fee, curveEth, refund, grossIn };
}

function applySell(pool: Pool, tokenIn: bigint) {
  let gross = mulDiv(pool.virtualEth, tokenIn, pool.virtualToken + tokenIn);
  if (gross > pool.ethReserve) gross = pool.ethReserve;
  const fee = mulDiv(gross, FEE_BPS, BPS);
  const ethOut = gross - fee;
  pool.virtualEth -= gross;
  pool.virtualToken += tokenIn;
  pool.ethReserve -= gross;
  return { ethOut, fee, gross };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function serialize(s: State): string {
  return JSON.stringify(s, (_k, v) => (typeof v === "bigint" ? { __b: v.toString() } : v));
}
function deserialize(str: string): State {
  return JSON.parse(str, (_k, v) =>
    v && typeof v === "object" && "__b" in v ? BigInt((v as { __b: string }).__b) : v
  );
}

function pseudoAddress(seed: string): string {
  let h = 0n;
  for (let i = 0; i < seed.length; i++) h = (h * 131n + BigInt(seed.charCodeAt(i))) & ((1n << 160n) - 1n);
  return "0x" + h.toString(16).padStart(40, "0");
}

function randomAddress(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Seed data — a lively starting board
// ---------------------------------------------------------------------------

function seed(): State {
  const now = Math.floor(Date.now() / 1000);
  const s: State = {
    ethBalance: START_ETH,
    connected: false,
    address: DEMO_ADDRESS,
    blockNumber: 1000,
    tokens: [],
    balances: {},
    trades: {},
  };

  const defs: Array<{ name: string; symbol: string; desc: string; buys: bigint[]; ageMin: number }> = [
    { name: "Robinhood Doge", symbol: "RHDOGE", desc: "The people's dog coin, now on Robinhood Chain.", buys: [WAD / 10n, WAD / 5n, WAD / 4n], ageMin: 22 },
    { name: "Green Candle", symbol: "GREEN", desc: "Only up. Allegedly.", buys: [WAD / 2n, WAD / 3n, WAD / 4n, WAD / 5n], ageMin: 74 },
    { name: "To The Moon", symbol: "MOON", desc: "Fuel loaded. Curve almost full.", buys: [WAD, WAD, WAD / 2n, WAD / 2n], ageMin: 140 },
    { name: "Diamond Hands", symbol: "DIAMOND", desc: "Graduated. Trades on the DEX now.", buys: [5n * WAD], ageMin: 260 },
  ];

  defs.forEach((d, i) => {
    const address = pseudoAddress(d.symbol + i);
    const uri = `data:application/json;base64,${btoa(JSON.stringify({ description: d.desc }))}`;
    const tok: DToken = {
      address,
      name: d.name,
      symbol: d.symbol,
      uri,
      creator: pseudoAddress("creator" + i),
      createdAt: now - d.ageMin * 60,
      pool: freshPool(),
    };
    s.tokens.push(tok);
    s.trades[address] = [];
    let block = s.blockNumber;
    d.buys.forEach((amt, j) => {
      if (tok.pool.halted) return;
      const r = applyBuy(tok.pool, amt);
      block += 1 + j;
      s.trades[address].push({
        token: address,
        trader: pseudoAddress(`t${i}-${j}`),
        isBuy: true,
        ethAmount: r.curveEth,
        tokenAmount: r.tokensOut,
        feeAmount: r.fee,
        priceWei: priceWei(tok.pool.virtualEth, tok.pool.virtualToken),
        blockNumber: block,
        timestamp: tok.createdAt + (j + 1) * 90,
        txHash: pseudoAddress(`tx${i}-${j}`),
      });
    });
    s.blockNumber = block + 5;
  });

  return s;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function toSummary(t: DToken): TokenSummary {
  const price = priceWei(t.pool.virtualEth, t.pool.virtualToken);
  return {
    address: t.address as `0x${string}`,
    name: t.name,
    symbol: t.symbol,
    uri: t.uri,
    creator: t.creator as `0x${string}`,
    createdAt: t.createdAt,
    pool: {
      virtualEth: t.pool.virtualEth.toString(),
      virtualToken: t.pool.virtualToken.toString(),
      ethReserve: t.pool.ethReserve.toString(),
      graduationTarget: t.pool.graduationTarget.toString(),
      halted: t.pool.halted,
      graduated: t.pool.graduated,
    },
    priceWei: price.toString(),
    marketCapWei: marketCapWei(price).toString(),
    progressBps: progressBps(t.pool.ethReserve, t.pool.graduationTarget),
  };
}

function toTradeItem(tr: DTrade): TradeItem {
  return {
    token: tr.token as `0x${string}`,
    trader: tr.trader as `0x${string}`,
    isBuy: tr.isBuy,
    ethAmount: tr.ethAmount.toString(),
    tokenAmount: tr.tokenAmount.toString(),
    feeAmount: tr.feeAmount.toString(),
    priceWei: tr.priceWei.toString(),
    blockNumber: tr.blockNumber,
    timestamp: tr.timestamp,
    txHash: tr.txHash,
  };
}

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

export interface DemoApi {
  ready: boolean;
  connected: boolean;
  address: string;
  ethBalance: bigint;
  tokens: TokenSummary[];
  getToken: (address: string) => TokenSummary | null;
  getTrades: (address: string) => TradeItem[];
  balanceOf: (address: string) => bigint;
  connect: () => void;
  disconnect: () => void;
  createToken: (args: { name: string; symbol: string; uri: string }) => string;
  buy: (token: string, ethIn: bigint) => void;
  sell: (token: string, tokenIn: bigint) => void;
}

const DemoContext = createContext<DemoApi | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const ref = useRef<State | null>(null);
  ref.current = state;

  // Load (or seed) on mount — client only, so SSR stays deterministic.
  useEffect(() => {
    if (!DEMO_MODE) {
      setState(seed()); // harmless; unused when a real contract is set
      return;
    }
    try {
      const raw = localStorage.getItem(KEY);
      setState(raw ? deserialize(raw) : seed());
    } catch {
      setState(seed());
    }
  }, []);

  const persist = useCallback((next: State) => {
    setState({ ...next });
    if (DEMO_MODE) {
      try {
        localStorage.setItem(KEY, serialize(next));
      } catch {
        /* ignore quota / private mode */
      }
    }
  }, []);

  const api: DemoApi = {
    ready: state !== null,
    connected: state?.connected ?? false,
    address: state?.address ?? DEMO_ADDRESS,
    ethBalance: state?.ethBalance ?? START_ETH,
    tokens: state ? state.tokens.map(toSummary) : [],
    getToken: (address) => {
      const t = state?.tokens.find((x) => x.address.toLowerCase() === address.toLowerCase());
      return t ? toSummary(t) : null;
    },
    getTrades: (address) => {
      const list = state?.trades[Object.keys(state.trades).find((k) => k.toLowerCase() === address.toLowerCase()) ?? address];
      return (list ?? []).slice().sort((a, b) => b.blockNumber - a.blockNumber).map(toTradeItem);
    },
    balanceOf: (address) => {
      const key = Object.keys(state?.balances ?? {}).find((k) => k.toLowerCase() === address.toLowerCase());
      return key ? state!.balances[key] : 0n;
    },
    connect: () => {
      const s = ref.current;
      if (!s) return;
      persist({ ...s, connected: true, ethBalance: s.ethBalance === 0n ? START_ETH : s.ethBalance });
    },
    disconnect: () => {
      const s = ref.current;
      if (!s) return;
      persist({ ...s, connected: false });
    },
    createToken: ({ name, symbol, uri }) => {
      const s = ref.current!;
      const address = randomAddress();
      const tok: DToken = {
        address,
        name,
        symbol,
        uri,
        creator: s.address,
        createdAt: Math.floor(Date.now() / 1000),
        pool: freshPool(),
      };
      persist({
        ...s,
        tokens: [...s.tokens, tok],
        trades: { ...s.trades, [address]: [] },
        blockNumber: s.blockNumber + 1,
      });
      return address;
    },
    buy: (token, ethIn) => {
      const s = ref.current!;
      const idx = s.tokens.findIndex((t) => t.address.toLowerCase() === token.toLowerCase());
      if (idx < 0) return;
      const tok = s.tokens[idx];
      if (tok.pool.halted || ethIn <= 0n || ethIn > s.ethBalance) return;
      const pool = { ...tok.pool };
      const r = applyBuy(pool, ethIn);
      const block = s.blockNumber + 1;
      const newTok = { ...tok, pool };
      const balKey = Object.keys(s.balances).find((k) => k.toLowerCase() === token.toLowerCase()) ?? token;
      persist({
        ...s,
        ethBalance: s.ethBalance - r.grossIn,
        tokens: s.tokens.map((t, i) => (i === idx ? newTok : t)),
        balances: { ...s.balances, [balKey]: (s.balances[balKey] ?? 0n) + r.tokensOut },
        trades: {
          ...s.trades,
          [token]: [
            ...(s.trades[token] ?? []),
            {
              token,
              trader: s.address,
              isBuy: true,
              ethAmount: r.curveEth,
              tokenAmount: r.tokensOut,
              feeAmount: r.fee,
              priceWei: priceWei(pool.virtualEth, pool.virtualToken),
              blockNumber: block,
              timestamp: Math.floor(Date.now() / 1000),
              txHash: randomAddress(),
            },
          ],
        },
        blockNumber: block,
      });
    },
    sell: (token, tokenIn) => {
      const s = ref.current!;
      const idx = s.tokens.findIndex((t) => t.address.toLowerCase() === token.toLowerCase());
      if (idx < 0) return;
      const tok = s.tokens[idx];
      const balKey = Object.keys(s.balances).find((k) => k.toLowerCase() === token.toLowerCase()) ?? token;
      const held = s.balances[balKey] ?? 0n;
      if (tok.pool.halted || tokenIn <= 0n || tokenIn > held) return;
      const pool = { ...tok.pool };
      const r = applySell(pool, tokenIn);
      const block = s.blockNumber + 1;
      persist({
        ...s,
        ethBalance: s.ethBalance + r.ethOut,
        tokens: s.tokens.map((t, i) => (i === idx ? { ...tok, pool } : t)),
        balances: { ...s.balances, [balKey]: held - tokenIn },
        trades: {
          ...s.trades,
          [token]: [
            ...(s.trades[token] ?? []),
            {
              token,
              trader: s.address,
              isBuy: false,
              ethAmount: r.gross,
              tokenAmount: tokenIn,
              feeAmount: r.fee,
              priceWei: priceWei(pool.virtualEth, pool.virtualToken),
              blockNumber: block,
              timestamp: Math.floor(Date.now() / 1000),
              txHash: randomAddress(),
            },
          ],
        },
        blockNumber: block,
      });
    },
  };

  return <DemoContext.Provider value={api}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoApi {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    // Provider is always mounted; this fallback keeps types happy for any
    // component rendered outside it (shouldn't happen in practice).
    return {
      ready: false,
      connected: false,
      address: DEMO_ADDRESS,
      ethBalance: START_ETH,
      tokens: [],
      getToken: () => null,
      getTrades: () => [],
      balanceOf: () => 0n,
      connect: () => {},
      disconnect: () => {},
      createToken: () => "",
      buy: () => {},
      sell: () => {},
    };
  }
  return ctx;
}
