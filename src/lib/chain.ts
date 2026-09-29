// BNB Chain config + Stax asset registry.
// Default: BSC Testnet (chainId 97). Set NEXT_PUBLIC_CHAIN_ID=56 for BSC mainnet.
// Migrated from Mantle (chainId 5000) — see ../../../MIGRATION-BNB.md. Addresses that
// are not known/verified on BSC are read from env vars (never hard-coded guesses).
import { bsc, bscTestnet } from "viem/chains";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97);
export const IS_MAINNET = CHAIN_ID === bsc.id;
const BASE_CHAIN = IS_MAINNET ? bsc : bscTestnet;

export const RPC_URL =
  process.env.NEXT_PUBLIC_BSC_RPC_URL ||
  (IS_MAINNET ? "https://bsc-dataseed.bnbchain.org" : "https://data-seed-prebsc-1-s1.bnbchain.org:8545");

export const EXPLORER_URL = IS_MAINNET ? "https://bscscan.com" : "https://testnet.bscscan.com";

export const CHAIN = {
  id: BASE_CHAIN.id as number,
  name: IS_MAINNET ? "BNB Smart Chain" : "BNB Smart Chain Testnet",
  nativeCurrency: { name: "BNB", symbol: IS_MAINNET ? "BNB" : "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "BscScan", url: EXPLORER_URL } },
} as const;

// Canonical Multicall3 (same address on every EVM chain, incl. BSC 56 + 97).
// Server-side viem clients add this to their chain config so `batch.multicall`
// can aggregate read bursts into a single eth_call.
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const env = (v: string | undefined) => (v && v.trim() ? (v.trim() as `0x${string}`) : undefined);

// Settlement stablecoin. NOTE: BSC stables are 18 DECIMALS (not 6 like on Mantle).
// Mainnet default: Binance-Peg USDC. Testnet: deploy contracts/MockERC20 and set
// NEXT_PUBLIC_USDC_ADDRESS (zero address until configured).
const MAINNET_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
export const USDC = {
  address: (env(process.env.NEXT_PUBLIC_USDC_ADDRESS) ??
    (IS_MAINNET ? MAINNET_USDC : "0x0000000000000000000000000000000000000000")) as `0x${string}`,
  symbol: process.env.NEXT_PUBLIC_USDC_SYMBOL || "USDC",
  decimals: Number(process.env.NEXT_PUBLIC_USDC_DECIMALS || 18),
} as const;

/** Whole-dollar amount -> raw stablecoin units (respects USDC.decimals). */
export function usdToRaw(amountUsd: number): bigint {
  // Round to micro-dollars (6dp) first, then scale up to the token's decimals.
  const micro = BigInt(Math.round(amountUsd * 1_000_000));
  const d = USDC.decimals;
  return d >= 6 ? micro * BigInt(10) ** BigInt(d - 6) : micro / BigInt(10) ** BigInt(6 - d);
}

/** Raw stablecoin units -> dollars as a JS number. */
export function rawToUsd(raw: bigint): number {
  return Number(raw) / 10 ** USDC.decimals;
}

// InferenceVerifier (EIP-712) — public contract address, single source of truth.
// Set after deploying to BSC (contracts/scripts/deploy.js).
export const INFERENCE_VERIFIER = (process.env.NEXT_PUBLIC_INFERENCE_VERIFIER ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// PancakeSwap V3 SwapRouter (Uniswap-V3 ISwapRouter: exactInputSingle / exactInput
// with deadline). Same address on BSC mainnet + testnet (bscscan "PancakeSwap V3: Swap Router").
export const PANCAKE_V3_ROUTER = (env(process.env.NEXT_PUBLIC_DEX_ROUTER) ??
  "0x1b81D678ffb9C0263b24A97847620C99d213eB14") as `0x${string}`;

// Former Mantle venues (Fluxion = single-hop stocks, Agni = multi-hop routes) both
// map to the PancakeSwap V3 router on BNB Chain. Names kept to minimise the diff.
export const FLUXION_ROUTER = PANCAKE_V3_ROUTER;
export const AGNI_ROUTER = PANCAKE_V3_ROUTER;

export type AssetTier = "stock" | "safe" | "crypto";

export interface Asset {
  symbol: string;        // user-facing ticker
  name: string;
  tier: AssetTier;
  address?: `0x${string}`; // token address on BSC (from env; unset = listed but not buyable)
  pool?: `0x${string}`;    // PancakeSwap V3 USDC pool (stocks)
  feeTier?: number;        // PancakeSwap V3 fee tier
  decimals?: number;
  via: "fluxion" | "merchant_moe" | "agni" | "route";
}

/**
 * Per-asset BSC addresses, supplied as JSON in NEXT_PUBLIC_ASSET_ADDRESSES, e.g.
 *   {"AAPL":{"address":"0x…","pool":"0x…","feeTier":2500,"decimals":18}, "ETH":{"address":"0x…"}}
 * The Mantle xStock/sUSDe/mETH addresses do NOT exist on BSC. TODO: fill in the
 * tokenized-stock (e.g. BSC xStocks / Backed) + PancakeSwap V3 pool addresses for BSC.
 */
type AssetOverride = Partial<Pick<Asset, "address" | "pool" | "feeTier" | "decimals">>;
const ASSET_ENV: Record<string, AssetOverride> = (() => {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_ASSET_ADDRESSES || "{}");
  } catch {
    return {};
  }
})();
const withEnv = (a: Asset): Asset => ({ ...a, ...(ASSET_ENV[a.symbol] ?? {}) });

