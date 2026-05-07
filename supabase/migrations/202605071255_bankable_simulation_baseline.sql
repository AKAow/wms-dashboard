-- Bankable simulation baseline tables (non-destructive)

create table if not exists public.turbine_scenarios (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  iec_class text not null,
  rated_mw numeric(6,2) not null,
  cut_in_ms numeric(5,2) not null,
  rated_speed_ms numeric(5,2) not null,
  cut_out_ms numeric(5,2) not null,
  hub_height_m numeric(6,2),
  rotor_diameter_m numeric(6,2),
  power_curve_json jsonb not null,
  is_template boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.simulation_assumption_sets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid,
  name text not null,
  availability_loss_pct numeric(5,2) not null default 6,
  electrical_loss_pct numeric(5,2) not null default 3,
  wake_loss_pct numeric(5,2) not null default 5,
  curtailment_loss_pct numeric(5,2) not null default 2,
  icing_loss_pct numeric(5,2) not null default 0,
  other_loss_pct numeric(5,2) not null default 1,
  age_loss_pct numeric(5,2) not null default 0,
  version text not null default 'v1',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.energy_actual_daily (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  date date not null,
  actual_mwh numeric(12,4) not null,
  source text,
  created_at timestamptz not null default now(),
  unique(site_id, date)
);

create table if not exists public.simulation_backtest_daily (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  date date not null,
  turbine_scenario_id uuid references public.turbine_scenarios(id),
  assumption_set_id uuid references public.simulation_assumption_sets(id),
  predicted_p50_mwh numeric(12,4) not null,
  predicted_p75_mwh numeric(12,4) not null,
  predicted_p90_mwh numeric(12,4) not null,
  actual_mwh numeric(12,4),
  ape_pct numeric(8,4),
  bias_pct numeric(8,4),
  run_version text not null default 'v1',
  created_at timestamptz not null default now(),
  unique(site_id, date, run_version)
);

create index if not exists idx_energy_actual_daily_site_date
  on public.energy_actual_daily(site_id, date desc);

create index if not exists idx_simulation_backtest_daily_site_date
  on public.simulation_backtest_daily(site_id, date desc);
