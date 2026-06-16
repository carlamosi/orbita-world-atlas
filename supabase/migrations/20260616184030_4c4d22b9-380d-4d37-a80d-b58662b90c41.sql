
-- ============= ROLES SCAFFOLD =============
create type public.app_role as enum ('admin', 'moderator', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "users read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ============= PROFILES =============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_flag text,
  client_id text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles select own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles delete own" on public.profiles for delete to authenticated using (auth.uid() = id);
create index profiles_user_updated_idx on public.profiles (id, updated_at desc);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============= COUNTRY PROGRESS =============
create table public.country_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null,
  skills jsonb not null default '{}'::jsonb,
  skill_versions jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  client_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, country_code)
);
grant select, insert, update, delete on public.country_progress to authenticated;
grant all on public.country_progress to service_role;
alter table public.country_progress enable row level security;
create policy "cp own all" on public.country_progress for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index country_progress_user_updated_idx on public.country_progress (user_id, updated_at desc);
create index country_progress_user_client_idx on public.country_progress (user_id, client_id);

-- ============= SESSIONS LOG (append-only) =============
create table public.sessions_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  op_id uuid not null unique,
  mode text not null,
  skill text,
  score int not null default 0,
  total_questions int not null default 0,
  correct int not null default 0,
  wrong int not null default 0,
  best_combo int not null default 0,
  duration_ms int not null default 0,
  period_key text,
  meta jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  client_id text,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sessions_log to authenticated;
grant all on public.sessions_log to service_role;
alter table public.sessions_log enable row level security;
create policy "sl own select" on public.sessions_log for select to authenticated using (auth.uid() = user_id);
create policy "sl own insert" on public.sessions_log for insert to authenticated with check (auth.uid() = user_id);
create index sessions_log_user_updated_idx on public.sessions_log (user_id, updated_at desc);
create index sessions_log_user_client_idx on public.sessions_log (user_id, client_id);

-- ============= CHALLENGE ATTEMPTS (append-only) =============
create table public.challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  op_id uuid not null unique,
  kind text not null,
  period_key text not null,
  question_index int not null,
  correct boolean not null,
  ms int not null default 0,
  client_id text,
  updated_at timestamptz not null default now(),
  unique (user_id, kind, period_key, question_index)
);
grant select, insert, update, delete on public.challenge_attempts to authenticated;
grant all on public.challenge_attempts to service_role;
alter table public.challenge_attempts enable row level security;
create policy "ca own select" on public.challenge_attempts for select to authenticated using (auth.uid() = user_id);
create policy "ca own insert" on public.challenge_attempts for insert to authenticated with check (auth.uid() = user_id);
create index challenge_attempts_user_updated_idx on public.challenge_attempts (user_id, updated_at desc);
create index challenge_attempts_user_client_idx on public.challenge_attempts (user_id, client_id);

-- ============= UNLOCKS =============
create table public.unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  progress numeric not null default 0,
  unlocked_at timestamptz,
  meta jsonb,
  client_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
grant select, insert, update, delete on public.unlocks to authenticated;
grant all on public.unlocks to service_role;
alter table public.unlocks enable row level security;
create policy "un own all" on public.unlocks for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index unlocks_user_updated_idx on public.unlocks (user_id, updated_at desc);

-- ============= DAILY STREAK =============
create table public.daily_streak (
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key text not null,
  count int not null default 0,
  last_active_at timestamptz not null default now(),
  client_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, date_key)
);
grant select, insert, update, delete on public.daily_streak to authenticated;
grant all on public.daily_streak to service_role;
alter table public.daily_streak enable row level security;
create policy "ds own all" on public.daily_streak for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index daily_streak_user_updated_idx on public.daily_streak (user_id, updated_at desc);

