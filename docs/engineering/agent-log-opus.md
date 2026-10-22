# Agent log: Opus (BOOOKS data foundation)

Branch `boooks/data-foundation`, worktree `/Users/jacobgawad/Desktop/capacitor/threejs-data-foundation`, based on `main` @ `b203f0b`.
Nothing pushed. Plan and decisions: `boooks-port-plan.md`.

## Checkpoint 0: evidence and baseline (no source changes)

Commands (run in `threejs/` on `main`):
- `git status` → only `?? slices-agent.md`. Existing worktrees: `cline/10993`, `1938f`, `91e16`, `dfc4b`, `eb7f1`.
- `npx tsc --noEmit` → exit 0.
- `node --test tests/*.test.mjs` → `tests 183, pass 183, fail 0`.
- `npx vite build` → exit 0, with the chunk-size warning.
- `npx biome lint` → exit 1, `Found 32 errors. Found 76 warnings.` (**pre-existing**)
- `git worktree add -b boooks/data-foundation ../threejs-data-foundation main`, then `npm ci` → exit 0.

Spike in `/tmp/boooks-spike` (disposable, not committed): results S1–S8 are in the plan. Commands:
`node drive.mjs clean`, `node drive.mjs crash`, `node drive.mjs unflushed` (Playwright-core driving
`/Applications/Google Chrome.app` headless with a persistent profile; SIGKILL to simulate a crash).
Note: the first spike "crash" runs used `ctx.browser().process()`, which is a no-op for persistent contexts. They were rerun
with a real `pgrep -f user-data-dir=… | SIGKILL` (8 processes killed), and S5/S6 held.

## Checkpoints (commits on `boooks/data-foundation`, oldest first)

| Commit | Scope |
|--------|-------|
| `43f91a4` | docs: plan, baseline, spike evidence |
| `6d01dbc` | data core: schema, migrations 0000+0001, serialized `Database`, drivers, pinned wasm, 12 core tests |
| `23c7b92` | repositories, use cases, guest promotion, outbox, files + 19 tests |
| `d98f986` | biome import ordering only |
| `75146d4` | platform adapters, bootstrap + tab lock, `useNotesStore`, `/notes` route, Chrome restart test |
| `18d8133` | PWA: manifest, icons, app-shell service worker |
| `6abccc0` | Capacitor 8 config, Android + iOS platforms, permissions, Android emulator test, biome ignores |
| (next) | this log |

Each commit can be reverted on its own in reverse order. Nothing pushed.

## Decisions made during implementation

- **npm with `.npmrc legacy-peer-deps=true`.** `drizzle-orm@0.45.4` declares optional peers (`expo-sqlite`, `op-sqlite`) that pull
  `react-native` → `react@^19.3`, which conflicts with the repo's react 19.2. Nothing native-React is installed. The only existing
  lockfile entries that moved are 6 browserslist/caniuse data packages.
- **Pinned wasm:** `sql.js-jeep-wasm` = `npm:sql.js@1.11.0`. `scripts/copy-sql-wasm.mjs` copies it into the git-ignored
  `public/assets/sql-wasm.wasm` and throws if the version drifts. `dev`, `build` and `build:native` run it first.
- **No `INSERT … RETURNING`** (the plugin routes it through `run()`; native behavior is unverified): `affectedRows()` reads `changes`.
- **No `unixepoch()` SQL defaults** (the native SQLite version per device is unverified). Timestamps come from the app clock.
- **Column-order guard:** Drizzle's proxy maps rows by position and the plugin returns objects. `assertColumnOrder()` runs at startup
  and fails loudly if the order is not preserved (passed on web and Android).
- **Two build modes:** web `base=/threejs/` + service worker (the Cloudflare Worker is unchanged); `--mode native` uses `base=/`,
  no SW, output in `dist-native/` (Capacitor `webDir`).
- **Test-only hook** `window.__boooksDebug` is built only with `VITE_BOOOKS_TEST_HOOKS=1` (grep confirms it is absent from normal web
  and native bundles). It calls the same `attachImage` use case and skips only the gallery picker.
- **Icons:** ImageMagick rendered the gradient logo blank; `scripts/generate-pwa-icons.mjs` renders it with headless Chrome instead.
- **Android needs JDK 21** (the Capacitor 8 camera plugin toolchain). The machine has only JDK 17 and Android Studio is not under
  /Applications, so a JDK 21 was downloaded to `/tmp/boooks-jdk21` (Temurin 21.0.12.1, not installed system-wide).

## Results (final, HEAD `6abccc0`)

