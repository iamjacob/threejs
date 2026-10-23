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


# Slice: several people on one device, offline (branch `boooks/offline-shared-device`)

Plan and policy: `docs/engineering/boooks-shared-device-plan.md`. Based on `f56bf20`; local only, not pushed.

## Baseline before edits (at `f56bf20`)

`test:data` 42/42, `test:game` 37/37, `npx tsc --noEmit` exit 0, `npx biome lint` 32 errors / 76 warnings
(pre-existing; `useNotesStore.ts` had one format diagnostic, `useLevelStore.ts`/`useTourStore.ts` have import-order
errors). There is no `AGENTS.md`, no installed offline-first skill and no Supabase/Hono configuration in the repo.

## Bugs found and fixed along the way

- **A stale profile after a switch on another route.** `/play`'s checkpoint loader used `boot.profile` (cached at page
  load), so it could load or save the map checkpoint under the previous person. The `/notes` store also booted from
  `boot.profile`. All of these now read the active profile from SQLite (`resolveActiveProfile`).
- **A notes reload race.** A reload that finished after a switch could write the previous profile's notes into the
  store. It is now dropped when the profile changed.
- **Two test-tool issues (not app bugs).** zsh heredocs were garbled in the shared terminal, so files were edited with
  the editor instead. `getByText("Reader 1")` also matched "Reader 10" and "Reader 11", so the test now asserts on the
  directory element.

## Results

| Check | Command | Result |
|-------|---------|--------|
| Types | `npm run typecheck` | exit 0 |
| Unit tests | `node --test tests/*.test.mjs` | **280 pass, 0 fail** (262 + 18 new shared-device) |
| Lint (repo) | `npx biome lint` | 32 errors / 76 warnings = baseline |
| Lint (changed) | `npx biome check` on changed/new files | clean (only the pre-existing `useLevelStore`/`useTourStore` import order remains in `src/stores`) |
| Web build | `npm run build` | exit 0; precache 57 entries (4186 KiB); test hooks in `dist`: 0 files |
| Chrome `/people` | `npm run build && npm run test:shared-device` | **8/8** (11 people offline, directory, message, MutationObserver leak check with a canary self-test, SIGKILL, opt-out, restart, offline SW reload) |
| Chrome regressions | `web-restart` / `tornado-books` (build:test) / `map-play` | 7/7, 9/9, 11/11 |
| Android emulator (API 36, `Boooks_pixel_9`) | `npm run test:android:people` | **2/2** (native SQLite; message survives `am force-stop`; nonparticipant sees nothing) |
| Android regression | `npm run test:android` | 4/4 |
| Native sync | `npm run cap:sync` (final, no hooks) | exit 0; hooks in Android assets: 0 files |
| iOS | not run | Xcode build not attempted in this slice (`cap sync` copied assets only) |
| Physical device | not run | only the emulator was available |

## Remaining risks / open decisions

1. **Policy for opting out:** existing conversations stay readable by their members. Confirm this, or decide to
   hide them.
2. **There is no profile lock.** Anyone holding the device can switch to any person. A PIN would be UI gating only,
   not encryption.
3. Avatars, group conversations, message deletion and profile removal are not implemented.
4. `listConversations` reads the last message once per conversation (N+1 inside a single serialized read). That is
   fine at shared-device scale and was not measured beyond the test sizes.
5. Remote messaging is not started. It needs a new `scope`/`status` set, a separate adapter, and real Supabase Auth
   configuration, none of which exist in the repo.


# Slice: back-and-forth loader + shelves ⇄ map transition (same branch, after `2793601`)

## What changed

- **Loader:** `LoaderMark` (wordmark plus a glowing segment that slides back and forth with CSS `alternate`, 1.1 s per
  leg; 2.4 s with reduced motion). It is used by the shelves `MarkLoader`, the `/play` Suspense fallback and the
  transition overlay. `MarkLoader` no longer fakes a percentage (the old fill crept forward on a timer). Its
  mount and fade-out timing are unchanged.
