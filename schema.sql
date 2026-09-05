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

alter table public.settings enable row level security;

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- touch
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch
  before update on public.tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch
  before update on public.settings
  for each row execute function public.touch_updated_at();
