-- =============================================================================
-- Investment Platform — Supabase PostgreSQL Schema
-- =============================================================================
-- Auth credentials live in auth.users (managed by Supabase Auth).
-- public.users is a profile extension synced on signup.
-- Live pricing is fetched via API and is intentionally not stored here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Custom types
-- ---------------------------------------------------------------------------

create type public.statement_type as enum (
  'income_statement',
  'balance_sheet',
  'cash_flow_statement'
);

create type public.period_type as enum (
  'annual',
  'quarterly'
);

create type public.accounting_standard as enum (
  'GAAP',
  'IFRS'
);

-- ---------------------------------------------------------------------------
-- users — profile extension for auth.users
-- ---------------------------------------------------------------------------

create table public.users (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint users_email_not_empty check (char_length(trim(email)) > 0)
);

comment on table public.users is
  'Application profile for each authenticated user. Credentials are stored in auth.users.';

-- ---------------------------------------------------------------------------
-- watchlists
-- ---------------------------------------------------------------------------

create table public.watchlists (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  name          text not null,
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint watchlists_name_not_empty check (char_length(trim(name)) > 0)
);

create index watchlists_user_id_idx on public.watchlists (user_id);

comment on table public.watchlists is
  'User-owned collections of tickers (e.g. "Top 10").';

-- ---------------------------------------------------------------------------
-- watchlist_items
-- ---------------------------------------------------------------------------

create table public.watchlist_items (
  id            uuid primary key default gen_random_uuid(),
  watchlist_id  uuid not null references public.watchlists (id) on delete cascade,
  ticker        text not null,
  company_name  text,
  notes         text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint watchlist_items_ticker_not_empty check (char_length(trim(ticker)) > 0),
  constraint watchlist_items_ticker_uppercase check (ticker = upper(ticker)),
  constraint watchlist_items_unique_ticker_per_watchlist unique (watchlist_id, ticker)
);

create index watchlist_items_watchlist_id_idx on public.watchlist_items (watchlist_id);
create index watchlist_items_ticker_idx on public.watchlist_items (ticker);

comment on table public.watchlist_items is
  'Individual stock tickers within a watchlist. Price is fetched live via API.';

-- ---------------------------------------------------------------------------
-- historical_financials
-- ---------------------------------------------------------------------------
-- Stores static fundamental line items for the Financials UI (Income Statement,
-- Balance Sheet, Cash Flow). Supports annual/quarterly periods and GAAP/IFRS.
-- Growth (YoY) and Common Size views are derived in the application layer.

create table public.historical_financials (
  id                  uuid primary key default gen_random_uuid(),
  ticker              text not null,
  statement_type      public.statement_type not null,
  line_item           text not null,
  period_type         public.period_type not null,
  fiscal_year         integer not null,
  fiscal_quarter      smallint,
  period_end_date     date,
  accounting_standard public.accounting_standard not null default 'GAAP',
  value               numeric(20, 4),
  currency            text not null default 'USD',
  display_order       integer not null default 0,
  source              text,
  fetched_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint historical_financials_ticker_not_empty
    check (char_length(trim(ticker)) > 0),
  constraint historical_financials_ticker_uppercase
    check (ticker = upper(ticker)),
  constraint historical_financials_line_item_not_empty
    check (char_length(trim(line_item)) > 0),
  constraint historical_financials_fiscal_year_valid
    check (fiscal_year >= 1900 and fiscal_year <= 2100),
  constraint historical_financials_fiscal_quarter_valid
    check (fiscal_quarter is null or fiscal_quarter between 1 and 4),
  constraint historical_financials_period_quarter_consistency
    check (
      (period_type = 'annual' and fiscal_quarter is null)
      or (period_type = 'quarterly' and fiscal_quarter is not null)
    ),
  constraint historical_financials_unique_row unique (
    ticker,
    statement_type,
    line_item,
    period_type,
    fiscal_year,
    fiscal_quarter,
    accounting_standard
  )
);

create index historical_financials_ticker_idx
  on public.historical_financials (ticker);

create index historical_financials_lookup_idx
  on public.historical_financials (
    ticker,
    statement_type,
    period_type,
    accounting_standard,
    fiscal_year desc,
    fiscal_quarter desc nulls first
  );

create index historical_financials_line_item_idx
  on public.historical_financials (ticker, statement_type, line_item);

comment on table public.historical_financials is
  'Cached quarterly/annual fundamental line items (Sales, EBITDA, Net Income, etc.) per ticker.';
comment on column public.historical_financials.line_item is
  'Human-readable label matching the Figma financials grid (e.g. Sales, EBITDA, Net Income).';
