-- Stax Autopilot — durable store, audit log, and atomic claim.
-- Applied to the shared Supabase project via MCP apply_migration ("staxBNB_autopilot").
-- Safe to re-run (idempotent).
--
-- This project is SHARED with another app, so every Stax object ends in _staxBNB
-- (tables, indexes, function) and no extensions are installed. Scheduling runs
-- via Vercel Cron (vercel.json -> GET /api/cron/autopilot), not pg_cron.

-- 1) Tables -----------------------------------------------------------------
create table if not exists public."autopilots_staxBNB" (
  user_id            text primary key,        -- Privy user id (one autopilot per user)
  id                 text not null,
  wallet_id          text not null,           -- Privy embedded-wallet id (server signs for this)
  owner              text not null,           -- embedded EOA (smart-account owner)
  smart_account      text not null,           -- the AA address that holds funds + executes
  goal               text not null,
  amount_usd         numeric not null,
  cadence            text not null check (cadence in ('daily','weekly','biweekly','monthly')),
  risk_ceiling_bps   integer not null,
  max_per_period_usd numeric not null,
  active             boolean not null default true,
  created_at         bigint  not null,        -- unix seconds
  next_run_at        bigint  not null,        -- unix seconds
  last_run_at        bigint,
  runs               integer not null default 0,
  spent_this_period  numeric not null default 0
);
create index if not exists "autopilots_due_idx_staxBNB"
  on public."autopilots_staxBNB" (next_run_at) where active;

create table if not exists public."autopilot_runs_staxBNB" (
  id                bigserial primary key,
  user_id           text not null,
  ran_at            bigint not null,           -- unix seconds
  amount_usd        numeric not null,
  assessed_risk_bps integer,
  status            text not null check (status in ('success','skipped','error')),
  reason            text,
  tx_hash           text,
  holdings          jsonb,                     -- what the run bought: [{symbol,weightPct,amountUsd}]
  created_at        timestamptz not null default now()
);
create index if not exists "autopilot_runs_user_idx_staxBNB"
  on public."autopilot_runs_staxBNB" (user_id, ran_at desc);

-- 2) Lock both tables. Only the server's secret key (service_role, bypasses RLS)
--    touches them: RLS on with no policies, and no Data API grants for anon /
--    authenticated.
alter table public."autopilots_staxBNB"     enable row level security;
alter table public."autopilot_runs_staxBNB" enable row level security;
revoke all on table public."autopilots_staxBNB"     from anon, authenticated;
revoke all on table public."autopilot_runs_staxBNB" from anon, authenticated;

-- 3) Atomic claim — advances next_run_at and resets the period spend AS IT READS,
--    so two overlapping cron runs can never execute the same autopilot twice.
--    SECURITY INVOKER (default): only service_role can run it meaningfully.
create or replace function public."claim_due_autopilots_staxBNB"(now_seconds bigint)
returns setof public."autopilots_staxBNB"
language sql
set search_path = ''
as $$
  update public."autopilots_staxBNB" a
  set next_run_at = a.next_run_at + case a.cadence
        when 'daily'    then 86400
        when 'weekly'   then 604800
        when 'biweekly' then 1209600
        else                 2592000   -- monthly
      end,
      spent_this_period = 0
  where a.active and a.next_run_at <= now_seconds
  returning a.*;
$$;
-- Supabase's default privileges grant EXECUTE to anon/authenticated explicitly,
-- so revoking from PUBLIC alone is not enough.
revoke all on function public."claim_due_autopilots_staxBNB"(bigint) from public, anon, authenticated;
grant execute on function public."claim_due_autopilots_staxBNB"(bigint) to service_role;
