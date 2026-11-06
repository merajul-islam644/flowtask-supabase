-- ============================================================================
-- 0001_init.sql — Task Management System (FlowTask) on Supabase
--
-- HOW TO RUN (after approval):
--   Supabase Dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. It is idempotent-ish (uses IF NOT EXISTS / IF EXISTS guards), so
--   re-running a partially applied copy is safe.
--
-- WHAT IT CREATES: the schema the migrated frontend expects. No data is
-- inserted; nothing outside the `public` schema and the `avatars` storage
-- bucket is touched.
--
-- SECURITY MODEL: Row Level Security everywhere. The browser only ever uses
-- the publishable (anon) key — RLS is what protects the data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES — one row per auth user (auto-created by the signup trigger).
--    This is what makes teammates assignable: name shown on tasks, avatars.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text        not null default '',
  name        text        not null default '',
  role        text        not null default '',
  hue         text        not null default 'iris',
  avatar_path text,
  created_at  timestamptz not null default now()
);

-- Auto-create the profile when someone signs up (name comes from signup metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. PROJECTS
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid        not null references public.profiles (id) on delete cascade,
  name        text        not null,
  description text        not null default '',
  status      text        not null default 'on_track',   -- on_track | at_risk | paused
  color       text        not null default 'iris',
  target_date timestamptz,
  member_ids  uuid[]      not null default '{}',         -- who can see & work on it
  archived    boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects (owner_id);

-- ---------------------------------------------------------------------------
-- 3. TASKS (subtasks/labels stored inline — the app treats them as one unit)
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null,
  description text        not null default '',
  status      text        not null default 'todo',       -- built-in status or custom column id
  priority    text        not null default 'medium',     -- low | medium | high | urgent
  project_id  uuid        not null references public.projects (id) on delete cascade,
  due_date    timestamptz,
  assignee_id uuid        references public.profiles (id) on delete set null,
  labels      text[]      not null default '{}',
  subtasks    jsonb       not null default '[]',         -- [{id,title,completed}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tasks_project_idx on public.tasks (project_id);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
create index if not exists tasks_due_idx on public.tasks (due_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. ACTIVITIES — the inbox trail (no FKs on purpose: history survives deletes)
-- ---------------------------------------------------------------------------
create table if not exists public.activities (
  id         uuid primary key default gen_random_uuid(),
  kind       text        not null default 'project_update',
  actor_id   uuid,
  task_id    uuid,
  project_id uuid,
  message    text        not null default '',
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);

create index if not exists activities_created_idx on public.activities (created_at desc);

-- ---------------------------------------------------------------------------
-- 5. BOARD COLUMNS — user-created kanban columns + the persisted layout row
-- ---------------------------------------------------------------------------
create table if not exists public.board_columns (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  column_id  text        not null,                      -- 'col_xxx' or '__layout__'
  label      text        not null default '',           -- layout row stores a JSON id array
  sort_order int         not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, column_id)
);

-- ---------------------------------------------------------------------------
-- 6. NOTIFICATIONS — per-user inbox (the bell icon)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  kind       text        not null default 'project_update',
  message    text        not null default '',
  actor_id   uuid,
  task_id    uuid,
  project_id uuid,
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.tasks         enable row level security;
alter table public.activities    enable row level security;
alter table public.board_columns enable row level security;
alter table public.notifications enable row level security;

-- Helper: is the current user an owner/member of the given project?
-- security definer so checking projects doesn't recurse through its own RLS.
create or replace function public.is_project_member(project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = project
      and (p.owner_id = auth.uid() or auth.uid() = any (p.member_ids))
  );
$$;

-- PROFILES: teammates visible to all signed-in users; self-service writes only.
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated using (true);
drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- PROJECTS: members see everything in their projects; creator becomes owner.
drop policy if exists "members read own projects" on public.projects;
create policy "members read own projects" on public.projects
  for select to authenticated
  using (owner_id = auth.uid() or auth.uid() = any (member_ids));
drop policy if exists "users create own projects" on public.projects;
create policy "users create own projects" on public.projects
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "members update their projects" on public.projects;
create policy "members update their projects" on public.projects
  for update to authenticated
  using (owner_id = auth.uid() or auth.uid() = any (member_ids));
drop policy if exists "owners delete their projects" on public.projects;
create policy "owners delete their projects" on public.projects
  for delete to authenticated using (owner_id = auth.uid());

-- TASKS: scoped through the parent project.
drop policy if exists "members read project tasks" on public.tasks;
create policy "members read project tasks" on public.tasks
  for select to authenticated using (public.is_project_member(project_id));
drop policy if exists "members create project tasks" on public.tasks;
create policy "members create project tasks" on public.tasks
  for insert to authenticated with check (public.is_project_member(project_id));
drop policy if exists "members update project tasks" on public.tasks;
create policy "members update project tasks" on public.tasks
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
drop policy if exists "members delete project tasks" on public.tasks;
create policy "members delete project tasks" on public.tasks
  for delete to authenticated using (public.is_project_member(project_id));

-- ACTIVITIES: visible to the actor and the project's members.
drop policy if exists "members read activities" on public.activities;
create policy "members read activities" on public.activities
  for select to authenticated
  using (actor_id = auth.uid() or public.is_project_member(project_id));
drop policy if exists "members create activities" on public.activities;
create policy "members create activities" on public.activities
  for insert to authenticated
  with check (actor_id = auth.uid() or public.is_project_member(project_id));
drop policy if exists "actors update own activities" on public.activities;
create policy "actors update own activities" on public.activities
  for update to authenticated using (actor_id = auth.uid());
drop policy if exists "actors delete own activities" on public.activities;
create policy "actors delete own activities" on public.activities
  for delete to authenticated using (actor_id = auth.uid());

-- BOARD COLUMNS & NOTIFICATIONS: strictly per-user.
drop policy if exists "users read own board columns" on public.board_columns;
create policy "users read own board columns" on public.board_columns
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "users write own board columns" on public.board_columns;
create policy "users write own board columns" on public.board_columns
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users update own board columns" on public.board_columns;
create policy "users update own board columns" on public.board_columns
  for update to authenticated using (user_id = auth.uid());
drop policy if exists "users delete own board columns" on public.board_columns;
create policy "users delete own board columns" on public.board_columns
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "members send notifications" on public.notifications;
create policy "members send notifications" on public.notifications
  for insert to authenticated with check (true); -- validated in app: members notify assignees
drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid());
drop policy if exists "users delete own notifications" on public.notifications;
create policy "users delete own notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 8. AVATAR STORAGE — public bucket, one folder per user
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatar images publicly readable" on storage.objects;
create policy "avatar images publicly readable" on storage.objects
  for select using (bucket_id = 'avatars');
drop policy if exists "users upload to own folder" on storage.objects;
create policy "users upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "users update own avatars" on storage.objects;
create policy "users update own avatars" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "users delete own avatars" on storage.objects;
create policy "users delete own avatars" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
