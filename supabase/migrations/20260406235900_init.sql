-- WindParts Supabase schema
create table if not exists public.admins (
  username text primary key,
  password_hash text not null,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);
create table if not exists public.customers (
  id bigserial primary key,
  name text not null,
  company text,
  email text not null unique,
  phone text,
  address text,
  first_order_at timestamptz,
  last_order_at timestamptz,
  total_orders integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.orders (
  id bigserial primary key,
  order_id text not null unique,
  customer jsonb not null,
  materials jsonb not null,
  status text not null,
  quotation jsonb,
  timeline jsonb not null default '[]'::jsonb,
  rejection_reason text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create table if not exists public.quotations (
  id bigserial primary key,
  order_id text not null references public.orders(order_id) on delete cascade,
  quotation jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.audit_log (
  id bigserial primary key,
  action text not null,
  timestamp timestamptz not null,
  payload jsonb not null default '{}'::jsonb
);
-- RLS OFF for backend-only service role access
alter table public.admins disable row level security;
alter table public.customers disable row level security;
alter table public.orders disable row level security;
alter table public.quotations disable row level security;
alter table public.audit_log disable row level security;
