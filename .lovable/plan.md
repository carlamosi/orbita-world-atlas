
# Phase 4 — ORBITA Cloud Sync & Accounts (Execution Plan)

Backend: Lovable Cloud (Supabase) only. Dexie remains the runtime source of truth. Sync runs entirely outside the gameplay path.

## 0. Prerequisites (first build action)

1. `supabase--enable` to provision Lovable Cloud.
2. `supabase--configure_social_auth` for Google. Email/password enabled by default.
3. No hardcoded credentials anywhere — browser uses `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`; server fns use `process.env.SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`. Service-role is never imported into client-reachable modules.

## 1. Architecture (one-way dependency)

```text
UI ──► repo (Dexie txn) ──► outbox row (same txn) ──► pushWorker ──► sync_push
                                                  ▲
                                         pullWorker ◄── sync_pull (cursors)
```

- `repo → syncQueue` only. Engines never import `useSyncStore` or `src/lib/sync/*`.
- ESLint `no-restricted-imports` boundary on `src/features/engine/**` and `src/features/speed/**`.
- All sync work is fire-and-forget; failures surface only in SyncPill / SyncPage.

## 2. Supabase Schema (single migration)

All tables: `user_id uuid not null references auth.users(id) on delete cascade`, `updated_at timestamptz not null default now()`, `client_id text`, plus `op_id uuid` on append-only tables.

Tables:
- `profiles` (id = user_id PK, display_name text, avatar_flag text, created_at).
- `country_progress` — PK `(user_id, country_code)`. Columns: `skills jsonb` (`{ name:{seen,correct,version}, flag:{...}, capital:{...}, location:{...} }`), `last_seen_at timestamptz`.
- `sessions_log` — append-only. `op_id uuid unique`, mode text, started_at, ended_at, score int, accuracy numeric, deltas jsonb.
- `challenge_attempts` — append-only. `op_id uuid unique`, kind text, period_key text, question_index int, correct bool, ms int. Also `UNIQUE (user_id, kind, period_key, question_index)` to collapse cross-client duplicates.
- `unlocks` — PK `(user_id, key)`, unlocked_at, meta jsonb.
- `daily_streak` — PK `(user_id, date_key)`, count int, last_active_at.

Indexes on every large table: `(user_id, updated_at desc)` and `(user_id, client_id)`. Append-only tables already covered by `op_id unique`.

Grants per project rules: `GRANT SELECT,INSERT,UPDATE,DELETE … TO authenticated; GRANT ALL … TO service_role;` (no `anon`). RLS enabled; every policy scoped to `auth.uid() = user_id`. Profiles INSERT restricted to own row.

Scaffold for Phase 5: `app_role` enum, `user_roles` table (+ grants + RLS), `has_role()` SECURITY DEFINER.

Auto-create profile on signup via `on auth.user created` trigger calling a SECURITY DEFINER `handle_new_user()`.

## 3. Dexie v3 (additive migration)

Existing v2 tables get optional columns: `updated_at: number`, `dirty: 0|1`. `countryProgress` gains `skill_versions: { name, flag, capital, location }` of monotonic ints (default 0). Append-only rows (`sessions`, `challengeAttempts`) get `op_id` populated at creation.

New Dexie tables:
- `outbox`: `++id, &op_id, entity, op, payload, base_version, created_at, attempts, next_attempt_at, status`.
- `sync_meta`: `&key, value` — `cursor_<entity>`, `client_id`, `server_user_id`, `schema_rev`.

### Per-user DB isolation
- DB name: `orbita-${serverUserId ?? 'local'}`.
- `src/lib/db/dbProvider.ts` singleton with `get()` and `swap(userId | null)`.
- Swap = stop workers → flush in-flight repo writes → `db.close()` → open new DB → restart workers.
- All repo code calls `dbProvider.get()`; no module-level Dexie references remain.
- Anonymous → signed-in: if both sides have data, show merge dialog. "Use this device" / "Merge" copies `orbita-local` rows into the per-user DB (and enqueues them), then deletes the source on user confirmation from SyncPage.

## 4. Conflict Resolution & Idempotency

- **Append-only** (`sessions_log`, `challenge_attempts`): server upserts on `op_id`; retries are no-ops.
- **`country_progress`**: per-skill — server applies incoming skill iff `incoming.version > stored.version`. `seen`/`correct` are sent as deltas; server adds via `coalesce(stored,0) + delta`. Returns canonical row.
- **`unlocks`**: idempotent on `(user_id, key)`; earliest `unlocked_at` wins.
- **`daily_streak`**: per `(user_id, date_key)`; server keeps `max(count)`, `max(last_active_at)`.
- **`profiles`**: last-writer-wins by `updated_at`.

Every mutation carries a client-generated `op_id` (uuid v4), persisted on the local row so retries reuse the same id.

## 5. Sync Protocol

Server fns (TanStack `createServerFn`, `.middleware([requireSupabaseAuth])`) in `src/lib/sync/sync.functions.ts`:

- `syncPush({ mutations: Mutation[] })`
  - Zod validation. Applied via user-scoped `supabase` (RLS enforced).
  - Returns `{ accepted: string[], rejected: { op_id, reason }[], canonical: Patch[] }`.
- `syncPull({ cursors: Record<entity, string|null>, limits?: Record<entity, number> })`
  - Per-table `updated_at > cursor`, cap 500/table, ordered ascending.
  - Returns rows + new `cursors` (max `updated_at` per table, or `server_now` fallback when empty).