- **Transition:** `src/stores/sceneTransition.ts` is a small state machine:
  `idle → cover (320 ms iris from the tapped button) → wait → reveal (480 ms fade) → idle`. Navigation runs only after
  the screen is covered, and the destination's code is preloaded during the cover. The destination calls
  `useArriveWhen(path, ready)`: the shelves page when `sceneBooted`, the map when the runtime is ready **and** MapLibre
  has fired its first `idle` (or the offline style failed). There is a 10 s safety reveal, and double taps are ignored.
  Root-level `<SceneTransition/>` registers the router's navigate/preload.
- **Joystick menu:** the shelves menu gains **"Open map"** (`go-map`; it pauses the cinematic reel first). The map menu
  gains **"Shelves"** (`go-shelves`). The old shelves item labelled "Map" only cycled the 3D environment, so it is
  renamed **"Scenery"**. Its id `map` and its behaviour are unchanged.
- Leaving the map unmounts the runtime, whose existing `dispose()` writes the exit checkpoint (verified on web and
  Android).

## Results

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `node --test tests/*.test.mjs` | **285/285** (+5 `scene-transition`: order, double tap, stuck/failed navigation, no navigator, back-and-forth) |
| `npm run build` | exit 0; 58 precache entries; test hooks in dist: 0 |
| Chrome `npm run test:scene-switch` (build:test) | **4/4**: the bar moves both ways (sampled `transform`), 3 joystick round trips, checkpoint restored, no page errors |
| Chrome regressions `map-play` / `tornado-books` | 11/11, 9/9 |
| Android emulator `npm run test:android:scene` | **3/3** (2 round trips + native checkpoint) |
| `npm run cap:sync` (final) | exit 0; hooks in Android assets: 0 |
| Lint (repo) | 32 errors / 76 warnings = baseline; changed files clean |
| iOS / physical device | not run |

## Notes / risks

- On Android the menu was driven through its keyboard path (Enter on focused buttons). Real touch on the dial is
  covered only for steering, by `android-map-play`.
- In headless Chrome the boot loader was sometimes gone before sampling (cached assets). The back-and-forth motion
  was then asserted on the transition overlay, which uses the same component.
- The map style is fetched online on each visit (existing behaviour). With a slow network the overlay waits for the
  first `idle`, for at most 10 s.



# Slice: route registry + shell, then /book/:bookId and /read/:bookId (same branch, after `0a58c2a`, uncommitted)

Details: `docs/engineering/boooks-routes.md`.

## Baseline (at `0a58c2a`)

Typecheck pass; 285/285 unit; lint 32 errors / 76 warnings; build pass. Chrome: scene-switch 4/4 (first run failed
on the loader-motion sample, the rerun passed), map-play 11/11 (first run timed out on the remote style, the rerun
passed), tornado 9/9, shared-device 8/8, web-restart 7/7.

## Bugs found along the way

- **The reader iframe was loading the app, not Foliate, under the service worker.** Workbox's SPA
  `navigateFallback` answered `/reader/index.html` with `index.html` (seen in Chrome once the SW controlled the page).
  Fixed with `navigateFallbackDenylist: [/\/reader\//]` and a `boooks-reader` runtime cache.
- **Opening a book in 3D from a `/book/:id` card jumped the URL to `/`.** `enter()` resets `bookPanel` before the
  action sets it again, so "read with a closed panel" appeared for one store update. Fixed by batching store writes
  per microtask and treating that state as transient (unit regression test).
- **Pre-existing, not fixed:** catalog PDFs fail on the Android emulator WebView (Chrome 133). The bundled PDF.js
  5.5.207 calls `Uint8Array.prototype.toHex` (Chrome ≥ 140). The reader shows its own error and Retry. Scanned books
  read fine.

