import "server-only";

// Stax transaction log — our own record of every transaction the app sends.
//
// Wallet history, Activity and Vera's track record read from this log instead of
// an explorer API (Etherscan's free tier does not cover BSC, and raw eth_getLogs
// scans grow slower every block). Each row keeps the tx hash, so the UI can link
// straight to the block explorer as proof.
//
// Trust model: callers only hand us a tx hash. Everything stored is re-derived
// here from the on-chain receipt (sender, token flows, fee, plan, risk), so a
// client can't log amounts that didn't happen — and recording someone else's tx
// only ever records what the chain already says about their wallet.
//
// Triggers: lib/aa.ts (every sponsored UserOp sent from the browser, via
// POST /api/tx-log) and the Autopilot executor (server-side runs).
import { createPublicClient, decodeEventLog, formatUnits, http, parseAbiItem, type Hex, type Log } from "viem";
import { CHAIN, RPC_URL, USDC, ALL_ASSETS, PANCAKE_V3_ROUTER } from "@/lib/chain";
import { STAX_TREASURY } from "@/lib/fees";
import {
  STAX_EXECUTOR,
  RECOMMENDATION_COMMITTED,
  ALLOCATION_EXECUTED,
  aggregateVeraRecord,
  toActivityRows,
  type ActivityRow,
  type ExecutionRow,
  type RecommendationRow,
  type VeraRecord,
} from "@/lib/onchainHistory";
import { displayFor } from "@/lib/displayAssets";
import type { WalletTx, WalletTxKind } from "@/lib/walletTx";
import { supabaseAdmin } from "@/lib/server/supabase";

const TABLE = "wallet_tx_staxBNB";
const ZERO = "0x0000000000000000000000000000000000000000";
// ERC-4337 EntryPoint v0.7 (the version lib/aa.ts and the Autopilot use).
const ENTRY_POINT = "0x0000000071727de22e5e9d8baf0edac6f37da032";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const USER_OPERATION_EVENT = parseAbiItem(
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
);

const client = createPublicClient({
  chain: { id: CHAIN.id, name: CHAIN.name, nativeCurrency: CHAIN.nativeCurrency, rpcUrls: CHAIN.rpcUrls },
  transport: http(RPC_URL),
});

const lc = (a: string) => a.toLowerCase();

// Tokens we label (USDC + every configured asset), keyed by lowercase address.
const TOKENS = new Map<string, { symbol: string; decimals: number }>();
TOKENS.set(lc(USDC.address), { symbol: USDC.symbol, decimals: USDC.decimals });
for (const a of ALL_ASSETS) {
  if (a.address) TOKENS.set(lc(a.address), { symbol: a.symbol, decimals: a.decimals ?? 18 });
}
const USDC_KEY = lc(USDC.address);

// Protocol plumbing — never a wallet a row is "about".
const SYSTEM = new Set<string>([
  lc(STAX_EXECUTOR),
  lc(PANCAKE_V3_ROUTER),
  lc(STAX_TREASURY),
  ENTRY_POINT,
  ...ALL_ASSETS.filter((a) => a.pool).map((a) => lc(a.pool!)),
]);

interface TokenMove {
  token: string;
  symbol: string;
  decimals: number;
  from: string;
  to: string;
  value: bigint;
}

export interface TxLogAsset {
  symbol: string;
  token: string;
  amount: string;
  direction: "in" | "out";
}

interface TxLogRow {
  chain_id: number;
  tx_hash: string;
  address: string;
  kind: WalletTxKind;
  block_number: number;
  block_time: number | null;
  user_op_hash: string | null;
  usdc_out: string;
  usdc_in: string;
  fee_usd: string;
  usdc_spent: string | null;
  assets: TxLogAsset[];
  counterparty: string | null;
  plan_id: string | null;
  risk_score: number | null;
  leg_count: number | null;
}

function decode<T>(abi: readonly unknown[], log: Log): T | null {
  try {
    return decodeEventLog({ abi: abi as never, data: log.data, topics: log.topics as [Hex, ...Hex[]] }).args as T;
  } catch {
    return null;
  }
}

const sumOf = (moves: TokenMove[]) => moves.reduce((s, m) => s + m.value, BigInt(0));
const usd = (raw: bigint) => formatUnits(raw, USDC.decimals);

/**
 * Re-derive the log rows for `txHash` from its receipt and upsert them.
 * `source: "autopilot"` marks a server-side Autopilot run (indistinguishable
 * on-chain from a manual invest). Returns the rows written (empty if the tx
 * failed or touched no tracked wallet).
 */
