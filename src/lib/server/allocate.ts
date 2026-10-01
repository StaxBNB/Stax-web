import "server-only";

// buildAllocation — Vera's core allocation logic, shared by the interactive
// /api/allocate route and the autonomous Autopilot executor. Turns a plain
// goal + amount into a validated, normalized allocation over BUYABLE assets.
//
// Models are reached through Anthropic-compatible gateways with the AI SDK's
// Anthropic provider (structured output = a forced `json` tool call):
//   xkiro      https://api.xkiro.com/v1                                    XKIRO_API_KEY
//   qwencloud  https://token-plan.maas.qwencloudapi.com/apps/anthropic/v1  QWEN_API_KEY (Token Plan key, sk-sp-…)
// They are tried in order (AI_MODELS overrides the default chain). Fast/free
// models can be rate-limited, slow, or answer off-schema, so any failure falls
// through to the next model instead of failing the user's plan.
import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { AllocationSchema, type Allocation } from "@/lib/allocation-schema";
import { ALL_ASSETS, isRoutable } from "@/lib/chain";
import { displayFor } from "@/lib/displayAssets";

const PROVIDERS = {
  xkiro: {
    baseURL: process.env.XKIRO_BASE_URL || "https://api.xkiro.com/v1",
    apiKey: process.env.XKIRO_API_KEY,
    disableThinking: false,
  },
  qwencloud: {
    baseURL: process.env.QWEN_BASE_URL || "https://token-plan.maas.qwencloudapi.com/apps/anthropic/v1",
    apiKey: process.env.QWEN_API_KEY,
    // QwenCloud runs its models in thinking mode by default, and thinking mode
    // rejects a forced tool_choice ("does not support being set to required or
    // object in thinking mode") — which is how the SDK gets structured output.
    // Turning it off also cuts latency (DeepSeek ~2.4s -> ~1.8s).
    disableThinking: true,
  },
} as const;
type ProviderName = keyof typeof PROVIDERS;

/**
 * Default fallback chain ("provider/model-id", tried in order), measured
 * 2026-10-01 on the real allocation prompt: fastest first, providers
 * interleaved so one slow/down gateway never blocks the other.
 *   qwencloud/deepseek-v4-flash-0731   ~2-3s
 *   xkiro/qwen/qwen3.8-omni-flash:free ~5-6s
 *   qwencloud/qwen3.8-flash            ~3s (needs thinking off)
 *   xkiro/z-ai/glm-5.3-flash           ~8s
 *   xkiro/xiaomi/mimo-v2.6-flash:free  returned HTTP 500 for every request that day (kept last)
 */
