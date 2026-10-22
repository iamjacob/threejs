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


---

# Game engine (branch `boooks/game-engine`, worktree `threejs-game-engine`)

Plan and contract: `boooks-game-engine-plan.md`. Based on `boooks/data-foundation` @ `dd3ea26`. This agent did not push.

## Push observation (data-foundation branch)

`git reflog` shows `origin/boooks/data-foundation` was updated "by push" at 01:00 and again at 02:32, a minute after
commit `dd3ea26`. This agent never ran `git push`. Repo and global git config have no push hooks or aliases, and
`.git/hooks` has only samples, so an editor or agent integration most likely pushed. The new branch was created with
`--no-track`, and `git ls-remote --heads origin boooks/game-engine` was empty after each commit.

## Baseline (worktree at `dd3ea26`, before edits)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | exit 0 |
| `node --test tests/*.test.mjs` | 214 pass, 0 fail |
| `npm run build` | exit 0, PWA precache 48 entries |
| `npm run build:native` | exit 0 |
| `npx biome lint` | 32 errors / 76 warnings (pre-existing) |

## Checkpoints

| Commit | Scope |
|--------|-------|
| `1a77c39` | headless core: `geo.ts`, `simulation.ts`, `loop.ts`, `types.ts`, `config.ts`, `checkpoint.ts` + 25 tests |
| `80d45b4` | `/play` slice: deps, `MapPlayRuntime`, `TornadoPlayer`, `MapPlay`, HUD, store, offline style, Chrome test |
| `2eceb4f` | Android WebView test |
| (next) | docs |

## Bugs found and fixed

- **Dropped step at exact 60 fps:** frames of 1000/60 ms summed to slightly less than n·dt in floating point, so
  30 fps and 60 fps differed by one step. Fixed with an accumulator epsilon; covered by the frame-rate test.
- **The alignment probe read the wrong matrix:** in react-three-map 1.0.1 `camera.projectionMatrix` is
  projByView·cameraMatrix; the scene → clip matrix is `camera.userData.projByView`. Rendering was correct (the
  screenshot shows the tornado at screen center); only the probe was wrong.
- **The offline fallback test was wrong:** with the network off, the remote style still loaded from the HTTP cache.
  The bundled-style fallback is now tested by blocking `tiles.openfreemap.org` on a fresh profile.



## Results (final, game engine)

| Check | Command | Result |
|-------|---------|--------|
| Types | `npx tsc --noEmit` | exit 0 |
| Game tests (headless) | `npm run test:game` | **31 pass, 0 fail** |
| All unit tests | `node --test tests/*.test.mjs` | **245 pass, 0 fail** (214 baseline + 31) |
| Lint (repo) | `npx biome lint` | 32 errors / 76 warnings = baseline |
| Lint (changed) | `npx biome check src/game src/stores/useMapPlayStore.ts src/routes/play.tsx` | clean |
| Web build | `npm run build` | exit 0; precache 55 entries (4152 KiB); 1.07 MB MapPlay chunk loads only on `/play` |
| Native build | `npm run build:native` | exit 0 |
| Test hooks absent | `grep -l __boooksMapProbe dist/assets/*.js dist-native/assets/*.js` | 0 files |
| Chrome (real WebGL) | `npm run build:test && npm run test:map-play` | **11/11** |
| Data regression | `npm run test:web-restart` | 7/7 |
| Android emulator (API 36) | `npm run test:android:play` | **4/4** |
| Capacitor | `npx cap sync`; `npx cap doctor` | exit 0; iOS and Android "looking great" |
| iOS | not run | **Xcode not installed** |

## Verified per platform

- **Chrome (desktop, headless):** joystick → command → movement; camera follow; the entity is within 2 px of
  `map.project` at 3 pitch/zoom/bearing combinations and after a free pan; rotated-map steering; controller
  pause/resume; route remount (one driver, top speed not doubled); checkpoint restored after SIGKILL; visibility
  pause/resume; network-off reload; bundled style when tiles are unreachable; zero geolocation calls.
- **Android (emulator API 36, debug APK, `swiftshader_indirect` GPU):** WebGL in the WebView; real touch through
  `adb input swipe` moves the tornado; aligned at 2 views; a checkpoint written on background survives `am force-stop`
  through native SQLite; location permission not granted.
- **Not verified:** real phones, iOS (no Xcode), Safari/WebKit, pinch on a real touch screen, frame rate on low-end
  devices, OS-killed backgrounding.

## Remaining risks

1. **react-three-map 1.0.1 internals:** the probe and the single-driver guarantee rely on its `syncCamera`/`userData`
   behavior. The geo contract test pins the math, but any upgrade must rerun `test:map-play`.
2. **The offline map is a blank ground**, not streets, until tile caching exists (follow-up 11).
3. **The MapPlay chunk is 1.07 MB** (MapLibre). It is lazy and precached, so first install downloads about 1 MB more.
4. **The play area is fixed to 5 km around HOME (Vejle).** Checkpoints outside it are ignored by design.
5. **The Android test's touch geometry** derives the WebView top from the nav-bar inset; other devices may need tuning.
6. **The background checkpoint is best-effort:** `pagehide`/`visibilitychange` may not fire when the OS kills the app.
   At worst the last pause or background position is restored.

---

# Slice: tornado from the active profile's books (branch `boooks/tornado-library-books`)

Plan and decisions: `boooks-tornado-books-plan.md`. Based on `boooks/game-engine` @ `c81c2f2`. Local branch, no upstream.

## Pre-work checks