comment on column public.historical_financials.display_order is
  'Row order in the financial statement table UI.';

-- ---------------------------------------------------------------------------
-- Triggers — updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger watchlists_set_updated_at
  before update on public.watchlists
  for each row execute function public.set_updated_at();

create trigger watchlist_items_set_updated_at
  before update on public.watchlist_items
  for each row execute function public.set_updated_at();

create trigger historical_financials_set_updated_at
  before update on public.historical_financials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger — auto-create public.users row on auth signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.historical_financials enable row level security;

-- users: each person can read and update their own profile
create policy "Users can view own profile"
  on public.users
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- watchlists: full CRUD scoped to owner
create policy "Users can view own watchlists"
  on public.watchlists
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own watchlists"
  on public.watchlists
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own watchlists"
  on public.watchlists
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own watchlists"
  on public.watchlists
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- watchlist_items: access via parent watchlist ownership
create policy "Users can view own watchlist items"
  on public.watchlist_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
  );

create policy "Users can create items in own watchlists"
  on public.watchlist_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
  );

create policy "Users can update items in own watchlists"
  on public.watchlist_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
  );

create policy "Users can delete items in own watchlists"
  on public.watchlist_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.user_id = auth.uid()
    )
  );

-- historical_financials: shared reference data — readable by app clients
create policy "Authenticated users can read historical financials"
  on public.historical_financials
  for select
  to authenticated
  using (true);

create policy "Anon users can read historical financials"
  on public.historical_financials
  for select
  to anon
  using (true);

-- Writes to historical_financials are performed by backend jobs using the
-- service_role key, which bypasses RLS. No insert/update/delete policies
-- are defined for authenticated users.

-- =============================================================================
-- Seed data — RDDT GAAP Income Statement (Figma Financials layout)
-- =============================================================================
-- Source: Investment_Platform_Spec_Template.docx.md — Income Statement screen
-- Values are in millions USD, matching the Figma mockup column headers:
--   MAR '26 LTM | DEC '25 | DEC '24 | DEC '23 | DEC '22 | DEC '21 | DEC '20
--
-- LTM column is stored with source = 'LTM' and period_end_date = 2026-03-31.
-- Annual fiscal-year columns use period_type = 'annual' (fiscal_quarter = null).
-- =============================================================================

delete from public.historical_financials
where ticker = 'RDDT'
  and statement_type = 'income_statement'
  and accounting_standard = 'GAAP';