export async function recordTx(txHash: Hex, opts: { source?: "autopilot" } = {}): Promise<TxLogRow[]> {
  // The caller usually has the receipt already, but the RPC we read from can
  // trail the bundler by a block — wait briefly rather than miss the record.
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 20_000 });
  if (receipt.status !== "success") return [];

  const moves: TokenMove[] = [];
  const userOps = new Map<string, { userOpHash: string; success: boolean }>();
  const recs = new Map<string, { planId: string; riskScore: number }>();
  const execs = new Map<string, { usdcSpent: bigint; legCount: number }>();

  for (const log of receipt.logs) {
    const addr = lc(log.address);
    const token = TOKENS.get(addr);
    if (token) {
      const t = decode<{ from: string; to: string; value: bigint }>([TRANSFER], log);
      if (t) moves.push({ token: addr, ...token, from: lc(t.from), to: lc(t.to), value: t.value });
      continue;
    }
    if (addr === ENTRY_POINT) {
      const u = decode<{ userOpHash: string; sender: string; success: boolean }>([USER_OPERATION_EVENT], log);
      if (u) userOps.set(lc(u.sender), { userOpHash: u.userOpHash, success: u.success });
      continue;
    }
    if (addr === lc(STAX_EXECUTOR)) {
      const r = decode<{ planId: string; user: string; riskScore: number }>([RECOMMENDATION_COMMITTED], log);
      if (r) {
        recs.set(lc(r.user), { planId: r.planId, riskScore: Number(r.riskScore) });
        continue;
      }
      const e = decode<{ user: string; usdcSpent: bigint; legCount: bigint }>([ALLOCATION_EXECUTED], log);
      if (e) execs.set(lc(e.user), { usdcSpent: e.usdcSpent, legCount: Number(e.legCount) });
    }
  }

  // Wallets this tx is about: every non-system party to a tracked token move.
  const wallets = new Set<string>();
  for (const m of moves) {
    for (const a of [m.from, m.to]) if (a !== ZERO && !SYSTEM.has(a)) wallets.add(a);
  }

  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const rows: TxLogRow[] = [];

  for (const wallet of wallets) {
    const op = userOps.get(wallet);
    if (op && !op.success) continue; // reverted UserOp: nothing actually moved

    const outs = moves.filter((m) => m.from === wallet);
    const ins = moves.filter((m) => m.to === wallet);
    const assetOuts = outs.filter((m) => m.token !== USDC_KEY);
    const assetIns = ins.filter((m) => m.token !== USDC_KEY);
    const exec = execs.get(wallet);
    const rec = recs.get(wallet);
    // USDC to the treasury is the platform fee only when it rides along with a
    // trade; on its own it's an ordinary send that happens to target the treasury.
    const isTrade = Boolean(exec) || assetIns.length > 0 || assetOuts.length > 0;
    const usdcOutAll = sumOf(outs.filter((m) => m.token === USDC_KEY));
    const fee = isTrade ? sumOf(outs.filter((m) => m.token === USDC_KEY && m.to === lc(STAX_TREASURY))) : BigInt(0);
    const usdcOut = usdcOutAll - fee;
    const usdcIn = sumOf(ins.filter((m) => m.token === USDC_KEY));

    let kind: WalletTxKind;
    let counterparty: string | null = null;
    if (exec) kind = opts.source === "autopilot" ? "autopilot" : "invest";
    else if (usdcOut > BigInt(0) && assetIns.length && !assetOuts.length) kind = "buy";
    else if (assetOuts.length && usdcIn > BigInt(0)) kind = "sell";
    else if (outs.length && !ins.length) {
      kind = "send";
      counterparty = outs[0].to;
    } else if (ins.length && !outs.length) {
      kind = "receive";
      counterparty = ins[0].from;
    } else kind = "other";

    const assets: TxLogAsset[] = [
      ...assetIns.map((m) => ({ symbol: m.symbol, token: m.token, amount: formatUnits(m.value, m.decimals), direction: "in" as const })),
      ...assetOuts.map((m) => ({ symbol: m.symbol, token: m.token, amount: formatUnits(m.value, m.decimals), direction: "out" as const })),
    ];
    // send/receive of USDC itself is carried in usdc_out/usdc_in; record it as an asset too so
    // the row always names what moved.
    if ((kind === "send" || kind === "receive") && !assets.length) {
      assets.push({
        symbol: USDC.symbol,
        token: USDC_KEY,
        amount: usd(kind === "send" ? usdcOut : usdcIn),
        direction: kind === "send" ? "out" : "in",
      });
    }

    rows.push({
      chain_id: CHAIN.id,
      tx_hash: lc(txHash),
      address: wallet,
      kind,
      block_number: Number(receipt.blockNumber),
      block_time: Number(block.timestamp),
      user_op_hash: op?.userOpHash ?? null,
      usdc_out: usd(usdcOut),
      usdc_in: usd(usdcIn),
      fee_usd: usd(fee),
      usdc_spent: exec ? usd(exec.usdcSpent) : null,
      assets,
      counterparty,
      plan_id: rec?.planId ?? null,
      risk_score: rec?.riskScore ?? null,
      leg_count: exec?.legCount ?? null,
    });
  }

  if (rows.length) {
    const { error } = await supabaseAdmin().from(TABLE).upsert(rows, { onConflict: "chain_id,tx_hash,address" });
    if (error) throw new Error(error.message);
  }
  return rows;
}