const DEFAULT_MODELS = [
  "qwencloud/deepseek-v4-flash-0731",
  "xkiro/qwen/qwen3.8-omni-flash:free",
  "qwencloud/qwen3.8-flash",
  "xkiro/z-ai/glm-5.3-flash",
  "xkiro/xiaomi/mimo-v2.6-flash:free",
];
export const AI_MODELS = (process.env.AI_MODELS || DEFAULT_MODELS.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Per-model budget, so one slow model can't stall the whole chain. */
const ATTEMPT_TIMEOUT_MS = 25_000;

const clients = new Map<ProviderName, ReturnType<typeof createAnthropic>>();

/**
 * The Anthropic SDK only sends `thinking` when it is enabled; it omits the field
 * for "disabled". A gateway that defaults to thinking therefore needs the
 * explicit `{ type: "disabled" }` added to the request body on the wire.
 */
const fetchWithThinkingDisabled: typeof fetch = (input, init) => {
  if (typeof init?.body === "string") {
    try {
      const body = JSON.parse(init.body);
      if (body && typeof body === "object" && body.thinking === undefined) {
        init = { ...init, body: JSON.stringify({ ...body, thinking: { type: "disabled" } }) };
      }
    } catch {
      /* not JSON: send as-is */
    }
  }
  return fetch(input, init);
};

/** "xkiro/z-ai/glm-5.3-flash" -> the xkiro client's "z-ai/glm-5.3-flash" model. */
function modelFor(entry: string) {
  const slash = entry.indexOf("/");
  const provider = entry.slice(0, slash) as ProviderName;
  const modelId = entry.slice(slash + 1);
  const cfg = PROVIDERS[provider];
  if (slash < 1 || !cfg) throw new Error(`Unknown AI provider in "${entry}" (expected xkiro/… or qwencloud/…).`);
  if (!cfg.apiKey) throw new Error(`${provider} API key is not configured.`);
  let client = clients.get(provider);
  if (!client) {
    client = createAnthropic({
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      name: provider,
      ...(cfg.disableThinking ? { fetch: fetchWithThinkingDisabled } : {}),
    });
    clients.set(provider, client);
  }
  return client(modelId);
}

// Only assets that are actually buyable in one tap: not a `coming` tier AND with
// a configured swap route on this chain (NEXT_PUBLIC_ASSET_ADDRESSES / ASSET_ROUTES).
// Offering the model an unroutable asset lets it build a plan the executor can't
// fill (the leg builder drops it, or rejects the whole plan if nothing is left).
const BUYABLE = ALL_ASSETS.filter((a) => !displayFor(a.symbol).coming && isRoutable(a.symbol));
const ALLOWED_SYMBOLS = new Set(BUYABLE.map((a) => a.symbol));
const BROAD_ETFS = BUYABLE.filter((a) => a.symbol === "SPY" || a.symbol === "QQQ").map((a) => a.symbol);

function systemPrompt(): string {
  const universe = BUYABLE.map((a) => `${a.symbol} — ${a.name} [${a.tier}]`).join("; ");
  // With no broad ETF to lean on, Vera must not dress up a stock slice as "safe" or
  // shade the riskScore down: it is signed into the on-chain risk gate.
  const safeHint = BROAD_ETFS.length
    ? `lean on broad ETFs (${BROAD_ETFS.join(", ")})`
    : "spread the money across the available names and say plainly, in one short sentence, that a lower-risk option is not available yet. Never call a stock slice 'safe', and keep the riskScore true to the assets you chose";
  return [
    "You are Stax, an AI investing copilot on BNB Chain.",
    "You turn a person's plain-language goal into a concrete portfolio of REAL tokenized assets they can buy in one tap.",
    "",
    "RULES:",
    `- Allocate ONLY across these available assets: ${universe}.`,
    "- Tiers: 'stock' = tokenized equities/ETFs; 'crypto' = tokenized crypto.",
    `- There is no yield 'safe' dollar available right now. If the user wants to play it safe or keep some money low-risk, ${safeHint}; never invent an asset that is not in the list above.`,
    "- Weights MUST sum to exactly 100.",
    "- List each asset at most once (one entry per symbol).",
    "- Diversify sensibly for the user's risk. Don't put everything in one volatile name unless they explicitly insist.",
    "- Map risk: broad ETFs ~3000-4500; single tech stocks ~5000-7000; crypto ~7000-9000. riskScore is the blended portfolio risk.",
    "- Explain like the user has never invested before. Warm, concrete, zero jargon. Briefly note that tokenized stocks track the real share price.",
    "- Respond with valid JSON that matches the required shape.",
    "- Writing style for ALL text fields (summary, rationale, each reason): short plain sentences. NEVER use em dashes (—) or double hyphens ('--'); use commas, periods, colons, or parentheses instead. No marketing buzzwords (supercharge, seamless, unleash, world-class, etc.). Don't restate the goal back; get to the substance.",
  ].join("\n");
}

/**
 * Keep known symbols with a positive weight, merge a symbol the model listed more
 * than once (one row, one swap leg per asset; its first reason wins), and
 * re-normalize weights to 100. Throws if nothing usable is left.
 */
function normalize(object: Allocation): Allocation {
  const bySymbol = new Map<string, Allocation["allocations"][number]>();
  for (const a of object.allocations) {
    if (!ALLOWED_SYMBOLS.has(a.symbol) || !(a.weightPct > 0)) continue;
    const prev = bySymbol.get(a.symbol);
    bySymbol.set(a.symbol, prev ? { ...prev, weightPct: prev.weightPct + a.weightPct } : { ...a });
  }
  const filtered = [...bySymbol.values()];
  if (filtered.length === 0) {
    throw new Error("Could not build a valid allocation. Try rephrasing the goal.");
  }
  const total = filtered.reduce((s, a) => s + a.weightPct, 0);
  const allocations = filtered.map((a) => ({
    ...a,
    weightPct: total > 0 ? Math.round((a.weightPct / total) * 10000) / 100 : 0,
  }));
  return { ...object, allocations };
}

export interface AllocationResult {
  allocation: Allocation;
  /** The "provider/model" entry that produced it. */
  model: string;
}

/**
 * Build a validated allocation, walking the model chain until one succeeds.
 * Throws only if every model fails (each failure is logged server-side).
 */
export async function buildAllocation(
  goal: string,
  amountUsd: number,
  riskTolerance?: string,
): Promise<AllocationResult> {
  if (BUYABLE.length === 0) {
    throw new Error("No buyable assets are configured (check NEXT_PUBLIC_ASSET_ADDRESSES).");
  }

  const failures: string[] = [];
  for (const entry of AI_MODELS) {
    try {
      const { object } = await generateObject({
        model: modelFor(entry),
        schema: AllocationSchema,
        system: systemPrompt(),
        prompt: [
          `Goal: ${goal}`,
          `Amount to invest: $${amountUsd}`,
          `Risk preference: ${riskTolerance ?? "infer from the goal"}`,
          "Build the allocation now.",
        ].join("\n"),
        maxRetries: 0, // the chain is the retry
        abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      return { allocation: normalize(object), model: entry };
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 200);
      failures.push(`${entry}: ${msg}`);
      console.warn(`[allocate] ${entry} failed, trying the next model: ${msg}`);
    }
  }
  throw new Error(`Every AI model failed. ${failures.join(" | ")}`);
}
