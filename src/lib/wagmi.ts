// BNB Chain (BSC testnet 97 by default, mainnet 56 via NEXT_PUBLIC_CHAIN_ID) wiring for wagmi + viem.
// One source of truth for the chain object, the wagmi config, and a shared
// read-only viem public client. Imported by providers.tsx, aa.ts, and any
// component/hook that needs on-chain reads.
import { createConfig, http } from "wagmi";
import { createPublicClient, defineChain } from "viem";
import { CHAIN, MULTICALL3, RPC_URL } from "./chain";

/**
 * The active BNB Chain network as a proper viem `Chain`. Built with `defineChain` so it
 * carries the full type surface viem/wagmi/permissionless expect. Mirrors `CHAIN` in chain.ts.
 */
export const bnbChain = defineChain({
  ...CHAIN,
  contracts: {
    multicall3: { address: MULTICALL3 },
  },
});

/**
 * wagmi config. The embedded wallet + signing is owned by Privy (via its
 * `getEthereumProvider()` EIP-1193 surface, consumed in lib/aa.ts), so wagmi
 * here is configured purely for chain context + HTTP transports used by hooks
 * that read on-chain state. No connector is registered: account abstraction
 * sends transactions through the Pimlico smart-account client, not wagmi.
 */
export const wagmiConfig = createConfig({
  chains: [bnbChain],
  transports: {
    [bnbChain.id]: http(RPC_URL),
  },
  ssr: true,
});

/**
 * Shared read-only client for balances, allowances, pool quotes, receipts.
 * `batch.multicall` aggregates every readContract issued in the same tick into
 * ONE Multicall3 eth_call — a portfolio refresh (15 balanceOf) or a quote burst
 * becomes a single RPC request instead of 15-20, which is what the public
 * BSC dataseed rate limiter demands (unbatched bursts get some calls dropped,
 * making holdings flicker in and out).
 */
export const publicClient = createPublicClient({
  chain: bnbChain,
  batch: { multicall: { wait: 16 } },
  transport: http(RPC_URL),
});

export type WagmiConfig = typeof wagmiConfig;