// ── reads ─────────────────────────────────────────────────────────────────────
type DbRow = Omit<TxLogRow, "usdc_out" | "usdc_in" | "fee_usd" | "usdc_spent"> & {
  usdc_out: number | string;
  usdc_in: number | string;
  fee_usd: number | string;
  usdc_spent: number | string | null;
};

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));
const nameOf = (symbol: string) => displayFor(symbol).name;

/** Map one log row to the wallet-history shape the UI renders. */
function toWalletTx(r: DbRow): WalletTx {
  const firstIn = r.assets.find((a) => a.direction === "in");
  const firstOut = r.assets.find((a) => a.direction === "out");
  const base = {
    hash: r.tx_hash as Hex,
    kind: r.kind,
    tokenAddress: "",
    blockNumber: Number(r.block_number),
    timestamp: r.block_time ?? undefined,
    counterparty: r.counterparty ?? "",
  };
  switch (r.kind) {
    case "invest":
    case "autopilot":
      return {
        ...base,
        direction: "out",
        symbol: USDC.symbol,
        amount: num(r.usdc_out) + num(r.fee_usd) - num(r.usdc_in),
        label: r.kind === "autopilot" ? "Autopilot invested" : "Invested in a plan",
      };
    case "buy":
      return {
        ...base,
        direction: "out",
        symbol: USDC.symbol,
        amount: num(r.usdc_out) + num(r.fee_usd),
        label: `Bought ${nameOf(firstIn?.symbol ?? "")}`,
        logo: firstIn?.symbol,
      };
    case "sell":
      return {
        ...base,
        direction: "in",
        symbol: USDC.symbol,
        amount: num(r.usdc_in),
        label: `Sold ${nameOf(firstOut?.symbol ?? "")}`,
        logo: firstOut?.symbol,
      };
    case "send":
    case "receive": {
      const a = r.kind === "send" ? firstOut : firstIn;
      return {
        ...base,
        direction: r.kind === "send" ? "out" : "in",
        symbol: a?.symbol ?? USDC.symbol,
        amount: Number(a?.amount ?? 0),
        tokenAddress: a?.token ?? "",
      };
    }
    default:
      return { ...base, direction: "out", symbol: firstOut?.symbol ?? USDC.symbol, amount: Number(firstOut?.amount ?? 0) };
  }
}

/** Wallet history for `address`, newest first. */
export async function listWalletTx(address: string, limit = 50): Promise<WalletTx[]> {
  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("chain_id", CHAIN.id)
    .eq("address", lc(address))
    .order("block_number", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data as DbRow[]) ?? []).map(toWalletTx);
}

async function investRows(user?: string): Promise<DbRow[]> {
  let q = supabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("chain_id", CHAIN.id)
    .in("kind", ["invest", "autopilot"])
    .order("block_number", { ascending: false })
    .limit(500);
  if (user) q = q.eq("address", lc(user));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as DbRow[]) ?? [];
}

function toRecAndExec(rows: DbRow[]): { recs: RecommendationRow[]; execs: ExecutionRow[] } {
  const recs: RecommendationRow[] = [];
  const execs: ExecutionRow[] = [];
  for (const r of rows) {
    const planId = (r.plan_id ?? r.tx_hash) as Hex;
    const blockNumber = BigInt(r.block_number);
    recs.push({ planId, user: r.address as Hex, riskScore: r.risk_score ?? 0, txHash: r.tx_hash as Hex, blockNumber });
    execs.push({
      planId,
      user: r.address as Hex,
      usdcSpent: num(r.usdc_spent),
      legCount: r.leg_count ?? 0,
      txHash: r.tx_hash as Hex,
      blockNumber,
    });
  }
  return { recs, execs };
}

/** Vera's track record (global, or scoped to one wallet) from the log. */
export async function veraRecordFromLog(user?: string): Promise<VeraRecord> {
  const { recs, execs } = toRecAndExec(await investRows(user));
  return aggregateVeraRecord(recs, execs);
}

/** A wallet's plan activity (AI invests + Autopilot runs), newest first. */
export async function activityFromLog(user: string): Promise<ActivityRow[]> {
  return toActivityRows(toRecAndExec(await investRows(user)).execs);
}
