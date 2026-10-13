-- DENTAL JG · esquema inicial y migración compatible con el panel multi-clínica
-- Se puede volver a ejecutar sin borrar pacientes ni pagos existentes.
create extension if not exists pgcrypto;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text default '',
  treatment text default '',
  total numeric(12,2) not null default 0 check (total >= 0),
  paid numeric(12,2) not null default 0 check (paid >= 0),
  installments integer not null default 0,
  installment_amount numeric(12,2) not null default 0,
  policy_number text default '',
  clinic text default '',
  source_device text default 'DENTAL JG',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete set null,
  patient_name text not null default '',
  amount numeric(12,2) not null check (amount > 0),
  concept text not null default 'Abono',
  reference text default '',
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  source_device text not null default 'DENTAL JG'
);

-- Catálogo de clínicas que se administran desde el panel.
create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists clinics_name_unique_idx on public.clinics (lower(name));

-- Registra en el catálogo los nombres de clínica que ya existan en pacientes.
insert into public.clinics (name)
select distinct trim(clinic) from public.patients
where coalesce(trim(clinic), '') <> ''
on conflict do nothing;

create index if not exists patients_name_idx on public.patients using gin (to_tsvector('simple', coalesce(name,'')));
create index if not exists payments_paid_at_idx on public.payments (paid_at desc);

alter table public.patients enable row level security;
alter table public.payments enable row level security;
alter table public.clinics enable row level security;
drop policy if exists "authenticated users manage patients" on public.patients;
create policy "authenticated users manage patients" on public.patients for all to authenticated using (true) with check (true);
drop policy if exists "authenticated users manage payments" on public.payments;
create policy "authenticated users manage payments" on public.payments for all to authenticated using (true) with check (true);
drop policy if exists "authenticated users manage clinics" on public.clinics;
create policy "authenticated users manage clinics" on public.clinics for all to authenticated using (true) with check (true);

-- Agrega tablas a realtime solo si todavía no están publicadas.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='patients') then
    alter publication supabase_realtime add table public.patients;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='payments') then
    alter publication supabase_realtime add table public.payments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='clinics') then
    alter publication supabase_realtime add table public.clinics;
  end if;
end $$;
