# BOOOKS data foundation: port plan

Work order: `../BOOOKS_AGENT_WORK_ORDERS.md` (workspace root, outside git).
Branch: `boooks/data-foundation`. Worktree: `/Users/jacobgawad/Desktop/capacitor/threejs-data-foundation`.
Based on `main` @ `b203f0b`. **Not pushed.**

## Roles and ownership

| Owner | Scope |
|-------|-------|
| Opus (this branch) | SQLite + Drizzle foundation, repositories/use cases, file storage, outbox, platform adapters, one CRUD slice, PWA + Capacitor shell |
| Qwen (separate slice) | `src/stores/useLevelStore.ts`, `src/stores/game/**`, `slices-agent.md`, shelf progression. **Not touched here.** |
| Human reviewer | Approves merge order and the guest-merge conflict policy |

## Allowed paths (this branch)

- Add: `src/data/**`, `src/platform/**`, `src/routes/notes.tsx`, `src/stores/useNotesStore.ts`, `drizzle/**`,
  `drizzle.config.ts`, `capacitor.config.ts`, `android/**`, `ios/**`, `tests/data-*.test.mjs`, `tests/browser/**`,
  `scripts/copy-sql-wasm.mjs`, `public/manifest.webmanifest`, `public/pwa-*.png`, `docs/engineering/**`
- Edit minimally: `package.json`, `package-lock.json`, `vite.config.ts`, `index.html`, `.gitignore`,
  `src/routeTree.gen.ts` (generated)
- **Not edited:** Three.js/R3F/Drei scene code, scanner, maps, reader, `useLevelStore`, existing localStorage/IndexedDB stores.

## Evidence gathered

