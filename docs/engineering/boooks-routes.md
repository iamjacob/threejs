# BOOOKS routes, navigation and transitions

Source of truth for links: `src/lib/routeRegistry.ts` (typed; live paths are checked against the generated
router tree, and `tests/route-registry.test.mjs` fails if a visible link points to a path the router does not have).
Branch `boooks/offline-shared-device`, on top of `0a58c2a`. Local only.

**Public base path: `/beta/`** (was `/threejs/`). It is set in `vite.config.ts` `base` and `src/worker.ts` `BASE_PATH`,
and the browser tests read it from `tests/browser/harness.mjs`. The Worker answers any old `/threejs…` URL with a
**301 to the same path under `/beta`**, so printed QR codes and shared links keep working. The native build is
unaffected (it is served from `/`).

## Live routes

| Path | File | Purpose | Layout / transition | Data | Offline |
|---|---|---|---|---|---|
| `/` | `routes/_shelves.tsx` (layout) + `_shelves/index.tsx` | Library: 3D shelves; book card + reader open as overlays | immersive / world | device (IndexedDB library, SQLite) | app shell precached |
| `/scan` | `_shelves/scan.tsx` | Existing scanner over the shelves (same mounted scene) | immersive / page | device | camera + crop offline; online lookup needs network |
| `/book/:bookId` | `_shelves/book.$bookId.tsx` | The existing book card over the shelves (same mounted scene) | immersive / page | device; scans owner-checked | catalog + this device's scans are local |
| `/read/:bookId` | `_shelves/read.$bookId.tsx` | The existing reader (Foliate dialog) over the shelves | immersive / page | device; scans owner-checked | scanned pages offline; reader files and catalog PDFs cached after first open |
| `/maps` | `routes/maps.tsx` | Maps game world, active profile's books in the tornado | immersive / world | profile (SQLite) | bundled offline map style |
| `/profile` | `routes/profile.tsx` | Active local person, visibility, account connection state ("not connected") | page | profile | fully local |
| `/more` | `routes/more.tsx` | "All pages": grouped live links + unlinked list of planned pages | page | none | fully local |
| `/notes` | `routes/notes.tsx` | Offline notes CRUD (unchanged) | page | profile | fully local |
| `/people` | `routes/people.tsx` | People on this device + same-device messages (unchanged) | page | profile | fully local |
| anything else | root `notFoundComponent` | "Page not found" + Library / All pages | page | none | precached |

`/play` was renamed to `/maps` with no alias (pre-launch; no external consumer found in source, docs, Capacitor
config, worker or tests). `/play` now shows not-found. The npm script names `test:map-play` / `test:android:play` are
script names, not routes, and are unchanged.

## Navigation

- **Primary** (mobile bottom bar / desktop header, `components/shell/AppShell.tsx`): Library · Scan · Maps · Profile.
  Scan is the visually prominent red item. **Discover is held back** (registry status `planned`) until a working
  catalog page exists, so it is not rendered at all rather than shown as a dead tab.
- **Shelves and Maps** stay immersive (no generic chrome). Their entry points: the joystick menu (`Open map` /
  `Shelves`; `Scenery` still cycles the 3D environment and is unrelated to Maps), and the shelves hamburger menu, which
  now has Maps / Profile / All pages.
- **GIGA footer** (desktop only, in AppShell) and **/more** (mobile) show the same groups from the registry:
  Explore (Library, Scan, Maps), Reading (Notes), Community (People & messages). Groups with no live page (Partners,
  About & support, Legal) are omitted; their pages appear only as an unlinked "Not available yet" list on /more.

## Deferred / intentionally absent

| Status | Paths | Why |
|---|---|---|
| planned | `/discover`, `/search`, `/collections`, `/messages` (separate route), `/profile/edit`, `/settings`, `/help` | No working page/data yet. |
| needs content | `/about`, `/mission`, `/how-it-works`, `/faq`, `/contact`, `/accessibility`, `/community-guidelines`, `/privacy`, `/terms`, `/for-libraries`, `/for-publishers`, `/developers` | Need approved copy. No legal terms, partner offers, contact operations or API claims were written. |
| absent | login / signup | No auth provider is configured. Profile says "Not connected". |
| absent | Books Blockchain / NGO | Not part of app navigation unless the product owner decides otherwise. |

