# BOOOKS game engine: plan and first-slice contract

Branch `boooks/game-engine` (worktree `threejs-game-engine`), based on `boooks/data-foundation` @ `dd3ea26`.
Nothing pushed by this agent. Log: `agent-log-opus.md` § Game engine.

## Model roles

| Role | Scope |
|------|-------|
| Opus 5.5 (this branch) | Evidence, engine boundary, first playable slice, follow-up list |
| Qwen Coder 14B (4-bit) | Later: exactly one slice from § Follow-up slices at a time, after review |
| Reviewer | Reads the diff and runs the commands below; does not approve from summaries |

## Evidence: where the "old game" is

It is **not in this repo or its history**: `src/components/maps/` and `src/components/camera/` are empty, and
`git log --all -S maplibre` / `-S tornado` find nothing. The map/tornado code is in a **separate Expo app**,
`~/Desktop/Boooks/react-native-test/boooks/src/features/maps/` (53 files). **That folder is untracked in its repo**
(`?? src/features/maps/`), so there is no history; it is classified by imports only:

| Path (Expo app) | Class | Evidence |
|-----------------|-------|----------|
| `map-screen(.web).tsx`, `map-experience.web.tsx`, `book-vortex.web.tsx`, `maps-bridge.ts` | live | imported from `src/app/maps.tsx` |
| `legacy/story-maplibre.tsx`, `legacy/components/{LiveTornado,Tornadoes}.jsx`, `legacy/Tornado.tsx`, `legacy/ui/*` | legacy Next.js leftovers | `legacy/page.tsx` imports `../components/nav/Header` and `AuthDialog`, which don't exist |
| `legacy/Tornado new.tsx`, `legacy/1/*` | duplicate experiments | not imported |
| `legacy/components/multi.tsx` | dead | fully commented out |

Nothing was copied wholesale. Three pieces were ported by reading the source: the spiral formula (`core/tornadoShape.ts`),
the HOME point and camera view (`core/config.ts`), and the `polishMap` colors (`map/mapStyle.ts`).

## Behavior inventory

| Behavior | Source | This slice |
|----------|--------|------------|
| Book tornado spiral | `legacy/Tornado.tsx`, `book-vortex.web.tsx` | ported as one InstancedMesh, no network textures |
| GPS `LiveTornado` with random jitter | `LiveTornado.jsx`, `useLiveLocation.js` | not ported; GPS stays optional |
| Zoom→pitch camera | `PokemonGoCameraController.jsx` | follow-up |
| Hold-to-place reading pins | `map-experience.web.tsx`, `usePlacementStore.ts` | follow-up |
| City tornadoes from a list | `legacy/1/tornadoData.ts` | follow-up |
| Map style + HOME view | `map-experience.web.tsx` | ported |
| Controls | this repo's `BoooksController` joystick | reused unchanged |
| Merging, portals, digging, discoveries, rewards, timers, 21 animations | **not found anywhere** | new work (follow-ups) |

## Dependencies

Exact pins matching the Expo app: `maplibre-gl` 5.24.0, `react-map-gl` 8.1.2, `react-three-map` 1.0.1 (peers: R3F ≥ 8.13,
three ≥ 0.133, react ≥ 18, react-map-gl ≥ 8). There is still one copy each of react 19.2.8, three 0.185.1 and R3F 9.7.0;
no existing lockfile entry changed. I read react-three-map's scene mapping in its source (`coordsToMatrix`, `syncCamera`),
and a contract test pins it.

## Engine boundary

```
BoooksController joystick ─onJoystick→ GameLoop.dispatch({type:"steer"})         input → command
map.getBearing() ──────────────────────→ dispatch({type:"view"})                 screen-relative steering
requestAnimationFrame → MapPlayRuntime.frame → GameLoop fixed 1/60 s steps        simulation (pure TS)
GameLoop events (moving / paused / resumed / boundary) → useMapPlayStore          low-frequency UI only
TornadoPlayer useFrame reads runtime.renderPosition → geoToScene → group.position render, no React state
pause / background / route exit → saveMapCheckpoint → profile_settings            durable, existing DB queue
```

