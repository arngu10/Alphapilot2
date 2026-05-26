-- AlphaPilot missing persistence tables.
-- Run this if /api/persistence/health reports economic_events, scanner_snapshots, or decision_journal as missing.

create table if not exists public.economic_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  currency text not null,
  impact text not null check (impact in ('low', 'medium', 'high')),
  starts_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'fred', 'gdelt', 'provider')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists economic_events_starts_at_idx
  on public.economic_events (starts_at asc);

create index if not exists economic_events_currency_starts_at_idx
  on public.economic_events (currency, starts_at asc);

create table if not exists public.scanner_snapshots (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null,
  received_at timestamptz not null default now(),
  online boolean not null default false,
  session_name text not null,
  priority_symbol text,
  priority_score numeric,
  providers jsonb not null default '[]'::jsonb,
  analysis jsonb not null
);

create index if not exists scanner_snapshots_generated_at_idx
  on public.scanner_snapshots (generated_at desc);

create index if not exists scanner_snapshots_priority_idx
  on public.scanner_snapshots (priority_symbol, generated_at desc);

create table if not exists public.decision_journal (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('scanner', 'copilot', 'drive', 'automation', 'risk')),
  symbol text,
  status text not null check (status in ('accepted', 'blocked', 'info', 'error')),
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists decision_journal_created_at_idx
  on public.decision_journal (created_at desc);

create index if not exists decision_journal_kind_symbol_idx
  on public.decision_journal (kind, symbol, created_at desc);

alter table public.economic_events enable row level security;
alter table public.scanner_snapshots enable row level security;
alter table public.decision_journal enable row level security;