-- ============= SYNC RPCS =============
-- sync_push: idempotent mutations with per-skill versioning
create or replace function public.sync_push(_mutations jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m jsonb;
  entity text;
  op text;
  op_id_v uuid;
  payload jsonb;
  accepted text[] := array[]::text[];
  rejected jsonb := '[]'::jsonb;
  canonical jsonb := '[]'::jsonb;
  cp_row record;
  incoming_skills jsonb;
  incoming_versions jsonb;
  merged_skills jsonb;
  merged_versions jsonb;
  skill_key text;
  inc_ver int;
  cur_ver int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  for m in select * from jsonb_array_elements(_mutations) loop
    entity := m->>'entity';
    op := m->>'op';
    op_id_v := (m->>'op_id')::uuid;
    payload := m->'payload';
    begin
      if entity = 'sessions_log' then
        insert into public.sessions_log
          (user_id, op_id, mode, skill, score, total_questions, correct, wrong, best_combo,
           duration_ms, period_key, meta, started_at, ended_at, client_id)
        values (uid, op_id_v,
          payload->>'mode', payload->>'skill',
          coalesce((payload->>'score')::int,0),
          coalesce((payload->>'total_questions')::int,0),
          coalesce((payload->>'correct')::int,0),
          coalesce((payload->>'wrong')::int,0),
          coalesce((payload->>'best_combo')::int,0),
          coalesce((payload->>'duration_ms')::int,0),
          payload->>'period_key',
          payload->'meta',
          (payload->>'started_at')::timestamptz,
          (payload->>'ended_at')::timestamptz,
          payload->>'client_id')
        on conflict (op_id) do nothing;
        accepted := array_append(accepted, op_id_v::text);

      elsif entity = 'challenge_attempts' then
        insert into public.challenge_attempts
          (user_id, op_id, kind, period_key, question_index, correct, ms, client_id)
        values (uid, op_id_v,
          payload->>'kind', payload->>'period_key',
          coalesce((payload->>'question_index')::int,0),
          coalesce((payload->>'correct')::boolean,false),
          coalesce((payload->>'ms')::int,0),
          payload->>'client_id')
        on conflict (op_id) do nothing;
        accepted := array_append(accepted, op_id_v::text);

      elsif entity = 'country_progress' then
        incoming_skills := coalesce(payload->'skills', '{}'::jsonb);
        incoming_versions := coalesce(payload->'skill_versions', '{}'::jsonb);
        select * into cp_row from public.country_progress
          where user_id = uid and country_code = payload->>'country_code';
        if not found then
          insert into public.country_progress
            (user_id, country_code, skills, skill_versions, last_seen_at, client_id, updated_at)
          values (uid, payload->>'country_code', incoming_skills, incoming_versions,
            (payload->>'last_seen_at')::timestamptz, payload->>'client_id', now());
        else
          merged_skills := cp_row.skills;
          merged_versions := cp_row.skill_versions;
          for skill_key in select jsonb_object_keys(incoming_versions) loop
            inc_ver := coalesce((incoming_versions->>skill_key)::int, 0);
            cur_ver := coalesce((cp_row.skill_versions->>skill_key)::int, 0);
            if inc_ver > cur_ver then
              merged_skills := jsonb_set(merged_skills, array[skill_key], incoming_skills->skill_key, true);
              merged_versions := jsonb_set(merged_versions, array[skill_key], to_jsonb(inc_ver), true);
            end if;
          end loop;
          update public.country_progress set
            skills = merged_skills,
            skill_versions = merged_versions,
            last_seen_at = greatest(coalesce(cp_row.last_seen_at, 'epoch'::timestamptz), coalesce((payload->>'last_seen_at')::timestamptz, 'epoch'::timestamptz)),
            client_id = payload->>'client_id',
            updated_at = now()
          where user_id = uid and country_code = payload->>'country_code';
        end if;
        select to_jsonb(cp.*) into payload from public.country_progress cp
          where user_id = uid and country_code = payload->>'country_code';
        canonical := canonical || jsonb_build_array(jsonb_build_object('entity','country_progress','row',payload));
        accepted := array_append(accepted, op_id_v::text);

      elsif entity = 'unlocks' then
        insert into public.unlocks (user_id, key, progress, unlocked_at, meta, client_id, updated_at)
        values (uid, payload->>'key',
          coalesce((payload->>'progress')::numeric, 0),
          (payload->>'unlocked_at')::timestamptz,
          payload->'meta', payload->>'client_id', now())
        on conflict (user_id, key) do update set
          progress = greatest(public.unlocks.progress, excluded.progress),
          unlocked_at = least(public.unlocks.unlocked_at, excluded.unlocked_at),
          meta = excluded.meta,
          client_id = excluded.client_id,
          updated_at = now();
        accepted := array_append(accepted, op_id_v::text);

      elsif entity = 'daily_streak' then
        insert into public.daily_streak (user_id, date_key, count, last_active_at, client_id, updated_at)
        values (uid, payload->>'date_key',
          coalesce((payload->>'count')::int, 0),
          coalesce((payload->>'last_active_at')::timestamptz, now()),
          payload->>'client_id', now())
        on conflict (user_id, date_key) do update set
          count = greatest(public.daily_streak.count, excluded.count),
          last_active_at = greatest(public.daily_streak.last_active_at, excluded.last_active_at),
          client_id = excluded.client_id,
          updated_at = now();
        accepted := array_append(accepted, op_id_v::text);

      elsif entity = 'profiles' then
        insert into public.profiles (id, display_name, avatar_flag, client_id, updated_at)
        values (uid, payload->>'display_name', payload->>'avatar_flag', payload->>'client_id', now())
        on conflict (id) do update set
          display_name = excluded.display_name,
          avatar_flag = excluded.avatar_flag,
          client_id = excluded.client_id,
          updated_at = now();
        accepted := array_append(accepted, op_id_v::text);

      else
        rejected := rejected || jsonb_build_array(jsonb_build_object('op_id', op_id_v, 'reason', 'unknown_entity'));
      end if;
    exception when others then
      rejected := rejected || jsonb_build_array(jsonb_build_object('op_id', op_id_v, 'reason', SQLERRM));
    end;
  end loop;
  return jsonb_build_object('accepted', to_jsonb(accepted), 'rejected', rejected, 'canonical', canonical);
end; $$;

grant execute on function public.sync_push(jsonb) to authenticated;

-- sync_pull: per-table cursors
create or replace function public.sync_pull(_cursors jsonb, _limit int default 500)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb := '{}'::jsonb;
  cur timestamptz;
  rows_json jsonb;
  new_cursor timestamptz;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  cur := coalesce((_cursors->>'country_progress')::timestamptz, 'epoch'::timestamptz);
  select coalesce(jsonb_agg(to_jsonb(t.*) order by t.updated_at asc), '[]'::jsonb),
         max(updated_at)
    into rows_json, new_cursor
    from (select * from public.country_progress
          where user_id = uid and updated_at > cur
          order by updated_at asc limit _limit) t;
  result := result || jsonb_build_object('country_progress', jsonb_build_object('rows', rows_json, 'cursor', coalesce(new_cursor, cur)));

  cur := coalesce((_cursors->>'sessions_log')::timestamptz, 'epoch'::timestamptz);
  select coalesce(jsonb_agg(to_jsonb(t.*) order by t.updated_at asc), '[]'::jsonb),
         max(updated_at)
    into rows_json, new_cursor
    from (select * from public.sessions_log
          where user_id = uid and updated_at > cur
          order by updated_at asc limit _limit) t;
  result := result || jsonb_build_object('sessions_log', jsonb_build_object('rows', rows_json, 'cursor', coalesce(new_cursor, cur)));

  cur := coalesce((_cursors->>'unlocks')::timestamptz, 'epoch'::timestamptz);
  select coalesce(jsonb_agg(to_jsonb(t.*) order by t.updated_at asc), '[]'::jsonb),
         max(updated_at)
    into rows_json, new_cursor
    from (select * from public.unlocks
          where user_id = uid and updated_at > cur
          order by updated_at asc limit _limit) t;
  result := result || jsonb_build_object('unlocks', jsonb_build_object('rows', rows_json, 'cursor', coalesce(new_cursor, cur)));

  cur := coalesce((_cursors->>'challenge_attempts')::timestamptz, 'epoch'::timestamptz);
  select coalesce(jsonb_agg(to_jsonb(t.*) order by t.updated_at asc), '[]'::jsonb),
         max(updated_at)
    into rows_json, new_cursor
    from (select * from public.challenge_attempts
          where user_id = uid and updated_at > cur
          order by updated_at asc limit _limit) t;
  result := result || jsonb_build_object('challenge_attempts', jsonb_build_object('rows', rows_json, 'cursor', coalesce(new_cursor, cur)));

  cur := coalesce((_cursors->>'daily_streak')::timestamptz, 'epoch'::timestamptz);
  select coalesce(jsonb_agg(to_jsonb(t.*) order by t.updated_at asc), '[]'::jsonb),
         max(updated_at)
    into rows_json, new_cursor
    from (select * from public.daily_streak
          where user_id = uid and updated_at > cur
          order by updated_at asc limit _limit) t;
  result := result || jsonb_build_object('daily_streak', jsonb_build_object('rows', rows_json, 'cursor', coalesce(new_cursor, cur)));

  cur := coalesce((_cursors->>'profiles')::timestamptz, 'epoch'::timestamptz);
  select coalesce(jsonb_agg(to_jsonb(t.*) order by t.updated_at asc), '[]'::jsonb),
         max(updated_at)
    into rows_json, new_cursor
    from (select * from public.profiles
          where id = uid and updated_at > cur
          order by updated_at asc limit _limit) t;
  result := result || jsonb_build_object('profiles', jsonb_build_object('rows', rows_json, 'cursor', coalesce(new_cursor, cur)));

  return result;
end; $$;

grant execute on function public.sync_pull(jsonb, int) to authenticated;