Workers (`src/lib/sync/{pushWorker.ts,pullWorker.ts}`):
- **push**: drains `outbox` in batches of 50 ordered by `next_attempt_at`. Exponential backoff with jitter (1s → 60s cap, max 10 attempts → `dead`). On accept: delete outbox row + apply canonical patches. On hard reject: mark `dead`, surface in SyncPage.
- **pull**: triggers on auth ready, `visibilitychange → visible`, and a backoff timer (30s active, growing to 5min idle, reset on user activity). Persists cursors atomically with the Dexie write.
- Realtime channel behind `VITE_ENABLE_REALTIME_SYNC` flag, default off.

## 6. Repo Changes (`src/lib/db/repo.ts`)

- All Dexie access via `dbProvider.get()`.
- `recordSessionEnd` becomes one Dexie transaction: insert `sessions_log` (with `op_id`) + per-skill `country_progress` delta ops (each bumps local `skill_versions[skill]`) + any `unlocks` upserts + matching outbox rows sharing a `batch_id`.
- `recordChallengeAnswer` enqueues a `challenge_attempts` insert with `op_id` generated at row creation.
- Enqueue happens in the same Dexie transaction as the user-visible write; the network call is never awaited.

## 7. Auth Wiring

- `src/routes/auth.tsx` + `src/features/auth/AuthPage.tsx`: tabs Sign in / Create account, email+password, "Continue with Google" via `lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin })`, "Continue without account" link back to `/`.
- `src/routes/_authenticated/route.tsx` (integration-managed) gates only `/account/*`. Gameplay stays public.
- `src/routes/_authenticated/account.tsx`, `account.sync.tsx` → `AccountPage`, `SyncPage`, `MergeDialog`.
- `src/start.ts`: append `attachSupabaseAuth` to existing `functionMiddleware` (do not replace).
- `src/routes/__root.tsx`: mount `onAuthStateChange` (filtered to `SIGNED_IN`/`SIGNED_OUT`/`USER_UPDATED`), call `dbProvider.swap(userId|null)`, start/stop workers, render header SyncPill + account menu.
- Sign-out hygiene: `cancelQueries → clear → stopWorkers → drain → signOut → dbProvider.swap(null) → navigate('/', { replace: true })`.

## 8. UI Surfaces

- `/auth` — glass card auth page.
- Header: account menu (signed-out → "Sign in"; signed-in → avatar dropdown). SyncPill states: `Synced · 2s`, `Syncing…`, `Queued (n)`, `Offline`, `Error`. Click → `/account/sync`. Rendered only in header — never inside `SessionHud` / `SpeedPage`.
- `/account` — display name, avatar flag, devices, danger zone (Reset cloud progress, Delete account).
- `/account/sync` — outbox length, last push/pull, last error, per-table cursors + row counts, "Force full resync" button, dead-letter list.
- First-sign-in **MergeDialog**: Merge (default) / Use cloud / Use this device. Single-side cases auto-pick with a toast.

## 9. Gameplay Isolation (verification)

- ESLint boundary blocks `src/features/engine/**` and `src/features/speed/**` from importing `src/lib/sync/**` or `src/features/sync/**`.
- `useSpeedRuntime`, `useSession` do not import `useSyncStore`.
- `repo` returns immediately after Dexie commit; outbox enqueue is part of the same transaction, no network awaits.
- Manual check: 60s Speed Round produces zero sync-related awaits on the hot path.

## 10. Files to Add / Edit

Add:
- `src/routes/auth.tsx`, `src/features/auth/AuthPage.tsx`
- `src/routes/_authenticated/route.tsx` (integration-managed)
- `src/routes/_authenticated/account.tsx`, `src/routes/_authenticated/account.sync.tsx`
- `src/features/account/{AccountPage,SyncPage,MergeDialog}.tsx`
- `src/features/sync/{useSyncStore.ts,SyncPill.tsx,AccountMenu.tsx}`
- `src/lib/sync/{queue.ts,pushWorker.ts,pullWorker.ts,types.ts,clientId.ts,backoff.ts,merge.ts,sync.functions.ts}`
- `src/lib/db/dbProvider.ts`
- `src/hooks/useAuth.ts`
- Supabase migration: all tables, indexes, grants, RLS, `app_role`/`user_roles`/`has_role`, `handle_new_user` trigger, `sync_push`/`sync_pull` are RPCs callable from server fns.

Edit:
- `src/lib/db/orbita-db.ts` — v3 migration; remove module-level `db` export in favour of `dbProvider.get()`.
- `src/lib/db/repo.ts` — route via `dbProvider`; batched enqueue with `op_id` + per-skill version bump.
- `src/routes/__root.tsx` — auth listener, dbProvider swap, sync boot, header SyncPill + AccountMenu.
- `src/start.ts` — append `attachSupabaseAuth`.
- `eslint.config.js` — add restricted-imports boundary.

## 11. Out of Scope (Phase 5+)

Leaderboards, friends, social challenges, push, admin tools, paid tiers, server-authoritative anti-cheat.

## 12. Acceptance Criteria

- Signed-out gameplay byte-identical to Phase 3.
- Speed Round 60s run: zero reads from `useSyncStore`, zero awaits on sync code paths.
- Two devices editing different skills on the same country converge without loss (per-skill version test).
- Retrying a push with the same `op_id` never duplicates sessions or challenge attempts.
- Idle pull returns 0 rows after steady state (cursor advance verified).
- New device sign-in reaches `Synced` within one pull cycle.
- All new public tables: explicit GRANTs, RLS scoped to `auth.uid()`, `(user_id, updated_at)` + `(user_id, client_id)` indexes.
- No `client.server` import reachable from the client graph; no protected server fn called from a public loader.
- No hardcoded Supabase URL/keys anywhere in source.