// ---- MVP universe (addresses come from NEXT_PUBLIC_ASSET_ADDRESSES on BSC) ----
export const STOCKS: Asset[] = (
  [
    { symbol: "AAPL",  name: "Apple",          tier: "stock", feeTier: 2500, decimals: 18, via: "fluxion" },
    { symbol: "TSLA",  name: "Tesla",          tier: "stock", feeTier: 2500, decimals: 18, via: "fluxion" },
    { symbol: "NVDA",  name: "Nvidia",         tier: "stock", feeTier: 2500, decimals: 18, via: "fluxion" },
    { symbol: "GOOGL", name: "Alphabet",       tier: "stock", feeTier: 2500, decimals: 18, via: "fluxion" },
    { symbol: "META",  name: "Meta",           tier: "stock", feeTier: 2500, decimals: 18, via: "fluxion" },
    { symbol: "MSTR",  name: "Strategy",       tier: "stock", feeTier: 2500, decimals: 18, via: "fluxion" },
    { symbol: "HOOD",  name: "Robinhood",      tier: "stock", feeTier: 2500, decimals: 18, via: "fluxion" },
    { symbol: "CRCL",  name: "Circle",         tier: "stock", feeTier: 2500, decimals: 18, via: "fluxion" },
    { symbol: "SPY",   name: "S&P 500 ETF",    tier: "stock", feeTier: 2500, decimals: 18, via: "fluxion" },
    { symbol: "QQQ",   name: "Nasdaq 100 ETF", tier: "stock", feeTier: 2500, decimals: 18, via: "fluxion" },
  ] as Asset[]
).map(withEnv);

export const SAFE: Asset[] = (
  [
    { symbol: "sUSDe", name: "Staked Ethena USD (real yield)", tier: "safe", decimals: 18, via: "agni" },
    { symbol: "USDY",  name: "Ondo US Dollar Yield",            tier: "safe", decimals: 18, via: "route" },
    { symbol: "mUSD",  name: "Ondo USD (rebasing)",             tier: "safe", decimals: 18, via: "route" },
  ] as Asset[]
).map(withEnv);

export const CRYPTO: Asset[] = (
  [
    { symbol: "mETH", name: "Staked ETH",          tier: "crypto", decimals: 18, via: "agni" },
    { symbol: "FBTC", name: "Bitcoin (tokenized)", tier: "crypto", decimals: 18, via: "merchant_moe" },
  ] as Asset[]
).map(withEnv);

export const ALL_ASSETS: Asset[] = [...STOCKS, ...SAFE, ...CRYPTO];

/** One hop of a PancakeSwap V3 route, with the pool we read for spot pricing. */
export interface RouteHop {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  fee: number; // V3 fee tier (uint24)
  pool: `0x${string}`; // V3 pool address (slot0 read for spot quote)
  tokenInDecimals: number;
  tokenOutDecimals: number;
}

/** A validated multi-hop swap route (USDC -> ... -> final asset) on a single router. */
export interface AssetRoute {
  router: `0x${string}`;
  kind: "agni_v3"; // PancakeSwap V3 exactInput(encodePacked path)
  hops: RouteHop[]; // ordered USDC-in -> final-out
}

/**
 * Validated multi-hop PancakeSwap V3 routes (USDC -> ... -> asset) for the SAFE/CRYPTO
 * tiers. The Mantle Agni routes (USDC->USDe->sUSDe, USDC->USDT->mETH) do not exist on
 * BSC. TODO: add validated BSC routes (pool addresses + fee tiers) here; until then
 * SAFE/CRYPTO assets are listed but not routable.
 */
export const ASSET_ROUTES: Record<string, AssetRoute> = {};

/** True if `symbol` has a validated, executor-routable swap route (any tier). */
export function isRoutable(symbol: string): boolean {
  if (STOCKS.some((s) => s.symbol === symbol && s.address && s.pool)) return true;
  return Boolean(ASSET_ROUTES[symbol]);
}

/**
 * Reverse a validated buy route (USDC -> ... -> asset) into its sell direction
 * (asset -> ... -> USDC). Same pools and fee tiers, hops walked backwards —
 * V3 pools are symmetric, so the reversed path is equally valid for exactInput.
 */
export function reverseRoute(hops: RouteHop[]): RouteHop[] {
  return [...hops].reverse().map((h) => ({
    tokenIn: h.tokenOut,
    tokenOut: h.tokenIn,
    fee: h.fee,
    pool: h.pool,
    tokenInDecimals: h.tokenOutDecimals,
    tokenOutDecimals: h.tokenInDecimals,
  }));
}
