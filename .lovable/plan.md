## ORBITA Correctness & Stability Refactor

A correctness-first pass touching Speed mode, Account, Explorer layout, spaced repetition, keyboard, and Supabase persistence. No new features beyond what's explicitly required.

---

### 1. Speed mode — clean reset on mode switch

**File:** `src/features/speed/speedRuntimeStore.ts`
- Rewrite `reset()` to clear: interval/timeout handles, `queue`, `index`, `score`, `combo`, `wrong`, `answerLock`, `lastFeedback`, `startedAt`, `endedAt`, `mode`, and any auto-advance timers. Store timer IDs as refs in the store and `clearInterval`/`clearTimeout` defensively.
- `start(mode)` always calls `reset()` first, then seeds fresh queue.

**File:** `src/features/speed/SpeedPage.tsx`
- Key the inner Active component with `mode` so React fully unmounts on mode change: `<Active key={mode} mode={mode} />`.
- Mode selector calls `reset()` then `start(newMode)` — never mutates in place.
- Unmount effect calls `reset()` unconditionally.
- Ensure "Exit" button is always reachable (no overlay z-index trap) and calls `reset()` + `navigate({to: "/"})`.

### 2. Account section + delete account

**Files:** `src/routes/_authenticated/account.tsx`, `src/lib/auth/profile.ts`, `src/hooks/useAuth.ts`, new `src/lib/account.functions.ts`
- Header shows `profile.display_name` (fallback to email local-part) via a `useProfile()` query against `profiles`.
- Add "Delete account" with confirm dialog (type "DELETE" to confirm).
- New Supabase RPC `delete_account()` (SECURITY DEFINER) deletes from `country_progress`, `sessions_log`, `challenge_attempts`, `unlocks`, `daily_streak`, `user_roles`, `profiles` where `user_id = auth.uid()`, then calls `auth.admin.delete_user(auth.uid())` via a privileged server fn (since RPC cannot delete auth users directly — use a `createServerFn` with `requireSupabaseAuth` that loads `supabaseAdmin` inside the handler and calls `auth.admin.deleteUser`).
- After success: `supabase.auth.signOut()` → `dbProvider.swap(null)` → navigate to `/auth`.

**Profile auto-upsert:** in `src/routes/__root.tsx` `onAuthStateChange` listener (filtered), on `SIGNED_IN` call an idempotent `upsertProfile()` server fn that inserts `{id: auth.uid(), display_name: metadata.display_name ?? email-local}` on conflict do nothing. (Trigger `handle_new_user` already exists — verify and rely on it; only add client upsert as safety net.)

### 3. Explorer layout rewrite

**Files:** `src/features/explorer/ExplorerPage.tsx`, new `src/features/explorer/AtlasLayout.tsx`
- New `AtlasLayout` wrapper: `min-h-dvh`, CSS grid `grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]`, fixed gap, shared horizontal padding token (`px-6 lg:px-10`).
- Globe left cell: `relative` with explicit height (`h-[calc(100dvh-var(--hud-h))]` on desktop, `aspect-square` on mobile). No `absolute` positioning leaks.
- Right panel: `CountryPanel` / `Expeditions` / search renders in second grid cell with `sticky top-[hud]` and internal scroll. Tabs sit above grid in a header band so they don't shift on selection.
- Search bar and tab nav share the header band — single source of spacing.
- Remove every ad-hoc `absolute inset-*` overlay on Globe inside Explorer.

### 4. Unified spaced repetition (SM-2 variant)

**New:** `src/lib/spacedRepetition.ts`
- Pure functions: `initSrs()`, `updateSrs(prev, {correct, responseMs, hintUsed})` returning `{easeFactor, interval, repetitions, nextReviewAt, lastReviewedAt}`.
- Algorithm: SM-2 base. Quality derived (no user grading):
  - correct + fast (≤ p50) + no hint → q=5
  - correct + normal → q=4
  - correct + hint used → q=3
  - wrong → q=1, repetitions=0, interval=1 day
- EF clamp `[1.3, 2.8]`. Intervals in days; `nextReviewAt = now + interval*86400000`.

**Integration:** `src/lib/mastery.ts` and `src/features/engine/useSession.ts`
- On every answer, write SRS fields per `(country_code, skill)` into `country_progress.skills[skill]` JSON shape: `{ef, interval, reps, next, last, correct, wrong}` and bump `skill_versions[skill]`.
- Mirror through existing Dexie repo + sync queue → `sync_push` RPC writes to Supabase (already merges by version).

