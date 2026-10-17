-- tasks
create table if not exists public.tasks (
  id          uuid primary key,
  user_id     uuid not null references auth.users on delete cascade,
  text        text not null,
  day         date not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- length guard (matches MAX_TASK_LENGTH in src/store.tsx)
alter table public.tasks drop constraint if exists tasks_text_length;
alter table public.tasks add constraint tasks_text_length
  check (char_length(text) between 1 and 500);

create index if not exists tasks_user_day on public.tasks (user_id, day);
create index if not exists tasks_user_updated on public.tasks (user_id, updated_at);

alter table public.tasks enable row level security;

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- settings
create table if not exists public.settings (
  user_id           uuid primary key references auth.users on delete cascade,
  skin              text not null default 'mono',
  hour              int  not null default 20,
  minute            int  not null default 30,
  notifications_on  boolean not null default true,
  updated_at        timestamptz not null default now()
);

-- range guards - the app never sends these, but the API is public
alter table public.settings drop constraint if exists settings_hour_range;
alter table public.settings add constraint settings_hour_range check (hour between 0 and 23);
alter table public.settings drop constraint if exists settings_minute_range;
alter table public.settings add constraint settings_minute_range check (minute between 0 and 59);
alter table public.settings drop constraint if exists settings_skin_length;
alter table public.settings add constraint settings_skin_length check (char_length(skin) between 1 and 40);

alter table public.settings enable row level security;

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- touch - the server owns updated_at on insert and update; the app's
-- incremental pull cursor depends on it
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch
  before insert or update on public.tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch
  before insert or update on public.settings
  for each row execute function public.touch_updated_at();

-- quota - caps rows per user so one account can't fill the database
create or replace function public.tasks_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.tasks where user_id = new.user_id) >= 20000 then
    raise exception 'task limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_quota on public.tasks;
create trigger tasks_quota
  before insert on public.tasks
  for each row execute function public.tasks_quota();

-- account deletion - removes the caller; tasks and settings cascade
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