insert into public.historical_financials (
  ticker,
  statement_type,
  line_item,
  period_type,
  fiscal_year,
  fiscal_quarter,
  period_end_date,
  accounting_standard,
  value,
  currency,
  display_order,
  source,
  fetched_at
)
values
  ('RDDT', 'income_statement', 'Sales', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 3473.6, 'USD', 10, 'LTM', now()),
  ('RDDT', 'income_statement', 'Sales', 'annual', 2025, null, '2025-12-31', 'GAAP', 2506.5, 'USD', 10, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Sales', 'annual', 2024, null, '2024-12-31', 'GAAP', 1333.2, 'USD', 10, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Sales', 'annual', 2023, null, '2023-12-31', 'GAAP', 804.0, 'USD', 10, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Sales', 'annual', 2022, null, '2022-12-31', 'GAAP', 666.7, 'USD', 10, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Sales', 'annual', 2021, null, '2021-12-31', 'GAAP', 404.0, 'USD', 10, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Sales', 'annual', 2020, null, '2020-12-31', 'GAAP', 252.3, 'USD', 10, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Cost of Goods Sold (COGS)', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 229.6, 'USD', 20, 'LTM', now()),
  ('RDDT', 'income_statement', 'Cost of Goods Sold (COGS)', 'annual', 2025, null, '2025-12-31', 'GAAP', 510.2, 'USD', 20, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Cost of Goods Sold (COGS)', 'annual', 2024, null, '2024-12-31', 'GAAP', 182.2, 'USD', 20, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Cost of Goods Sold (COGS)', 'annual', 2023, null, '2023-12-31', 'GAAP', 154.5, 'USD', 20, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Cost of Goods Sold (COGS)', 'annual', 2022, null, '2022-12-31', 'GAAP', 111.9, 'USD', 20, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Cost of Goods Sold (COGS)', 'annual', 2021, null, '2021-12-31', 'GAAP', 75.2, 'USD', 20, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Cost of Goods Sold (COGS)', 'annual', 2020, null, '2020-12-31', 'GAAP', 55.2, 'USD', 20, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Gross Income', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 3244.0, 'USD', 30, 'LTM', now()),
  ('RDDT', 'income_statement', 'Gross Income', 'annual', 2025, null, '2025-12-31', 'GAAP', 1996.3, 'USD', 30, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Gross Income', 'annual', 2024, null, '2024-12-31', 'GAAP', 1151.0, 'USD', 30, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Gross Income', 'annual', 2023, null, '2023-12-31', 'GAAP', 673.5, 'USD', 30, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Gross Income', 'annual', 2022, null, '2022-12-31', 'GAAP', 554.8, 'USD', 30, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Gross Income', 'annual', 2021, null, '2021-12-31', 'GAAP', 415.4, 'USD', 30, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Gross Income', 'annual', 2020, null, '2020-12-31', 'GAAP', 173.5, 'USD', 30, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'SG&A Expense', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 1474.0, 'USD', 40, 'LTM', now()),
  ('RDDT', 'income_statement', 'SG&A Expense', 'annual', 2025, null, '2025-12-31', 'GAAP', 1144.1, 'USD', 40, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'SG&A Expense', 'annual', 2024, null, '2024-12-31', 'GAAP', 1738.8, 'USD', 40, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'SG&A Expense', 'annual', 2023, null, '2023-12-31', 'GAAP', 813.6, 'USD', 40, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'SG&A Expense', 'annual', 2022, null, '2022-12-31', 'GAAP', 727.1, 'USD', 40, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'SG&A Expense', 'annual', 2021, null, '2021-12-31', 'GAAP', 542.1, 'USD', 40, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'SG&A Expense', 'annual', 2020, null, '2020-12-31', 'GAAP', 226.3, 'USD', 40, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT (Operating Income)', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 521.0, 'USD', 50, 'LTM', now()),
  ('RDDT', 'income_statement', 'EBIT (Operating Income)', 'annual', 2025, null, '2025-12-31', 'GAAP', 442.2, 'USD', 50, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT (Operating Income)', 'annual', 2024, null, '2024-12-31', 'GAAP', -587.8, 'USD', 50, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT (Operating Income)', 'annual', 2023, null, '2023-12-31', 'GAAP', -140.2, 'USD', 50, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT (Operating Income)', 'annual', 2022, null, '2022-12-31', 'GAAP', -172.3, 'USD', 50, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT (Operating Income)', 'annual', 2021, null, '2021-12-31', 'GAAP', -126.7, 'USD', 50, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT (Operating Income)', 'annual', 2020, null, '2020-12-31', 'GAAP', -52.8, 'USD', 50, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Non-operating Income - Net', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 441.4, 'USD', 60, 'LTM', now()),
  ('RDDT', 'income_statement', 'Non-operating Income - Net', 'annual', 2025, null, '2025-12-31', 'GAAP', 84.7, 'USD', 60, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Non-operating Income - Net', 'annual', 2024, null, '2024-12-31', 'GAAP', 74.4, 'USD', 60, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Non-operating Income - Net', 'annual', 2023, null, '2023-12-31', 'GAAP', 53.1, 'USD', 60, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Non-operating Income - Net', 'annual', 2022, null, '2022-12-31', 'GAAP', 44.8, 'USD', 60, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Non-operating Income - Net', 'annual', 2021, null, '2021-12-31', 'GAAP', -0.4, 'USD', 60, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Non-operating Income - Net', 'annual', 2020, null, '2020-12-31', 'GAAP', 2.5, 'USD', 60, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Interest Expense - Net', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 0.0, 'USD', 70, 'LTM', now()),
  ('RDDT', 'income_statement', 'Interest Expense - Net', 'annual', 2025, null, '2025-12-31', 'GAAP', 0.2, 'USD', 70, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Interest Expense - Net', 'annual', 2024, null, '2024-12-31', 'GAAP', 0.0, 'USD', 70, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Interest Expense - Net', 'annual', 2023, null, '2023-12-31', 'GAAP', 0.0, 'USD', 70, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Interest Expense - Net', 'annual', 2022, null, '2022-12-31', 'GAAP', 0.0, 'USD', 70, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Interest Expense - Net', 'annual', 2021, null, '2021-12-31', 'GAAP', 0.0, 'USD', 70, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Interest Expense - Net', 'annual', 2020, null, '2020-12-31', 'GAAP', 0.2, 'USD', 70, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Pretax Income', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 710.0, 'USD', 80, 'LTM', now()),
  ('RDDT', 'income_statement', 'Pretax Income', 'annual', 2025, null, '2025-12-31', 'GAAP', 526.7, 'USD', 80, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Pretax Income', 'annual', 2024, null, '2024-12-31', 'GAAP', -513.5, 'USD', 80, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Pretax Income', 'annual', 2023, null, '2023-12-31', 'GAAP', -87.0, 'USD', 80, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Pretax Income', 'annual', 2022, null, '2022-12-31', 'GAAP', -127.5, 'USD', 80, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Pretax Income', 'annual', 2021, null, '2021-12-31', 'GAAP', -127.2, 'USD', 80, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Pretax Income', 'annual', 2020, null, '2020-12-31', 'GAAP', -50.4, 'USD', 80, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Income Taxes', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 2.4, 'USD', 90, 'LTM', now()),
  ('RDDT', 'income_statement', 'Income Taxes', 'annual', 2025, null, '2025-12-31', 'GAAP', -3.0, 'USD', 90, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Income Taxes', 'annual', 2024, null, '2024-12-31', 'GAAP', 0.5, 'USD', 90, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Income Taxes', 'annual', 2023, null, '2023-12-31', 'GAAP', 3.8, 'USD', 90, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Income Taxes', 'annual', 2022, null, '2022-12-31', 'GAAP', 0.6, 'USD', 90, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Income Taxes', 'annual', 2021, null, '2021-12-31', 'GAAP', 0.3, 'USD', 90, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Income Taxes', 'annual', 2020, null, '2020-12-31', 'GAAP', 0.3, 'USD', 90, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Net Income', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 707.5, 'USD', 100, 'LTM', now()),
  ('RDDT', 'income_statement', 'Net Income', 'annual', 2025, null, '2025-12-31', 'GAAP', 559.7, 'USD', 100, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Net Income', 'annual', 2024, null, '2024-12-31', 'GAAP', -1312.0, 'USD', 100, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Net Income', 'annual', 2023, null, '2023-12-31', 'GAAP', -90.8, 'USD', 100, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Net Income', 'annual', 2022, null, '2022-12-31', 'GAAP', -158.6, 'USD', 100, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Net Income', 'annual', 2021, null, '2021-12-31', 'GAAP', -157.1, 'USD', 100, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Net Income', 'annual', 2020, null, '2020-12-31', 'GAAP', -90.7, 'USD', 100, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBITDA', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 617.3, 'USD', 110, 'LTM', now()),
  ('RDDT', 'income_statement', 'EBITDA', 'annual', 2025, null, '2025-12-31', 'GAAP', 412.4, 'USD', 110, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBITDA', 'annual', 2024, null, '2024-12-31', 'GAAP', -511.4, 'USD', 110, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBITDA', 'annual', 2023, null, '2023-12-31', 'GAAP', -124.5, 'USD', 110, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBITDA', 'annual', 2022, null, '2022-12-31', 'GAAP', -141.3, 'USD', 110, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBITDA', 'annual', 2021, null, '2021-12-31', 'GAAP', -100.4, 'USD', 110, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBITDA', 'annual', 2020, null, '2020-12-31', 'GAAP', -49.5, 'USD', 110, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 521.0, 'USD', 120, 'LTM', now()),
  ('RDDT', 'income_statement', 'EBIT', 'annual', 2025, null, '2025-12-31', 'GAAP', 442.2, 'USD', 120, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT', 'annual', 2024, null, '2024-12-31', 'GAAP', -587.8, 'USD', 120, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT', 'annual', 2023, null, '2023-12-31', 'GAAP', -140.2, 'USD', 120, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT', 'annual', 2022, null, '2022-12-31', 'GAAP', -172.3, 'USD', 120, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT', 'annual', 2021, null, '2021-12-31', 'GAAP', -126.7, 'USD', 120, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'EBIT', 'annual', 2020, null, '2020-12-31', 'GAAP', -52.8, 'USD', 120, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Depr. & Amort. Exp.', 'quarterly', 2026, 1, '2026-03-31', 'GAAP', 96.3, 'USD', 130, 'LTM', now()),
  ('RDDT', 'income_statement', 'Depr. & Amort. Exp.', 'annual', 2025, null, '2025-12-31', 'GAAP', 40.2, 'USD', 130, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Depr. & Amort. Exp.', 'annual', 2024, null, '2024-12-31', 'GAAP', 76.4, 'USD', 130, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Depr. & Amort. Exp.', 'annual', 2023, null, '2023-12-31', 'GAAP', 15.7, 'USD', 130, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Depr. & Amort. Exp.', 'annual', 2022, null, '2022-12-31', 'GAAP', 31.0, 'USD', 130, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Depr. & Amort. Exp.', 'annual', 2021, null, '2021-12-31', 'GAAP', 26.3, 'USD', 130, 'Figma mock', now()),
  ('RDDT', 'income_statement', 'Depr. & Amort. Exp.', 'annual', 2020, null, '2020-12-31', 'GAAP', 3.3, 'USD', 130, 'Figma mock', now());