| State | Owner | Never |
|-------|-------|-------|
| Simulation (position, velocity, intent, ticks, pauses) | `src/game/core/*` (no React/three/MapLibre/SQLite imports) | React state or Zustand |
| Render (meshes, spin, camera follow) | `map/TornadoPlayer.tsx`, `MapPlayRuntime` camera hook, react-three-map | authoritative for gameplay |
| Durable (one map checkpoint per profile) | `src/game/checkpoint.ts` → `settingsRepository` | written per frame |

- **Coordinates:** only `core/geo.ts` converts lng/lat ↔ scene, using exact Web Mercator like MapLibre and
  react-three-map. It is tested against MapLibre's own `MercatorCoordinate` out to 190 km.
- **Lifecycle:** pause reasons are `user | background | loading`. Pausing clears steering and velocity; resuming
  starts a new time baseline (no catch-up); frame gaps over 0.25 s are dropped. There is one rAF driver per runtime,
  and dispose cancels it.
- **Persistence:** key `game.map.checkpoint` in `profile_settings`, which exists since migration 0000, so **no new
  migration**. Writes under 1 m of change are skipped; invalid or out-of-area values are ignored on load.
- **GPS** is never requested. **Offline:** the app shell comes from the service worker; if the remote style can't
  load, a bundled style is used.

## First-slice contract

On `/play`, dragging the controller moves one tornado over the map, and the camera follows. The tornado stays on its
lng/lat under pan, zoom, pitch and rotation. Pause and resume work, the position is restored after restart, play
works offline, and location is never requested.

**Allowed paths:** `src/game/**`, `src/routes/play.tsx`, `src/stores/useMapPlayStore.ts`, `src/routeTree.gen.ts` (generated),
`src/data/testing.ts` (test export), `tests/game-*.mjs`, `tests/browser/{map-play,mapPlayHelpers,android-map-play}.mjs`,
`package*.json`, `docs/engineering/**`. **Not edited:** scanner, reader, shelves, library scene, `BoooksController`,
`useLevelStore`, data-foundation code.

**Commands:** `npm run test:game` · `node --test tests/*.test.mjs` · `npm run build:test && npm run test:map-play` ·
`npm run test:android:play` (JDK 21 + emulator) · `npx tsc --noEmit` · `npx biome check src/game src/stores/useMapPlayStore.ts src/routes/play.tsx`.
After any `*:test` / `test:android:play` build, run `npm run build` / `npm run cap:sync` so no test hooks remain.

## Follow-up slices for Qwen (priority order, one at a time)

Each slice touches only `src/game/**` plus its tests unless stated otherwise, and keeps all `game-*` tests green.

1. **Library-backed tornado:** instances colored and sized from `useBookStore` (capped at 72). *Accept:* one instance per book up to the cap, with a headless test of the book → instance mapping.
2. **Zoom → pitch camera curve** (port `PokemonGoCameraController`). *Accept:* pitch follows the S-curve on zoom, the curve function is unit-tested, and zoom and pitch events don't trigger each other recursively.
3. **Optional GPS input:** an explicit "Use my location" action, using `getPosition()`, feeds commands; no location history is stored. *Accept:* geolocation is never called until that action is used, and a denied permission leaves joystick play unchanged.
4. **Reading places:** hold-to-place pins saved per profile through a use case (new table + migration). *Accept:* a pin survives restart, another profile can't see it, and the alignment probe passes under rotation.
5. **Discoveries:** static points that emit `discovered` once inside a radius and are saved per profile. *Accept:* entering and leaving repeatedly records exactly one discovery, tested headlessly.
6. **Static city tornadoes** (port `tornadoData.ts`) as non-player entities. *Accept:* each stays at its coordinates across views (probe), and far ones are culled.
7. **Tornado merging:** player and entity within N m merge and the player grows. *Accept:* each pair merges exactly once, including across pause/resume and remount.
8. **Portals:** paired points that teleport the player. *Accept:* one teleport per entry, no ping-pong, and the camera stays attached.
9. **Digging and rewards:** hold-to-dig at a discovery grants a reward in a transaction with an outbox row. *Accept:* retries grant once per site, and rewards survive restart.
10. **Tornado animations** (21 requested; none exist): an animation registry, one animation per slice. *Accept:* switching animations never changes simulation state or allocates per frame.
11. **Offline tiles for HOME** within OpenFreeMap's limits (≤ 3,000 tiles / 50 MB). *Accept:* streets around HOME render with the network off after one online visit.
