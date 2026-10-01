// register-vera-8004.mjs — register Vera in the CANONICAL ERC-8004 Identity
// Registry on BNB Chain (BSC), so she appears on 8004scan.io.
//
// Safe by design: DRY-RUN by default (checks the registry, the agent card URL,
// and your balance; no broadcast). It only sends when you pass `--go`.
//
// Usage (run it yourself — it spends a little BNB on gas):
//   node scripts/register-vera-8004.mjs        # dry run: verify everything
//   node scripts/register-vera-8004.mjs --go   # BROADCAST register(agentURI)
//
// Signs with AGENT_SIGNER_PRIVATE_KEY from .env.local (Vera's own signer wallet
// registers her identity; it must hold a little BNB for gas). The agent card at
// https://stax-bnb.vercel.app/.well-known/agent-card.json must be DEPLOYED (live)
// before registering — 8004scan fetches it to index the agent.
import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, formatEther, parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── BNB Chain (BSC mainnet 56 / testnet 97) + canonical ERC-8004 registry ────
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97);
const IS_MAINNET = CHAIN_ID === 56;
const RPC = process.env.NEXT_PUBLIC_BSC_RPC_URL ||
  (IS_MAINNET ? "https://bsc-dataseed.bnbchain.org" : "https://data-seed-prebsc-1-s1.bnbchain.org:8545");
const EXPLORER = IS_MAINNET ? "https://bscscan.com" : "https://testnet.bscscan.com";
// Canonical ERC-8004 Identity Registry (vanity addresses, verified on-chain):
// BSC mainnet 0x8004A169…a432, BSC testnet 0x8004A818…BD9e (the mainnet address has
// no code on 97). Override with ERC8004_IDENTITY_REGISTRY; the script aborts below if
// no code is found at the address.
const IDENTITY_REGISTRY = process.env.ERC8004_IDENTITY_REGISTRY ||
  (IS_MAINNET ? "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" : "0x8004A818BFB912233c491871b3d84c89A494BD9e");
const AGENT_URI = process.env.AGENT_CARD_URI || "https://stax-bnb.vercel.app/.well-known/agent-card.json";

const bnbChain = {
  id: CHAIN_ID, name: IS_MAINNET ? "BNB Smart Chain" : "BNB Smart Chain Testnet",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const REGISTRY_ABI = [
  { name: "register", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }] },
  { name: "tokenURI", type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
  { name: "ownerOf", type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "event", name: "Transfer", inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: true, name: "tokenId", type: "uint256" } ] },
];

// ── key loading (AGENT_SIGNER_PRIVATE_KEY env or .env.local) ───────────────────────
function loadKey() {
  if (process.env.AGENT_SIGNER_PRIVATE_KEY) return process.env.AGENT_SIGNER_PRIVATE_KEY;
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const m = env.match(/^AGENT_SIGNER_PRIVATE_KEY=("?)(.+?)\1\s*$/m);
    if (m) return m[2];
  } catch { /* fall through */ }
  console.error("AGENT_SIGNER_PRIVATE_KEY not found (env or web/.env.local).");
  process.exit(1);
}

const GO = process.argv.includes("--go");
const key = loadKey();
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
const pub = createPublicClient({ chain: bnbChain, transport: http(RPC) });

console.log(`signer: ${account.address}`);
console.log(`registry: ${IDENTITY_REGISTRY} (canonical ERC-8004, BNB Chain ${CHAIN_ID})`);
console.log(`agentURI: ${AGENT_URI}`);

// 1. Registry really deployed?
const code = await pub.getCode({ address: IDENTITY_REGISTRY });
if (!code || code === "0x") { console.error("No registry code on this BNB Chain network (set ERC8004_IDENTITY_REGISTRY) — abort."); process.exit(1); }
console.log("registry code: OK");

// 2. Agent card live? (8004scan must be able to fetch it)
try {
  const res = await fetch(AGENT_URI);
  const card = await res.json();
  if (!res.ok || !card.name) throw new Error(`status ${res.status}`);
  console.log(`agent card live: OK ("${card.name}")`);
} catch (e) {
  console.error(`agent card NOT reachable at ${AGENT_URI} (${e.message}).`);
  console.error("Deploy the site first (public/.well-known/agent-card.json), then re-run.");
  process.exit(1);
}

// 3. Gas balance?
const bal = await pub.getBalance({ address: account.address });
console.log(`BNB balance: ${formatEther(bal)}`);
if (bal === 0n) { console.error("Signer has no BNB for gas — fund it, then re-run."); process.exit(1); }

// 4. Simulate the call.
const { request } = await pub.simulateContract({
  account, address: IDENTITY_REGISTRY, abi: REGISTRY_ABI,
  functionName: "register", args: [AGENT_URI],
});
console.log("simulation: OK (register(agentURI) would succeed)");

if (!GO) {
  console.log("\nDRY RUN complete. Re-run with --go to broadcast.");
  process.exit(0);
}

// 5. Broadcast + wait.
const wallet = createWalletClient({ account, chain: bnbChain, transport: http(RPC) });
const hash = await wallet.writeContract(request);
console.log(`tx: ${hash}`);
const receipt = await pub.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") { console.error("Transaction reverted."); process.exit(1); }

// 6. Pull the minted tokenId from the Transfer event.
const transfers = parseEventLogs({ abi: REGISTRY_ABI, logs: receipt.logs, eventName: "Transfer" });
const tokenId = transfers.at(-1)?.args?.tokenId;
console.log("\n✅ Vera is registered in the canonical ERC-8004 registry on BNB Chain.");
console.log(`agentId: ${CHAIN_ID}:${tokenId}`);
console.log(`BscScan: ${EXPLORER}/tx/${hash}`);
console.log(`8004scan:  https://www.8004scan.io/agents/${CHAIN_ID}/${tokenId}`);
