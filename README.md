<div align="center">

<img src="public/brand/stax-dark.png#gh-light-mode-only" alt="Stax" width="92" />
<img src="public/brand/stax-light.png#gh-dark-mode-only" alt="Stax" width="92" />

# Stax

**Own the world's best companies — onchain, in one tap.**

Buy fractional shares of real tokenized stocks on BNB Chain, guided by **Vera**, an AI agent
whose every recommendation is **signed and verified on-chain before a cent moves**.

An AI agent that turns plain-language goals into risk-managed, verifiable RWA portfolios — originally built for the Mantle Turing Test Hackathon 2026, now running on **BNB Chain**.

<img src="docs/demo.gif" alt="Stax demo: Vera builds a plan in the real app, then her ERC-8004 identity on BSC testnet" width="600" />

### [▶ Live at stax-bnb.vercel.app](https://stax-bnb.vercel.app)

[Watch the 66-second film](https://stax-bnb.vercel.app/stax-film.mp4) · [Contracts on BNB Chain ↓](#contracts-on-bnb-chain-bsc-testnet-97--mainnet-56) · [@HGunawan07 on X](https://x.com/HGunawan07)

</div>

---

## What makes it different — verifiable AI, on-chain

Most "AI × crypto" entries are a chatbot wrapped around a static product. Stax puts the AI
**inside the on-chain transaction** — the contract refuses to move funds unless the AI's signed
risk assessment passes verification:

```
Goal → /api/allocate          Vera turns plain words into a real allocation
     → /api/invest-plan        the server SIGNS an EIP-712 risk inference with the agent key
     → one gasless UserOp → StaxExecutor.investWithAI(...)
          → InferenceVerifier.verify(...)   reverts unless the signature is valid,
                                            assessedRisk ≤ maxRisk, and not expired
          → swaps execute (PancakeSwap V3)  emits RecommendationCommitted / AllocationExecuted
     → the app reads the events back for the receipt + Vera's public track record
```

That's the "provable, not just promised" guarantee on the success screen: the advice is
cryptographically signed and checked by a contract, not a marketing claim.

## How tracking works — every record carries its on-chain proof

`StaxExecutor` emits an event on every plan, so the chain stays the source of truth:

| Event | Emitted when | Drives |
|---|---|---|
| `RecommendationCommitted(planId, user, recHash, riskScore, agentId)` | a plan is committed | "Plans built" |
| `AllocationExecuted(planId, user, usdcSpent, legCount)` | the invest executes | "Placed" + "$ invested" |
| `LegFilled(planId, tokenOut, usdcIn, received)` | each swap leg fills | per-asset detail |

For speed (and because explorer APIs don't cover BSC on a free plan), the app keeps its own
**transaction log** ([`src/lib/server/txLog.ts`](src/lib/server/txLog.ts), Supabase table `wallet_tx_staxBNB`). After every
transaction the client sends only the **tx hash** to `POST /api/tx-log`; the server re-reads the
receipt from the chain and re-derives the record (wallet, action, amounts, fee, plan, risk) from
these events and the token transfers — nothing a client claims is stored. Wallet history, Activity
and Vera's track record read from that log, and every row links to BscScan by its tx hash.

Vera's track record (plans built, plans placed, dollars invested) is counted from those events,
so anyone can audit her history on-chain — nothing is editable after the fact. `IdentityRegistry`
also has a `reputationScore(agentId)` slot fed by owner-only `giveFeedback()`; post-trade scoring
is not wired up yet.

## Contracts on BNB Chain (BSC testnet 97 / mainnet 56)

> Migrated from Mantle — see [MIGRATION-BNB.md](https://github.com/bcc-ukdw/seed-bnb/blob/main/stax/MIGRATION-BNB.md). **Live on BSC testnet (97)**: the set below was
> redeployed on 2026-09-29 (new deployer + agent signer) and every contract is **verified on BscScan**. Full record:
> [`deployments/bsc-testnet.json`](https://github.com/StaxBNB/Stax-contracts/blob/main/deployments/bsc-testnet.json) (it also lists the superseded 2026-09-25 set). Not yet on mainnet.

| Contract | Address | Role |
|---|---|---|
| **StaxExecutor** | [`0x7c67f22f27fc50ed99a848e5a4b6324b9ea16a3d`](https://testnet.bscscan.com/address/0x7c67f22f27fc50ed99a848e5a4b6324b9ea16a3d#code) | Commits the recommendation, calls the verifier, runs the swaps (non-custodial), emits the tracking events. Router/asset whitelists + slippage guards. |
| **InferenceVerifier** | [`0x15cfe310256c482e28699115430f6a323386e801`](https://testnet.bscscan.com/address/0x15cfe310256c482e28699115430f6a323386e801#code) | EIP-712 gate: `verify()` reverts unless the signature recovers to the agent signer, `assessedRisk ≤ maxRisk`, and `block.timestamp ≤ expiry`. |
| **IdentityRegistry** | [`0xfbc601d4d084ac9f134b88662cf5162c27e8ff4b`](https://testnet.bscscan.com/address/0xfbc601d4d084ac9f134b88662cf5162c27e8ff4b#code) | ERC-8004-style agent identity (Vera = **agentId 2**, an ERC-721 whose `tokenURI` is her agent card) + reputation/feedback. |
| **MockERC20** (testnet only) | [`0x83f2dd5155dfe7d8eaa3d390c21fe89e2f1968bb`](https://testnet.bscscan.com/address/0x83f2dd5155dfe7d8eaa3d390c21fe89e2f1968bb#code) | 18-decimal "Mock USDC" settlement token for BSC testnet. |

Testnet-only mock assets (PancakeSwap V3, 0.25% tier, small full-range liquidity): AAPLx [`0xfc66023ef47b05bfd192cda3619e4f34db882258`](https://testnet.bscscan.com/address/0xfc66023ef47b05bfd192cda3619e4f34db882258) (pool [`0x3649748053A842c65A0f0Fdb9F932f5A542b13b4`](https://testnet.bscscan.com/address/0x3649748053A842c65A0f0Fdb9F932f5A542b13b4)), TSLAx [`0x1affa0ee05549c777772a100cb32877dd1390b9e`](https://testnet.bscscan.com/address/0x1affa0ee05549c777772a100cb32877dd1390b9e) (pool [`0x77ebB0FAFb1BE749C5055E9bB81EaD2210BFa582`](https://testnet.bscscan.com/address/0x77ebB0FAFb1BE749C5055E9bB81EaD2210BFa582)).
Vera is registered in the canonical ERC-8004 IdentityRegistry on BSC testnet (`0x8004A818BFB912233c491871b3d84c89A494BD9e`) as **agentId 97:2543** ([8004scan](https://www.8004scan.io/agents/97/2543)), owned by her agent signer, with the agent card at [`stax-bnb.vercel.app/.well-known/agent-card.json`](https://stax-bnb.vercel.app/.well-known/agent-card.json).
Fee treasury (testnet): `0xeAAedEae0d96f2155062c8B47832af87A5d4797A`. Agent signer (the only key `InferenceVerifier` trusts): `0x118271A901CD726e338BAAa464693539874E40b8`. Public env block: [`.env.example`](.env.example).

Contract sources and deploy scripts live in [StaxBNB/Stax-contracts](https://github.com/StaxBNB/Stax-contracts)
(Hardhat, Solidity 0.8.24, EVM `cancun`, OpenZeppelin 5.6): `npm run deploy:testnet` (BSC testnet) or `npm run deploy:bsc` (mainnet).

## What you can do

- **Invest with Vera** — say a goal in plain words ("grow $20, mostly big tech"), review the
  named plan, nudge it (safer / bolder / simpler), place it in one tap. Gasless, with the
  on-chain-verified receipt.
- **Trade manually** — buy or sell any buyable asset (Apple and Tesla on testnet) with live
  PancakeSwap V3 quotes and real market-history charts.
- **Wallet** — balance, send/receive (QR), holdings with live prices, and the full history of
  what you did (invests, buys, sells, sends), each linked to its BscScan receipt.
- **Autopilot** — delegate your embedded wallet (Privy session signer) so Vera invests on a
  schedule, autonomously and gaslessly, **within hard bounds** (per-period cap + risk ceiling)
  you authorize, revocable any time. "Run now" executes immediately; scheduled runs fire from a
  daily Vercel Cron (`/api/cron/autopilot`).
- **Gasless onboarding** — sign in with email, Google, X or an existing wallet, no seed phrase;
  funds live in an ERC-4337 smart account and Stax sponsors every gas fee (via Pimlico).

## Assets

**Buyable now (BSC testnet):** Apple and Tesla — mock tokenized shares with seeded PancakeSwap V3
pools. Every asset is configured through `NEXT_PUBLIC_ASSET_ADDRESSES`; anything without a
configured route (Nvidia, Google, Meta, Robinhood, Circle, Strategy, S&P 500, Nasdaq-100, Safe
Dollars, Staked ETH…) is listed as **Soon** and is left out of Vera's universe until it's routable.

**Coming soon:** Bitcoin, US Treasuries (Ondo USDY), and Ondo USD (mUSD) — added to Stax once
they're buyable on BNB Chain without paperwork.

## Revenue

A flat **25 bps (0.25%)** on capital deployed (buys + AI invests), taken as a gasless USDC
transfer to the treasury batched into the same UserOp. Gas stays on us. No spreads, no
subscription. ([`src/lib/fees.ts`](src/lib/fees.ts), configurable via `NEXT_PUBLIC_STAX_FEE_BPS`.)

## Tech

Next.js 16 (App Router, PWA) · Tailwind v4 · **Privy** (email/Google/X/wallet login, embedded wallet,
delegated session signers) · **Pimlico + permissionless** (gasless ERC-4337, SimpleAccount v0.7)
· viem / wagmi · **AI SDK** (Anthropic provider) for Vera, through two Anthropic-compatible
gateways: **QwenCloud** (`deepseek-v4-flash-0731`, `qwen3.8-flash`) and **xKiro**
(`qwen3.8-omni-flash`, `glm-5.3-flash`, `mimo-v2.6-flash`), tried in order as a fallback chain ·
PancakeSwap V3 (BNB Chain DEX) · Supabase (Autopilot store + transaction log) · Vercel Cron ·
Framer Motion (landing hero) · Hardhat contracts.

## Run it locally

```bash
# 1. contracts on BSC testnet (or reuse the live addresses above)
git clone https://github.com/StaxBNB/Stax-contracts && cd Stax-contracts
npm install && cp .env.example .env && npm run deploy:testnet

# 2. this app
git clone https://github.com/StaxBNB/Stax-web && cd Stax-web
npm install
cp .env.example .env.local      # fill in the keys below
npm run dev                     # http://localhost:3000  (landing) · /app (the product)
```

Scripts: `dev` · `build` · `start` · `lint`.

**Required env** (full list in [`.env.example`](.env.example)): `NEXT_PUBLIC_PRIVY_APP_ID` + `PRIVY_APP_SECRET`,
`PIMLICO_API_KEY`, `XKIRO_API_KEY` and/or `QWEN_API_KEY` (Vera's AI gateways; optional
`AI_MODELS` overrides the model chain), `AGENT_SIGNER_PRIVATE_KEY` (server-only — signs risk
inferences; `0x` prefix optional), the deployed contract addresses + `NEXT_PUBLIC_STAX_AGENT_ID`,
and Supabase (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`; apply
`supabase/migrations/*.sql`). Autopilot also needs `NEXT_PUBLIC_PRIVY_SIGNER_ID`,
`PRIVY_AUTHORIZATION_KEY` and `AUTOPILOT_CRON_SECRET` (= `CRON_SECRET` on Vercel).

> Funds live on the **smart-account** address (the ERC-4337 account), not the Privy embedded EOA
> that owns it. The app always derives and shows the smart account.

## Repo layout

This repo is the web app (deployed to stax-bnb.vercel.app). The contracts live in
[StaxBNB/Stax-contracts](https://github.com/StaxBNB/Stax-contracts); the migration and verification
logs live in [bcc-ukdw/seed-bnb › stax](https://github.com/bcc-ukdw/seed-bnb/tree/main/stax).

```
src/app/          routes; app/api/* is the server (allocate, invest-plan, autopilot, cron, tx-log, …)
src/components/   site/ (landing), lite/ (the app screens), demo/ (the no-login /demo), design/
src/lib/          chain config, EIP-712 signing, fees, leg builder, swap guards
src/lib/server/   Vera's AI chain, Autopilot executor, transaction log, Privy auth, rate limits
supabase/         SQL migrations (Autopilot store + transaction log)
public/           brand art, hero video, the film, agent card (.well-known/agent-card.json)
```

## Security

Every route that spends AI tokens, signs, or touches a wallet's funds requires a verified Privy
session (only public read routes, such as prices, market history and an address's on-chain
history, are open); the Autopilot cron is secret-gated; the Pimlico relay is auth-gated and
method-allowlisted; swaps enforce on-chain `amountOutMinimum` plus a price-impact ceiling; the
agent key is server-only. Hardening (auth, rate-limiting, input bounds, headers) lives across
[`src/lib/server/*`](src/lib/server).
