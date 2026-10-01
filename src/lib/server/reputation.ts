import "server-only";

// Vera's IdentityRegistry reputation score — a single eth_call, cached 5 min.
import { createPublicClient, http } from "viem";
import { CHAIN, RPC_URL } from "@/lib/chain";
import { IDENTITY_REGISTRY_ABI } from "@/lib/abis";

const IDENTITY_REGISTRY = (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
const AGENT_ID = BigInt(process.env.NEXT_PUBLIC_STAX_AGENT_ID || "1");
const TTL_MS = 300_000;

const client = createPublicClient({
  chain: { id: CHAIN.id, name: CHAIN.name, nativeCurrency: CHAIN.nativeCurrency, rpcUrls: CHAIN.rpcUrls },
  transport: http(RPC_URL),
});

let cache: { at: number; value: bigint | null } | null = null;

export async function getReputationServer(): Promise<bigint | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: bigint | null;
  try {
    value = (await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "reputationScore",
      args: [AGENT_ID],
    })) as bigint;
  } catch {
    value = null;
  }
  cache = { at: Date.now(), value };
  return value;
}
