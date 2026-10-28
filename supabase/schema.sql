-- Ritmo: hábitos, check-ins e perfil, isolados por usuário via RLS.
-- Já aplicado no projeto Supabase "Ritmo" (migração ritmo_schema). Mantido aqui como referência.

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 40),
  reset_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.habits (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 40),
  name text not null check (char_length(name) between 1 and 60),
  icon text not null check (char_length(icon) <= 40),
  color text not null check (char_length(color) <= 20),
  period text not null check (period in ('morning', 'afternoon', 'evening', 'any')),
  days smallint[] not null check (cardinality(days) between 1 and 7),
  target smallint not null default 1 check (target between 1 and 50),
  unit text not null default '' check (char_length(unit) <= 30),
  created_on date not null,
  position integer not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.checkins (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id text not null,
  day date not null,
  count smallint not null default 0 check (count between 0 and 50),
  updated_at timestamptz not null default now(),
  primary key (user_id, habit_id, day),
  foreign key (user_id, habit_id) references public.habits (user_id, id) on delete cascade
);

create index checkins_user_day_idx on public.checkins (user_id, day);

alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.checkins enable row level security;

create policy "profiles: dono lê" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles: dono cria" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles: dono altera" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "habits: dono lê" on public.habits for select to authenticated using ((select auth.uid()) = user_id);
create policy "habits: dono cria" on public.habits for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "habits: dono altera" on public.habits for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habits: dono apaga" on public.habits for delete to authenticated using ((select auth.uid()) = user_id);

create policy "checkins: dono lê" on public.checkins for select to authenticated using ((select auth.uid()) = user_id);
create policy "checkins: dono cria" on public.checkins for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "checkins: dono altera" on public.checkins for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "checkins: dono apaga" on public.checkins for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.profiles, public.habits, public.checkins from anon;
grant select, insert, update, delete on public.profiles, public.habits, public.checkins to authenticated;

alter publication supabase_realtime add table public.profiles, public.habits, public.checkins;