## Results (final)

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `node --test tests/*.test.mjs` | **303/303** |
| `npx biome lint` | 32 errors / 76 warnings = baseline; changed/new src files clean |
| `npm run build` | exit 0, 70 precache entries, no test hooks in `dist` |
| Chrome `test:book-routes` | **7/7** |
| Chrome `test:routes` | **11/11** |
| Chrome shared-device / web-restart / scene-switch / map-play / tornado-books | 8/8, 7/7, 4/4, 11/11, 9/9 |
| Android emulator (API 36) `android-book-routes` | **5/5** (catalog PDF gap logged, see above) |
| Android emulator `android-scene-switch` | 3/3 |
| `npm run cap:sync` (final, no hooks) | exit 0; no test hooks in Android assets |
| iOS / physical device | not run |



# Slice: local-first Book Manager (inventory + boundary, written before code)

## Repository truth (checked in this checkout)

- Branch `boooks/offline-shared-device`, HEAD `0a58c2a`. **The route/navigation, book-route, multi-db spike and
  `/beta` work are all uncommitted** (60 entries in `git status`). Nothing was reset or cleaned.
- `/maps` is the canonical map route (`src/routes/maps.tsx`); `/play` is gone.
- `/book/$bookId` and `/read/$bookId` exist as `_shelves` children. Their id is the **shelf id**, i.e. the catalog
  ISBN/title or a legacy scan id, from the in-memory `useBookStore`. It is **not** the SQLite `library_books.id`.
- SQLite (single DB, Drizzle, migrations 0000–0003): `library_books` (profile-scoped; `source` catalog|scan;
  `catalog_id`; title/author; size; three cover file ids; soft delete), `files` (profile-scoped metadata; bytes in
  the content-addressed FileStore), `outbox` (pending forever; `unconfiguredTransport` sends nothing).
- No AGENTS.md. No Supabase or Hono code or config.
- Intake that exists today: the scanner writes only to the legacy IndexedDB `boooks-scans`. `importLegacyScans`
  copies those into the guest's `library_books` + `files` (verified, originals kept). `pickImage()` exists (web file
  input / Capacitor Camera gallery). The tornado on `/maps` is the only UI that reads `library_books`.

## First-slice boundary

1. **Route** (revised while building): `/library/$bookId`, a top-level page (AppShell). A child of the shelf route `/book/$bookId` would inherit the 3D layout. `$bookId` here is the stable
   **library book id** (`library_books.id`), so it opens directly after restart and never changes when a remote
   match appears. `/book/$bookId` (the shelf card) is unchanged. A "Your library" list at `/library` links to each
   manager page. The reader-facing card links to its manager when the active profile has that book.
2. **Migration 0004 (additive)**: `book_assets` (the content manifest: id, profile, book, kind
   cover|page_scan|digital_file, role/face, page_index, mime, bytes, sha256, file ref, original name, provenance,
   rights note, intake status, error, timestamps) and `sync_states` (target/entity/entity_id, acknowledged
   version + hash + time; **no rows are written now**). Plus nullable metadata columns on `library_books`:
   subtitle, isbn, edition, publisher, expected_page_count, catalog-identity status, metadata revision. Existing
   rows keep their meaning; legacy cover columns stay. Cover file ids are mirrored into the manifest as a read-only
   view, not migrated.
3. **Use cases**: `getBookOverview`, `updateBookMetadata` (local fields only; catalog facts are not edited),
   `addPageScan` (bytes → FileStore → verify hash → one transaction: file row + manifest row; idempotent on
   (book, sha256)), `removeAsset` (confirm; soft remove that keeps the blob while another row references it), and a
   pure `deriveBookStatus` with separate dimensions (local record, remote sync, content, catalog identity, public
   registration, chain).
4. **Intake path**: individual page images through the existing `pickImage()`. Page order comes from the next free
   index. A failed save shows its reason and Retry, and a retry stores one copy.
