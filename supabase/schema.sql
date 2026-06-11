-- ============================================================
-- KMC — Kenya Mennonite Church — Supabase Database Schema
-- v2 — Fixed member ID type compatibility
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────────────────────
-- DIOCESES
-- ──────────────────────────────────────────────────────────────
create table if not exists dioceses (
  id          text primary key default 'D-' || upper(substring(gen_random_uuid()::text,1,6)),
  name        text not null unique,
  region      text,
  bishop      text,
  phone       text,
  email       text,
  address     text,
  established date,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ──────────────────────────────────────────────────────────────
-- CHURCHES
-- ──────────────────────────────────────────────────────────────
create table if not exists churches (
  id          text primary key default 'C-' || upper(substring(gen_random_uuid()::text,1,6)),
  name        text not null unique,
  diocese_id  text references dioceses(id) on delete set null,
  diocese     text,
  pastor      text,
  county      text,
  sub_county  text,
  phone       text,
  email       text,
  address     text,
  established date,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ──────────────────────────────────────────────────────────────
-- MEMBERS
-- ID is pure text — no sequence FK conflict possible
-- ──────────────────────────────────────────────────────────────
create sequence if not exists member_seq start 1;

-- Helper function returns text — avoids bigint cast issue
create or replace function next_member_id()
returns text language sql as $$
  select 'KMC-' || lpad(nextval('member_seq')::text, 4, '0')
$$;

create table if not exists members (
  id            text primary key default next_member_id(),
  firstname     text not null,
  middlename    text,
  lastname      text not null,
  gender        text check (gender in ('Male','Female')),
  dob           date,
  id_number     text,
  marital       text check (marital in ('Single','Married','Widowed','Divorced','')),
  occupation    text,
  photo_url     text,
  phone         text not null,
  phone2        text,
  email         text,
  county        text,
  address       text,
  diocese       text,
  church        text,
  ministry      text,
  joined        date,
  baptized      text check (baptized in ('Yes','No','')),
  baptized_date date,
  leadership    text,
  status        text default 'Active' check (status in ('Active','Inactive','Transferred','Deceased')),
  em_name       text,
  em_relationship text,
  em_phone      text,
  paid_amount   numeric(10,2) default 0,
  registration_source text default 'admin' check (registration_source in ('admin','online','bulk')),
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ──────────────────────────────────────────────────────────────
-- SUBSCRIPTION PAYMENTS
-- member_id is text — matches members.id (text)
-- ──────────────────────────────────────────────────────────────
create sequence if not exists receipt_seq start 1000;

create or replace function next_receipt_no()
returns text language sql as $$
  select 'RCT-' || lpad(nextval('receipt_seq')::text, 5, '0')
$$;

create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  receipt_no    text unique default next_receipt_no(),
  member_id     text references members(id) on delete cascade,
  member_name   text,
  amount        numeric(10,2) not null,
  method        text check (method in ('Cash','M-Pesa','Bank Transfer','Cheque')),
  reference     text,
  payment_date  date,
  financial_year text,
  recorded_by   text,
  created_at    timestamptz default now()
);

-- ──────────────────────────────────────────────────────────────
-- OFFERTORY RECORDS
-- ──────────────────────────────────────────────────────────────
create table if not exists offertory (
  id                  uuid primary key default gen_random_uuid(),
  church_id           text references churches(id) on delete set null,
  church_name         text not null,
  diocese             text,
  service_date        date not null,
  service_type        text default 'Sunday Service'
                        check (service_type in ('Sunday Service','Mid-Week','Special Service','Revival','Conference','Other')),
  service_description text,
  attendance          integer,
  cash_amount         numeric(10,2) default 0,
  mpesa_amount        numeric(10,2) default 0,
  cheque_amount       numeric(10,2) default 0,
  total_amount        numeric(10,2) generated always as (cash_amount + mpesa_amount + cheque_amount) stored,
  tithe_cash          numeric(10,2) default 0,
  tithe_mpesa         numeric(10,2) default 0,
  tithe_total         numeric(10,2) generated always as (tithe_cash + tithe_mpesa) stored,
  grand_total         numeric(10,2) generated always as (cash_amount + mpesa_amount + cheque_amount + tithe_cash + tithe_mpesa) stored,
  notes               text,
  recorded_by         text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ──────────────────────────────────────────────────────────────
-- TITHE RECORDS
-- ──────────────────────────────────────────────────────────────
create table if not exists tithes (
  id            uuid primary key default gen_random_uuid(),
  church_id     text references churches(id) on delete set null,
  church_name   text not null,
  diocese       text,
  member_id     text references members(id) on delete set null,
  member_name   text,
  is_anonymous  boolean default false,
  amount        numeric(10,2) not null,
  method        text check (method in ('Cash','M-Pesa','Bank Transfer','Cheque')),
  reference     text,
  tithe_date    date not null,
  month_year    text,
  notes         text,
  recorded_by   text,
  created_at    timestamptz default now()
);

-- ──────────────────────────────────────────────────────────────
-- ADMIN USERS
-- ──────────────────────────────────────────────────────────────
create table if not exists admin_users (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique,
  full_name   text not null,
  email       text not null unique,
  role        text default 'viewer'
                check (role in ('super_admin','diocese_admin','church_admin','finance_officer','viewer')),
  diocese     text,
  church      text,
  is_active   boolean default true,
  last_login  timestamptz,
  created_at  timestamptz default now()
);

-- ──────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────
alter table dioceses    enable row level security;
alter table churches    enable row level security;
alter table members     enable row level security;
alter table payments    enable row level security;
alter table offertory   enable row level security;
alter table tithes      enable row level security;
alter table admin_users enable row level security;

-- Public: read dioceses & churches (needed for public registration form)
create policy "Public read dioceses"  on dioceses  for select to anon using (true);
create policy "Public read churches"  on churches  for select to anon using (true);

-- Public: self-registration
create policy "Public member registration"
  on members for insert to anon
  with check (registration_source = 'online');

-- Authenticated admins: full access to everything
create policy "Admins all members"    on members     for all to authenticated using (true) with check (true);
create policy "Admins all dioceses"   on dioceses    for all to authenticated using (true) with check (true);
create policy "Admins all churches"   on churches    for all to authenticated using (true) with check (true);
create policy "Admins all payments"   on payments    for all to authenticated using (true) with check (true);
create policy "Admins all offertory"  on offertory   for all to authenticated using (true) with check (true);
create policy "Admins all tithes"     on tithes      for all to authenticated using (true) with check (true);
create policy "Admins read users"     on admin_users for all to authenticated using (true) with check (true);

-- ──────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ──────────────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger members_updated_at
  before update on members for each row execute function update_updated_at();
create trigger churches_updated_at
  before update on churches for each row execute function update_updated_at();
create trigger dioceses_updated_at
  before update on dioceses for each row execute function update_updated_at();
create trigger offertory_updated_at
  before update on offertory for each row execute function update_updated_at();

-- ──────────────────────────────────────────────────────────────
-- SAMPLE DATA
-- ──────────────────────────────────────────────────────────────
insert into dioceses (id, name, region, bishop, phone, email, address) values
  ('D001', 'Nairobi Diocese',  'Nairobi',     'Bishop James Mwangi',  '0700000001', 'nairobi@kmc.org',  'P.O. Box 100, Nairobi'),
  ('D002', 'Kisumu Diocese',   'Nyanza',      'Bishop Peter Otieno',  '0700000002', 'kisumu@kmc.org',   'P.O. Box 200, Kisumu'),
  ('D003', 'Eldoret Diocese',  'Rift Valley', 'Bishop Samuel Chebet', '0700000003', 'eldoret@kmc.org',  'P.O. Box 300, Eldoret')
on conflict do nothing;

insert into churches (id, name, diocese_id, diocese, pastor, county, phone) values
  ('C001', 'Nairobi Central KMC', 'D001', 'Nairobi Diocese', 'Pastor John Kamau',  'Nairobi',     '0711000001'),
  ('C002', 'Kinoo KMC',           'D001', 'Nairobi Diocese', 'Pastor Grace Njeri', 'Kiambu',      '0711000002'),
  ('C003', 'Kisumu Central KMC',  'D002', 'Kisumu Diocese',  'Pastor Daniel Oloo', 'Kisumu',      '0711000003'),
  ('C004', 'Eldoret KMC',         'D003', 'Eldoret Diocese', 'Pastor Ruth Chebet', 'Uasin Gishu', '0711000004')
on conflict do nothing;