- The only agent instructions in the repo are in `slices-agent.md` (Qwen's, untracked on `main`).
- Stack: Vite 8 (rolldown), React 19, TanStack Router (file routes, `src/routeTree.gen.ts` committed), Zustand 5,
  Three 0.185, R3F 9, Drei 10, Tailwind 4, Biome, and a Cloudflare Worker serving `dist` under `/threejs/`.
- Tests: `node --test tests/*.test.mjs` (TS imported via Node 24 type stripping or bundled with rolldown).
- Package manager: `node_modules` was installed from `package-lock.json`, although `.cta.json` says bun. This branch uses **npm**
  and updates `package-lock.json`. `bun.lock` is left untouched and is now **stale** (flagged).
- **No Capacitor, SQLite, Drizzle, PWA manifest or service worker existed before.**
- Current persistence, unchanged and a candidate for later migration:
  - IndexedDB: `boooks-scans` (scanned `LibraryBook`s incl. cover data), `boooks-scan-drafts` (photo data URLs).
  - localStorage: `boooks-shelf-level` (Qwen), `boooks-shelf-plates-v1`, `boooks-page-curl`, book sizes,
    `boooks-reading:${id}`, removed books, feature flags, scanner models, performance mode, nav language, messages,
    controller position.
- The "old Three.js folder" is the app itself (`threejs/`). The sibling `../boooks` mentioned in `slices-agent.md` does not
  exist at that path. Nothing is moved or deleted.

## Baseline (main @ b203f0b, before any change)

| Check | Command | Result |
|-------|---------|--------|
| Types | `npx tsc --noEmit` | exit 0, 0 errors |
| Tests | `node --test tests/*.test.mjs` | 183 pass, 0 fail |
| Build | `npx vite build` | exit 0 (warning: chunks > 500 kB, pre-existing) |
| Lint | `npx biome lint` | **exit 1: 32 errors, 76 warnings (pre-existing)** |
| `npm run typecheck` | runs `wrangler types` first | not used as baseline (rewrites git-ignored `worker-configuration.d.ts`) |

Tooling: Node 24.18, npm 11.16, JDK 17 (Zulu), Android SDK (platforms 36/37, AVD `Boooks_pixel_9`),
**Xcode not installed** (Command Line Tools only), CocoaPods absent, Google Chrome present.

## Versions verified (npm registry, 2026-10-22)

`@capacitor/core|cli|android|ios` 8.5.3; `@capacitor-community/sqlite` 8.1.1 (peer `@capacitor/core >=8`);
`jeep-sqlite` 2.8.0 (2024-08-16, deps `sql.js ^1.11.0`, `localforage`); `sql.js` 1.15.1; `drizzle-orm` 0.45.4;
`drizzle-kit` 0.31.11; `@capacitor/filesystem` 8.1.5; `@capacitor/camera` 8.2.6; `@capacitor/geolocation` 8.2.4;
`vite-plugin-pwa` 2.0.0 (peer vite ^8 ok); `playwright-core` 1.64.1.
Capacitor 8 docs: Node ≥ 22, Android Studio ≥ 2025.2.1 / API ≥ 24, Xcode ≥ 26, SPM is the iOS default.

## Spike (disposable, `/tmp/boooks-spike`, real Chrome, persistent profile)

Stack under test: `@capacitor-community/sqlite` web plugin → `<jeep-sqlite>` → sql.js in memory → localforage
IndexedDB, with Drizzle `sqlite-proxy` on top.

| # | Question | Result |
|---|----------|--------|
| S1 | Docs say copy `node_modules/sql.js/dist/sql-wasm.wasm`. Does it work? | **No.** sql.js 1.15.1 wasm → `LinkError: Import #34 "a" "I"`; jeep 2.8.0 bundles older glue. **sql.js 1.11.0 wasm works.** |
| S2 | Drizzle proxy `db.transaction` commit | Works (insert + update visible, survived restart). |
| S3 | Drizzle proxy `db.transaction` rollback on error | Works (UNIQUE violation threw; the earlier insert in the same tx is absent). |
| S4 | Restart after `closeConnection` | All rows present. |
| S5 | Browser SIGKILL after last `saveToStore` | All saved rows present. |
| S6 | Browser SIGKILL with writes after the last save | **Unsaved writes lost.** Web durability = last `saveToStore`. |
| S7 | `saveToStore` while a transaction is open | **Silently ends the transaction** (sql.js `export()`); later COMMIT fails "no transaction is active". |
| S8 | `PRAGMA foreign_keys` after save | Re-enabled by jeep (raw sql.js resets to 0 after export). |

Drizzle 0.45.4 source review: `sqlite-proxy` `transaction()` sends `begin`/`commit`/`rollback` through the same callback,
so it is safe only if **no other query can interleave** on the connection. `sqlite-proxy/migrator` reads migration
folders with `fs`, so it cannot run in a browser or WebView.

## Architecture decision

```
React UI (src/routes/notes.tsx)
 └─ Zustand (src/stores/useNotesStore.ts: UI/session state only, calls use cases)
     └─ use cases (src/data/usecases: validation, rules, outbox, promotion)
         └─ repositories (src/data/repositories: Drizzle typed queries, always profile-scoped)
             └─ Database (src/data/db: one serialized lock, transaction-only writes, flush after commit)
                 └─ SqlDriver: app = CapacitorSqliteDriver (native SQLite; jeep-sqlite on web)
                               tests = SqlJsDriver (sql.js in Node)
FileStore (src/platform/files): web = dedicated IndexedDB store; native = @capacitor/filesystem (Directory.Data)
```

Rules that follow from the spike:
1. **All database access goes through one async mutex.** Drizzle proxy transactions are safe only because nothing interleaves.
2. **All writes run inside `database.write(fn)`**: `BEGIN IMMEDIATE … COMMIT`, then a flush (`saveToStore` on web, no-op
   natively). The flush never runs while a transaction is open (S7).
3. **A use case resolves only after its flush.** On web, "saved" in the UI means "in IndexedDB".
4. **The sql.js wasm is pinned** to the 1.11.0 build that jeep 2.8.0 links (S1). `scripts/copy-sql-wasm.mjs` copies it,
   and a test fails if it drifts.
5. **Migrations are bundled** as ordered SQL (from `drizzle-kit generate`, imported as strings) and applied by our own
   migrator, one transaction each, recorded in `_migrations`. Drizzle's fs migrator is not used.
6. **One database per install** (`boooks`). Personal rows carry `profile_id`; repositories require `profileId`, and every
   query filters on it.
7. **Web multi-tab:** jeep keeps the database in memory per tab and the last save wins. A Web Locks exclusive lock lets
   only one tab open the database; the others show "open in another tab".

## Guest → account promotion

- On first run a **guest profile** is created (`kind='guest'`). The app works fully offline with no account.
- `AccountDirectory` seam: `lookup(email)` is honest about being offline. The only implementation,
  `OfflineAccountDirectory`, returns `{ status: "unavailable" }`. There is no fake authentication.
- `promoteGuest(guestId, target)`, where target is `{ kind: "new", displayName }` or `{ kind: "existing", profileId }`:
  - Merge id is deterministic (`merge:${guestId}:${targetId}`) and stored in `profile_merges`. For `new`, the target id is
    also deterministic (`acct-${guestId}`), so a retry finds the same account.
  - **One transaction:** copy guest rows to the target with deterministic ids (`${mergeId}:${sourceId}`) using
    `INSERT … ON CONFLICT DO NOTHING`; verify that every guest row is either present in the target or a recorded
    conflict; mark the guest `merged_into` and the merge `completed`. If verification fails, the merge throws and rolls back.
  - Guest rows are **never deleted** here. The guest stays as an archived profile until a later, explicit cleanup use case
    (not built).
  - Retry or duplicate calls: a `completed` merge returns its stored report. A crash before commit leaves no partial state.
- **Conflict policy:** notes are copied and never overwrite anything. A guest note whose `client_key` already exists in the
  target is **skipped** (the target wins) and counted in `skippedConflicts`. File metadata is copied and points to the same
  immutable, content-addressed blob. One `profile.merge` outbox entry is recorded for the target.

## Sync boundary (outbox)

`outbox(id, profile_id, entity, entity_id, op, payload_json, idempotency_key UNIQUE, status pending|done|failed,
attempts, next_attempt_at, last_error, created_at, updated_at)`. Each mutating use case writes its outbox row in the
**same transaction** as the data change. `drainOutbox(transport)` sends due rows with exponential backoff. **There is no
server.** The only shipped transport is `unconfiguredTransport`, which leaves rows pending. Tests use a fake transport to
prove retry and idempotency.

## Migration seam for `boooks-shelf-level` (Qwen, later)

Not implemented here. Proposed once Qwen's `saveSlice` is reviewed:
- Table `profile_settings(profile_id, key, value_json, updated_at, PK(profile_id, key))` is **created in migration 0000**,
  so no later schema change is needed. `settingsRepository.get/set(profileId, key)` already exists.
- Qwen's `hydrate()` must stay **synchronous at module load**, but SQLite opens asynchronously. Keep the localStorage read
  as the synchronous first-paint cache, then reconcile from `profile_settings` key `shelf.libraryLevel` after
  `bootstrap()`. One-time import: if the row is missing, store the clamped localStorage value.

## Acceptance checks → evidence

See `agent-log-opus.md` § Results.