- **Auto-push:** still unexplained, so it **could not be confirmed disabled**. The repo and global git config have no
  push settings, aliases or hooks; `~/.cline` has no push hooks (only session-shutdown logs). `ls-remote` showed
  `boooks/game-engine` was never pushed. The new branch was created with `git switch --no-track`
  (`branch.boooks/tornado-library-books.remote` is empty).
- **Status:** clean tree on `boooks/game-engine` (`c81c2f2`). Unrelated: `threejs-data-foundation` still has an
  uncommitted `agent-log-opus.md` rewrite this agent did not make.
- **Baseline:** `npx tsc --noEmit` exit 0; `node --test tests/*.test.mjs` 245/245; `npx biome lint` 32 errors / 76 warnings.
- **Contract gap (reported, then approved as Option 1):** there was no SQLite book model. Books came from
  `public/books.json`, the IndexedDB `boooks-scans` store and `useBookStore`, none of them profile-scoped.

## Checkpoints

| Commit | Scope |
|--------|-------|
| `1a82152` | plan: ownership, schema 0002, import, merge rules |
| `644f283` | migration 0002 `library_books`, repository, use cases, legacy import, merge copies books, 11 data tests |
| `b58950a` | pure `tornadoBooks` mapping + 6 tests, cover sheet, `TornadoBooks` instanced mesh, `useTornadoLibrary`, HUD, Chrome test |
| (next) | Android library check, docs |

## Bugs found and fixed

- **Books collapsed at the origin:** the first `TornadoBooks` passed the per-sheet geometry through `args`, so R3F recreated
  the InstancedMesh when the cover sheet arrived and the matrices reset to identity. Seen in a screenshot. Geometry is
  now swapped in place, and the probe reads the live instance matrices (`booksMaxRadius/Height`) to catch a regression.
- **Instance color tinted the covers:** a `color_fragment` patch now applies the book color only to sides/edges (three 0.185 chunk).
- **The empty-profile switch published stale probe data:** the library publish now runs on every outcome, including empty.
- **A slice-1 test race:** right after a remount the probe is briefly undefined until react-three-map syncs the new
  camera. `probe()` now waits for it; the 11 `map-play` checks pass again.
- **Plan revised:** import markers are kept in a separate IndexedDB database `boooks-scans-import`, because bumping
  `boooks-scans` to version 2 would break the scanner's `open(name, 1)`.

## Results

| Check | Command | Result |
|-------|---------|--------|
| Types | `npx tsc --noEmit` | exit 0 |
| Unit tests | `node --test tests/*.test.mjs` | **262 pass, 0 fail** (245 + 6 data-library + 5 legacy + 6 tornado mapping) |
| Lint (repo) | `npx biome lint` | 32 errors / 76 warnings = baseline |
| Lint (changed) | `npx biome check src/game src/data src/platform src/stores/useMapPlayStore.ts` | clean |
| Web build | `npm run build` | exit 0; precache 54 entries (4166 KiB); test hooks in bundle: 0 files |
| Native build | `npm run build:native`, `npm run cap:sync` | exit 0; hooks in synced Android assets: 0 files |
| Chrome `/play` books | `npm run build:test && node tests/browser/tornado-books.mjs` | **9/9** |
| Chrome `/play` (slice 1) | `node tests/browser/map-play.mjs` | 11/11 |
| Chrome data regression | `node tests/browser/web-restart.mjs` | 7/7 |
| Android emulator (API 36) | `npm run test:android:play` | **5/5** (adds the library check) |
| iOS | not run | Xcode not installed |

## How books reach the tornado

`useTornadoLibrary` (outside the frame loop) → `bootstrapData()` → `getActiveProfileId` → (guest only, first load)
`importLegacyScans` → `listLibraryBooks(ctx, profileId)` (rows + cover `files` rows in one read) → `toTornadoSource` (catalog →
bundled atlas path, scan → FileStore blob key) → pure `tornadoInstances` (stable slots, cap 72) → `buildCoverSheet`
(fallback cell, then atlas region or local bytes; never a remote URL) → `TornadoPlayer` props → one InstancedMesh.
Zustand gets counts only. A profile change clears the books first, and a request token drops stale results.

## Performance observations (headless Chrome, SwiftShader software GL, 1280×720)

- 18 books (whole catalog): 181 frames / 3 s, median 16.7 ms, p95 16.7 ms. A 150-book library (72 drawn): median 16.7 ms,
  p95 16.7 ms. Both are vsync-bound, with no measurable cost from the books.
- Books are **one draw call** (InstancedMesh). The cover sheet is a single texture of up to 12×6 cells of 96×144 px
  (1152×864), built once per library load. There is no per-frame allocation, React state, Zustand write or DB access
  in `useFrame` (reviewed: the frame callback touches only position and spin).
- **Not measured:** real mobile GPUs, cover decode time for large real photos (the test images are 1×1 px).

## Remaining risks

1. **New scans still go only to IndexedDB** (the scanner is out of scope). They are imported on the next `/play` load
   while a guest is active; scans made while an account is active are **not imported** yet (`skipped_not_guest`).
2. **There is no UI to add catalog books yet.** `addCatalogBook` exists and is tested, but it is reachable only from
   the test hooks. New profiles see an empty tornado.
3. **The merge copies books** and so doubles cover file rows (blobs are shared). Removing guest rows is a later cleanup.
4. **The catalog cover depends on the prebuilt atlas** (`/book-images/cover-atlas.webp`, precached). If it is missing, the
   cell keeps the metadata fallback.
5. **Profile switches are detected on focus/visibility.** Switching from another tab while `/play` stays focused isn't
   observed (the single-tab lock makes this unlikely).
6. **The legacy import runs on the main thread;** many large scans may delay the first `/play` load once.
7. **Auto-push is still unexplained.** Keep the branch local until it is found.

