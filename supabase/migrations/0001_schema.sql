create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('analyst','partner','general_partner')),
  approval_limit numeric not null default 0,
  avatar_color text not null default '#0ea5a4'
);

create table pitches (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  company text not null,
  tagline text not null,
  founder text not null,
  sector text not null,
  ask_amount numeric not null check (ask_amount > 0),
  equity_offered numeric not null check (equity_offered > 0 and equity_offered <= 100),
  revenue numeric not null default 0,          -- verified annual revenue
  claimed_revenue numeric,                     -- what the pitch claims (may differ)
  growth_pct numeric not null default 0,
  monthly_burn numeric not null default 0,
  pitch_text text not null,
  chaos jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table harness_configs (
  id uuid primary key default gen_random_uuid(),
  version int unique not null,
  autonomy_level int not null check (autonomy_level between 0 and 3),
  thresholds jsonb not null,
  budgets jsonb not null,
  reliability jsonb not null,
  permissions jsonb not null,
  notes text,
  is_active boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create unique index one_active_config on harness_configs (is_active) where is_active;

create table runs (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references pitches(id),
  config_version int not null references harness_configs(version),
  autonomy_level int not null check (autonomy_level between 0 and 3),
  status text not null default 'queued' check (status in ('queued','triage','planning','analyzing','synthesizing','policy_check','awaiting_founder','awaiting_approval','in_review','escalated','offer_sent','passed','cancelled','failed')),
  plan jsonb,
  state jsonb not null default '{}',
  degraded boolean not null default false,
  replans int not null default 0,
  step_count int not null default 0,
  tokens_used int not null default 0,
  cost_usd numeric not null default 0,
  decision jsonb,
  recommendation text check (recommendation in ('invest','pass')),
  final_terms jsonb,
  started_by uuid references users(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);
create index on runs (pitch_id);
create index on runs (status);

create table checkpoints (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  seq int not null,
  node text not null,
  state jsonb not null,
  duration_ms int not null default 0,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create table agent_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  agent text not null check (agent in ('lead','market','finance','product','skeptic')),
  purpose text not null check (purpose in ('triage','plan','analyze','synthesize')),
  model text not null,
  attempt int not null,
  fallback_used boolean not null default false,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric not null default 0,
  latency_ms int not null default 0,
  status text not null check (status in ('ok','timeout','error','schema_fail','skipped_budget')),
  error text,
  output jsonb,
  created_at timestamptz not null default now()
);
create index on agent_calls (run_id);

create table tool_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  agent_call_id uuid references agent_calls(id) on delete cascade,
  agent text not null,
  tool text not null,
  args jsonb not null default '{}',
  result jsonb,
  latency_ms int not null default 0,
  permitted boolean not null,
  created_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  kind text not null check (kind in ('approval','exception','escalation')),
  status text not null default 'pending' check (status in ('pending','approved','modified','rejected','replanned')),
  required_role text not null check (required_role in ('analyst','partner','general_partner')),
  rule_fired text not null,
  ai_recommendation text not null check (ai_recommendation in ('invest','pass')),
  original_terms jsonb,
  final_terms jsonb,
  decided_by uuid references users(id),
  reason text,
  is_override boolean not null default false,
  sla_due timestamptz not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index on approvals (status);

create table founder_messages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  direction text not null check (direction in ('to_founder','from_founder')),
  body text not null,
  author_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table memories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('firm','founder','partner')),
  subject text not null,          -- firm: company, founder: founder name, partner: user name
  sector text,
  content text not null,
  source_run_id uuid references runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  severity text not null check (severity in ('sev1','sev2','sev3')),
  title text not null,
  owner_id uuid references users(id),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  handoff jsonb not null,
  sla_due timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references users(id),
  actor_role text not null,      -- 'system' for harness events
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on audit_log (created_at desc);
