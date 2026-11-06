# Task Management System (FlowTask on Supabase)

A React 19 + Vite + TypeScript task manager (Tasks list/board/calendar, Projects, Inbox, Settings) wired to Supabase for auth, database, storage, and per-user notifications.

## Stack

- **Frontend**: React 19, Vite 6, Tailwind 4, Radix UI, Zustand, react-router 7
- **Backend**: Supabase — Auth (email/password), Postgres with RLS, Storage (avatars), notifications table

## Layout

| Path | Purpose |
|---|---|
| `src/` | The app UI (pages, components, store) |
| `src/lib/supabase/client.ts` | The single Supabase browser client |
| `src/lib/blocks/auth.ts` | Sign-in/sign-up/session helpers (module path kept from the old build) |
| `src/services/supabaseData.ts` | The data adapter all repositories sit on |
| `src/services/*Service.ts` | Per-domain repositories (tasks, projects, users, …) |
| `supabase/migrations/0001_init.sql` | The full database schema — run once via the Dashboard SQL Editor |
| `scripts/check-connection.js` | Read-only connectivity check (`npm run check`) |
| `scripts/key-info.js` | Safe `.env` key diagnostics (never prints values) |

## Setup

1. **`.env`** — fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Dashboard → Project Settings → API). Edit the file yourself; never paste keys in chat. `vite.config.ts` maps these names automatically — no `VITE_*` duplicates needed.
2. **Database** — run `supabase/migrations/0001_init.sql` once (Dashboard → SQL Editor). Approval-gated: nothing runs remotely without the owner's explicit OK.
3. **Verify** — `npm run check` (connection), then `npm run dev` and sign up.

## Key safety rules (enforced in code + RLS)

- The publishable/anon key is the only key in browser code; it is public by design — **RLS is what protects data**, not key secrecy.
- `SUPABASE_SERVICE_ROLE_KEY` must never appear in this repo's client code. `scripts/check-connection.js` refuses to use it outside server-side mode.

## Data model (contract in `src/types.ts`)

- **profiles** — id (= auth user), email, name, role, hue, avatar_path; auto-created on signup
- **projects** — owner + `member_ids[]`; members see and edit, only owner deletes
- **tasks** — project-scoped; labels `text[]`, subtasks `jsonb`; `updated_at` maintained by trigger
- **activities** — cross-user trail (actor + project members can read)
- **board_columns** — per-user custom kanban columns + layout row
- **notifications** — per-user inbox (the bell)

## Known scope cuts in the Supabase migration

- Invites: teammates sign up themselves (no email invites yet)
- Organizations/roles/permissions UI: hidden (RLS replaces IAM access control)
- AI assistant: unchanged, still simulated