**Progress page:** `src/features/progress/ProgressPage.tsx`
- New "Mastery Stability" card computing from `country_progress`:
  - Retention score: `correct / (correct+wrong)` weighted by interval.
  - Due today / overdue counts.
  - % items in active review (reps ≥ 2 and next > now).
  - Global stability % = `active / total_seen`.
- Per-skill breakdown table (Find/Name/Flags/Capitals): retention, due, overdue, avg interval.

### 5. Global keyboard reliability

**Files:** `src/hooks/useAnswerHotkeys.ts`, new/replace `src/hooks/useGlobalSkipHotkey.ts` (rename of `useSkipHotkey.ts`)
- Attach listeners to `window` with `capture: true` so animations/auto-advance overlays can't swallow keys.
- Guards: skip when `event.target` is `input/textarea/[contenteditable]` OR `document.querySelector('[role=dialog][data-state=open]')`.
- 1–4: dispatch through a context-free callback registered by current page (registry in a tiny Zustand store) — survives re-renders.
- Space: always Skip when a session is active; debounce 150ms.

### 6. Supabase-only persistence audit

**Files:** `src/lib/sync/queue.ts`, `src/lib/sync/workers.ts`, `src/lib/sync/sync.functions.ts`, `src/lib/db/repo.ts`
- Confirm all writes go: UI → repo (Dexie cache) → enqueue mutation → `sync_push` RPC. Reads on login: `sync_pull` → hydrate Dexie.
- Remove any code path that treats Dexie as source of truth for cross-device state (sessions, progress, unlocks, streaks). Dexie remains only as offline cache and write-ahead log.
- Grep for "lovable cloud" / `lovable.` references in sync paths and remove.

### 7. Responsive polish (desktop-first)

- Explorer, Speed, Progress: enforce `min-h-dvh`, shared `max-w-[1440px] mx-auto` container, consistent `gap-6 lg:gap-8`.
- No overlapping components — verify with browser screenshot at 1440×900 and 1920×1080.

---

### Database migration (single migration)

```sql
-- delete_account RPC: removes app data; auth user deletion done via admin server fn
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  delete from public.country_progress where user_id = uid;
  delete from public.sessions_log where user_id = uid;
  delete from public.challenge_attempts where user_id = uid;
  delete from public.unlocks where user_id = uid;
  delete from public.daily_streak where user_id = uid;
  delete from public.user_roles where user_id = uid;
  delete from public.profiles where id = uid;
end; $$;
grant execute on function public.delete_account() to authenticated;
```

Server fn `deleteAccount` (auth-gated) then calls `supabaseAdmin.auth.admin.deleteUser(userId)`.

---

### Files touched

**New:** `src/lib/spacedRepetition.ts`, `src/lib/account.functions.ts`, `src/features/explorer/AtlasLayout.tsx`, `src/hooks/useGlobalSkipHotkey.ts`
**Edited:** `src/features/speed/speedRuntimeStore.ts`, `src/features/speed/SpeedPage.tsx`, `src/routes/_authenticated/account.tsx`, `src/lib/auth/profile.ts`, `src/hooks/useAuth.ts`, `src/routes/__root.tsx`, `src/features/explorer/ExplorerPage.tsx`, `src/lib/mastery.ts`, `src/features/engine/useSession.ts`, `src/features/progress/ProgressPage.tsx`, `src/hooks/useAnswerHotkeys.ts`, `src/lib/sync/queue.ts`, `src/lib/sync/workers.ts`, `src/lib/db/repo.ts`
**Deleted:** `src/hooks/useSkipHotkey.ts` (replaced)
**Migration:** `delete_account` RPC.

### QA checklist

- Switch Speed mode → fresh timer, fresh queue, no stale combo.
- Account page shows display name; delete account wipes all rows + auth user, signs out, clears Dexie.
- Explorer: Globe never covers panels at 1280/1440/1920; tabs and search aligned.
- Answer in Find/Name/Flags/Capitals updates SRS fields in Dexie + Supabase; Progress shows stability metrics.
- 1–4 and Space work mid-animation, mid-auto-advance, after dialog close.
- No Dexie-only writes for sync entities.