| Check | Command | Result |
|-------|---------|--------|
| Types | `npx tsc --noEmit` | exit 0 |
| All unit tests | `node --test tests/*.test.mjs` | **214 pass, 0 fail** (183 pre-existing + 31 new) |
| Data tests | `npm run test:data` | 31 pass, 0 fail |
| Web build | `npm run build` | exit 0; PWA `precache 48 entries (3038.14 KiB)` |
| Native web build | `npm run build:native` | exit 0; no `sw.js` |
| Lint (repo) | `npx biome lint` | exit 1: **32 errors / 76 warnings, the same as baseline** (all in pre-existing files) |
| Lint (new/changed) | `npx biome check src/data src/platform …` | clean |
| Web, real Chrome | `npm run build && npm run test:web-restart` | **7/7 checks** |
| Capacitor | `npx cap sync`; `npx cap doctor` | exit 0; "iOS looking great", "Android looking great" |
| Android build | `JAVA_HOME=<JDK 21> ./gradlew assembleDebug` | exit 0, `app-debug.apk` |
| Android emulator | `npm run test:android` (AVD `Boooks_pixel_9`, API 36) | **4/4 checks** |
| iOS build | `xcodebuild` | **Not run: Xcode not installed** (Command Line Tools only) |

## Acceptance checks → evidence

| Requirement | Evidence |
|-------------|----------|
| Migrations from empty and prior schema | `data-core`: empty → 0000+0001; 0000 with data → 0001 keeps rows; a failing migration rolls back; a DB from a newer app is refused |
| CRUD offline, survives restart per target | Node (simulated store); **Chrome**: clean restart, SIGKILL, offline reload via SW; **Android**: `am force-stop` + relaunch |
| Guest promotion repeatable, no loss | `data-promotion`: retry/duplicate/concurrent idempotent; forced failure rolls back and a retry after restart succeeds; guest rows kept; existing-account conflict → target wins, reported. Chrome + Android: survives restart |
| Profiles cannot see each other's rows | `data-usecases` "profile isolation": cross-profile read/update/delete → NotFound; files are profile-scoped |
| File bytes via adapter, refs in SQLite | `data-usecases` (no blobs in SQLite, sha256 key, missing bytes reported); Chrome (IndexedDB); Android (Filesystem) |
| Outbox records + retries, never blocks CRUD | `data-outbox`: atomic with the change; 2s… backoff; success after retry; a write completes while `send()` hangs; max attempts → failed; survives restart. **No server; nothing is sent** |
| Web flush/close, transactions, errors | Spike S1–S8 + `data-core` (flush only outside transactions, `flush_failed`, nested write rejected, serialized writes, FK after flush) + Chrome SIGKILL |
| PWA + Capacitor builds | See Results; iOS build unavailable |
| Pre-existing vs regressions | 183/183 baseline tests still pass; lint set unchanged (same files, same rules) |

## Verified on web vs native

- **Web (Chrome, headless, persistent profile): verified.** jeep-sqlite, IndexedDB FileStore, Web Locks single tab, SIGKILL
  durability, SW offline reload. **Not verified:** Safari / iOS home-screen PWA, Firefox, storage eviction, real quota errors.
- **Android (emulator API 36, debug APK): verified.** Native SQLite, Filesystem FileStore, force-stop persistence, promotion.
  **Not verified:** real device, camera/gallery picker UI, geolocation prompt, release build, upgrade from an older APK.
- **iOS:** the SPM project was generated and `cap doctor` passes. **Nothing compiled or run.**
- `getPosition()` and native `pickImage()` compile but were **not exercised** on any target.

## Remaining risks

1. **Web write cost grows with database size.** jeep's `saveToStore` re-exports the whole database to IndexedDB on every commit.
   That is fine for small personal data; measure it before moving the library or reading positions into SQLite. The alternative is
   a different web engine (e.g. official sqlite-wasm + OPFS), behind the existing `SqlDriver` port.
2. **jeep-sqlite 2.8.0 is from 2024** and bundles old sql.js glue (S1). Upgrades must rerun `test:web-restart`.
3. **Only one tab on web.** A second tab is refused rather than corrupting data. Browsers without Web Locks proceed unprotected.
4. **The merge copies rows** (it does not move them), so promoted guests' storage doubles until a cleanup use case exists; there is
   no cleanup yet, by design. Conflict policy (target wins on `client_key`) needs product sign-off.
5. **Outbox idempotency keys** assume a future server dedupes by `idempotency_key`; no server contract exists.
6. **Large binaries on native** move as base64 over the bridge (max 10 MB enforced). Not suitable for video.
7. **`bun.lock` is stale** (npm used here). Pick one package manager before merging.
8. Optional peers forced `legacy-peer-deps`, which also hides real peer conflicts in future installs.

## Next smallest integration step

Move **one** existing localStorage key into SQLite through the `profile_settings` seam, after Qwen's slice is reviewed. Prefer
`boooks-shelf-plates-v1` (no ownership conflict) as the pilot, then `boooks-shelf-level` per the plan's seam section. Keep
the synchronous localStorage read for first paint and reconcile after `bootstrapData()`.