5. **Honesty**: remote sync always reads "Local only · sync not configured". No Fetch button (a note explains that
   content must be scanned or imported). Registration and chain read "Not proposed" / "Not submitted". Content is
   "complete" only when an expected page count is set and every page index has a verified scan; otherwise it is
   partial or metadata only.
6. **Out of scope**: digital file import (EPUB/PDF) is deferred to the next slice to keep this one reviewable (the
   UI says so), as are annotations, public routes, remote work and chain.

Decisions taken without the owner (least destructive, local only):
- The shelves keep their own ids. The manager uses library ids, and the two are linked only through
  `library_books.catalog_id` / scan client keys.
- The scanner still writes to the legacy store. The manager reads SQLite after the existing guest import.
- **No outbox rows** for book-manager edits or page intake. Nothing can send them, so queuing would imply sync that
  doesn't exist. A future sync derives its work from `sync_states` vs `metadata_revision` / `sha256`.
- **Removal is soft and keeps the bytes** (never destroys the only copy). Reclaiming storage is a later, explicit step.
- **`source='manual'`** for books added by hand: a TS enum value only, since the column is plain text, so no migration.

## What was built

- **Migration `0004_book_manager`** (additive): `book_assets` (content manifest), `sync_states` (acknowledgement
  contract, **never written** today), and 7 nullable/defaulted columns on `library_books` (subtitle, isbn, edition,
  publisher, expected_page_count, metadata_revision, catalog_match). Existing catalog rows get `catalog_match =
  'candidate'` (a bundled-catalog reference, never 'verified'). Nothing is dropped or rewritten.
- **Use cases** (`src/data/usecases/`): `bookStatus.ts` (pure; six independent dimensions), `bookManager.ts`
  (`listMyBooks`, `getBookOverview`, `readAssetBytes`), `bookMetadata.ts` (`updateBookMetadata`, `addManualBook`),
  `bookIntake.ts` (`addPageScan`: bytes → FileStore → re-read + sha256 → one transaction; a failed row with the reason;
  idempotent per (book, bytes); `removeAsset`).
- **Routes**: `/library` (the person's own books + add by hand) and `/library/$bookId` (the manager, by stable
  `library_books.id`). Links: Profile → Your library, All pages → Reading, and the shelf card's details → "Manage
  this book" when the active person has that book in SQLite.
- **Intake formats**: page images JPEG, PNG and WebP up to 15 MB, through the existing `pickImage()` (web file input
  / Capacitor gallery). EPUB/PDF import is deferred and the UI says so. There is no Fetch button; a note explains
  why.

## Results

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `node --test tests/*.test.mjs` | **315/315** (+11 book-manager: migration upgrade, offline/restart, completeness, failed+retry, integrity, unsupported/removal, validation, isolation, legacy/catalog, no outbox, remote rules) |
| `npx biome lint` | 32 errors / 76 warnings = baseline |
| `npm run build` | exit 0, 75 precache entries, no test hooks in `dist` |
| Chrome `test:book-manager` | **6/6** |
| Android emulator `android-book-manager` | **3/3** (airplane mode; native SQLite + Filesystem; survives `am force-stop`) |
| Android multi-db spike | 7/7 (see boooks-multi-db-plan.md) |
| Android regressions `android-scene-switch` / `android-book-routes` | 3/3, 5/5 |
| iOS / physical device | not run |




# Slice: local-only book files, page tools, safe storage cleanup (same branch, uncommitted, on top of the Book Manager)

## Baseline (before edits)

Book Manager slice complete and uncommitted on `0a58c2a`. Typecheck exit 0; `node --test tests/*.test.mjs` 315/315;
lint 32 errors / 76 warnings.

## Scope (smallest complete vertical slice)