## Transitions

| Class | Where | Behavior |
|---|---|---|
| World | `/` ⇄ `/maps` (`stores/sceneTransition.ts`, `components/layout/SceneTransition.tsx`) | Iris from the tapped control → navigate under cover → wait for `arrive` (shelves: `sceneBooted`; Maps: runtime ready + first MapLibre `idle` or the offline style). **Changed:** after 10 s it no longer reveals an unready scene; it becomes "slow" with *Keep waiting* / *Show anyway* (late arrival still reveals). A rejected navigate shows *Try again* / *Close*. A route that throws (e.g. the Maps chunk cannot be fetched) cancels the cover and shows the root error page with *Try again*. Browser Back/Forward during a transition cancels it at once. Re-entry while running is ignored. |
| Standard page | everything else | Plain route change; AppShell moves focus to the page `<h1>` when focus was lost. |
| Profile change | `/profile`, `/people`, `/notes`, `/maps` | Existing `profileSession` clear → persist → ready; pages render a neutral "Opening…" while no profile is set. |
| Reduced motion | global CSS | No iris, no scale: cover is instant, reveal is a 120 ms opacity fade. |

## Book and reader routes

`/book/:bookId` and `/read/:bookId` are children of the `_shelves` layout, like `/scan`, so the 3D scene stays mounted
while the URL changes. `components/library/useBookRouteSync.ts` keeps the URL and the scene's existing state machine
(`useTourStore`) in step; nothing in the card, the reader or the tour store was rewritten.

- **Ids** are the public BOOOKS catalog id (ISBN, or the title when there is none) or the id of a book scanned on this
  device. A repeated level-10 shelf copy (`shelf-loop-N:<id>`) redirects to the canonical id, so each book has one URL.
- **Direct link / refresh**: once the scene has booted and local books are hydrated, `/book/:id` opens the card and
  `/read/:id` opens the reader directly (the shake-to-resume path). It does not replay the decorative zoom.
- **Taps → URL**: card shown pushes `/book/:id`. *Read* (open in 3D, then into the reader) pushes `/read/:id`.
  *Close reader* and *Back to shelf* pop to the entry below when it exists, otherwise they replace. Choosing another
  book at the same depth replaces, so browsing doesn't fill history. In-flight scene states (`pull`, `return`, and
  the moment inside `enter()`) are never written to the URL.
- **Back/Forward**: Library ⇄ book ⇄ reader in both directions. Back from the reader returns to the open book.
- **Not found** (`BookRouteNotice`): an unknown id, a book removed from the shelf, or another person's scan all show
  the same "Book not found" message over the shelves with *Go to your Library*. It never reveals whether someone
  else's book exists. `/read/:id` for a book with nothing to read shows the card plus "Nothing to read yet". If
  storage is locked by another tab, scans say so, and catalog books still open. Refreshing keeps the same state.
- **Profile isolation** (`lib/bookAccess.ts`): catalog books open for everyone. A scan opens only for its owner. Legacy
  device scans belong to the persistent guest (the existing owner-approved rule), and an account owns the scans merged
  into its `library_books` (`listScanKeys`). This governs opening by URL only. *The shelves themselves still show
  every book on this device to whoever is using it* (pre-existing behavior; making the shelves per-profile is a
  separate decision).
- **Offline**: the app shell is precached. The reader iframe now loads Foliate rather than the app: the SPA
  navigation fallback had been serving `index.html` into `/reader/*`. The fix adds `navigateFallbackDenylist`, plus a
  `boooks-reader` StaleWhileRevalidate cache, so a book opened once also opens offline. Scanned pages come from
  IndexedDB.
- **Messages**: the sample-friends panel (`MessagesOverlay`, `MessagesSidebar`, `messagesData`) is removed. The
  joystick item is now "People & messages" and opens `/people`. Profile links to it.

## Checks

`node --test tests/route-registry.test.mjs tests/scene-transition.test.mjs tests/book-routes.test.mjs tests/data-library-books.test.mjs`
· `npm run build && npm run test:routes` (Chrome, 11) · `npm run test:book-routes` (Chrome) ·
`npm run test:android:book-routes` (emulator).
