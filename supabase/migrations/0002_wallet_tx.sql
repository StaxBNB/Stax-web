-- Stax transaction log — our own record of every transaction the app sends, so
-- wallet history / activity / Vera's record never depend on an explorer API.
-- Applied to the shared Supabase project via MCP apply_migration ("staxBNB_wallet_tx").
-- Safe to re-run (idempotent). Every Stax object ends in _staxBNB (shared project).
--
-- Rows are written ONLY by the server, and only from facts it re-derives from the
-- on-chain receipt (lib/server/txLog.ts) — never from client-supplied amounts.
-- One row per (tx, wallet): a send between two wallets yields a "send" row for
-- the sender and a "receive" row for the recipient. The tx hash is the proof:
-- the UI links each row to the block explorer.

create table if not exists public."wallet_tx_staxBNB" (
  chain_id      integer not null,
  tx_hash       text    not null,
  address       text    not null,            -- lowercased wallet this row is about
  kind          text    not null check (kind in ('invest','autopilot','buy','sell','send','receive','other')),
  block_number  bigint  not null,
  block_time    bigint,                      -- unix seconds
  user_op_hash  text,                        -- ERC-4337 userOpHash when sent as a UserOp
  usdc_out      numeric not null default 0,  -- USDC that left the wallet (excl. platform fee)
  usdc_in       numeric not null default 0,  -- USDC that came into the wallet
  fee_usd       numeric not null default 0,  -- platform fee paid to the treasury
  usdc_spent    numeric,                     -- invests: AllocationExecuted.usdcSpent
  assets        jsonb   not null default '[]'::jsonb, -- [{symbol, token, amount, direction}]
  counterparty  text,                        -- send/receive: the other wallet
  plan_id       text,                        -- invests: RecommendationCommitted.planId
  risk_score    integer,                     -- invests: assessed risk (bps)
  leg_count     integer,                     -- invests: AllocationExecuted.legCount
  created_at    timestamptz not null default now(),
  primary key (chain_id, tx_hash, address)
);
create index if not exists "wallet_tx_address_idx_staxBNB"
  on public."wallet_tx_staxBNB" (chain_id, address, block_number desc);
create index if not exists "wallet_tx_invest_idx_staxBNB"
  on public."wallet_tx_staxBNB" (chain_id, block_number desc) where kind in ('invest','autopilot');

-- Server-only (service_role bypasses RLS): RLS on, no policies, no Data API grants.
alter table public."wallet_tx_staxBNB" enable row level security;
revoke all on table public."wallet_tx_staxBNB" from anon, authenticated;