Built: (1) EPUB/PDF import as `digital_file` assets, (2) page tools (full-size viewer, explicit numbering, reorder),
(5) explicit, confirmed storage cleanup. **Not started**, because each rewires scanner, reader or shelf code owned by
other slices: (3) scanner saving straight into the active profile's SQLite library, (4) reader opening by library
book id, (6) 3D shelves loading from the active profile's SQLite library.

## What was built

- **Migration `0005_digital_files`** (additive, nullable): `book_assets.rights_basis`, `book_assets.source_note`.
- `usecases/bookFiles.ts`: the format comes from the bytes. EPUB = OCF ZIP whose first entry is an uncompressed
  `mimetype` reading `application/epub+zip`, plus an EOCD record. PDF = `%PDF-` in the first 1 KB and `%%EOF` in the
  last 1 KB. Size 1 B to 20 MB. A rights basis is required (public_domain, open_license, purchased_drm_free,
  own_work, or other plus a description). The original bytes are stored unchanged, re-read and sha256-checked, then
  written in one transaction. Idempotent per (book, bytes); the rights first stated are never rewritten by a retry.
- `usecases/bookPages.ts`: `setPageNumber` (a conflict raises `PageConflictError`; an explicit `swap` trades
  numbers), `movePage` (swap with the neighbour, or separate a duplicate), `pageNumberIssues`. Each change bumps
  `metadataRevision`. Duplicate numbers also mark the book "needs attention".
- `usecases/storageCleanup.ts` + `repositories/blobRefs.ts`: plan (read-only), then a confirmed run. The run
  recomputes the plan inside the write queue and deletes only blobs that are in both plans. Candidates are only the
  active profile's removed assets. A blob is kept if any profile still has a live manifest row for it, or any `files`
  row that is not the file of a removed asset, or that a note or cover uses (deleted books included). A read error
  aborts with nothing deleted, and a failed delete is reported as failed. Intake re-checks its bytes inside its own
  commit (`ensureStoredInCommit`).
- UI on `/library/$bookId`: Import EPUB or PDF (`pickDocument`, the file input on web and in the WebView), rights
  form, file list, `PageViewer` dialog, `PageTools`, page-issues notice, and "Storage on this device".
- No outbox and no `sync_states` rows; sync still reads "Local only · sync not configured".

## Results

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `node --test tests/*.test.mjs` | **334/334** (+19 new: 6 files, 5 pages, 8 cleanup; 4 migration-list assertions extended to 0005) |
| `npx biome lint` | 32 errors / 76 warnings = baseline |
| `npm run build` | exit 0, 75 precache entries, no test hooks in `dist` |
| Chrome `test:book-files` (new) | **7/7** |
| Chrome book-manager / web-restart / routes / book-routes / shared-device | 6/6, 7/7, 11/11, 7/7, 8/8 |
| Android emulator `android-book-manager` (extended) | **4/4**: EPUB import + renumber survive force-stop, offline |
| Android `android-scene-switch` | 3/3 |
| Android `android-book-routes` | first run: reader dialog timeout (60 s); rerun 5/5 (pre-existing catalog-PDF gap logged by the test) |
| `npm run cap:sync` (final, no hooks) | exit 0; no test hooks in the Android assets |
| iOS / physical device | not run (no simctl/Xcode tooling here) |

Android needs JDK 21, but only Zulu 17 is registered. Gradle ran with `JAVA_HOME` set to the existing
`/private/tmp/boooks-jdk21/...` for that command only; no project file changed.

## Risks / open

- Items 3, 4 and 6 are not started. An imported EPUB/PDF is stored and verified but cannot be opened in the reader
  yet.
- The format checks do not prove that a file opens (DRM, damaged content).
- The 20 MB limit is a conservative guess for base64 over the Capacitor bridge. It was not measured on a
  low-memory device.
- The OS document picker on Android/iOS is not driven by a test. The Android test calls the same use case through
  the test hook.
- Cleanup never frees blobs that have no manifest row (e.g. bytes left by a failed note attachment). Non-use can only
  be proven through a removed manifest row.

