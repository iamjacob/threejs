# BOOOKS Game Engine: Opus 5.5 Work Order

Follow this work order and the repository’s own `AGENTS.md` instructions. Do not assume a BOOOKS-specific skill is installed.

## Mission

Build the first game-engine layer on top of the committed BOOOKS offline-first data foundation. Preserve the existing Three.js, R3F, Drei, MapLibre, and scanner work where it is useful. This is a game-like map experience: input, simulation, world events, rendering, and durable progress need clear boundaries.

Do not attempt to port the whole old game in one pass. Map the existing behaviors, establish a small engine boundary, and implement one playable vertical slice.

## Model roles

- **Opus 5.5:** inspect the codebase, plan the engine boundary, implement the first vertical slice, and record follow-up slices.
- **Qwen Coder 14B, 4-bit:** later implements one specifically defined port slice at a time, after this work is reviewed.
- **Reviewer:** inspect the actual diff and run the checks; do not approve from the implementation summary alone.

Do not start other coding agents during this task.

## Start with evidence

1. Inspect `git status`, current branch, recent commits, repository instructions, package scripts, app entry points, tests, and the data-foundation plan and logs.
2. Find the old Three.js/game folders and classify source, generated files, experiments, assets, and dead code using imports, build config, and git history. Do not mass-copy, delete, or rewrite files because they look old.
3. Inventory the current game behaviors and their dependencies: controls, player/tornado movement, merging, portals, discoveries, effects, timers, map integration, and persistence.
4. Record baseline test/build results before editing.
5. Record the first-slice contract, allowed paths, model roles, test commands, and status in `docs/engineering/boooks-port-plan.md` and `docs/engineering/agent-log-opus.md`, or the repository’s established equivalents.

If the actual repository differs from the earlier report, update the plan from repository evidence before making changes.

## Engine boundaries

Keep three kinds of state distinct:

1. **Simulation state:** entities, movement, collision/proximity rules, timers, and game rules.
2. **Render state:** meshes, effects, camera interpolation, and scene objects, owned by the existing Three.js/R3F/MapLibre presentation.
3. **Durable product state:** intentional checkpoints, discoveries, progression, and user-created data, stored through the existing SQLite foundation.

Use this runtime flow:

`touch/controller input → game command → simulation update → game event → R3F/MapLibre render`

- Keep core simulation logic testable without WebGL, React, SQLite, or Capacitor.
- Keep high-frequency simulation and animation updates out of React renders, Zustand subscriptions, SQLite writes, and network sync.
- Use Zustand for low-frequency UI state and commands where appropriate; do not make it the authoritative 60-fps simulation.
- Persist only meaningful durable outcomes or explicit checkpoints. Never write movement every frame.
- Send durable writes through the existing application/use-case/repository/database-queue path. Do not create a second database path.
- Treat GPS as an optional input capability. The first playable slice must work without GPS, account creation, or network access.
- Verify the installed versions and APIs of R3F, Drei, MapLibre, and the existing react-three-map package before changing integration code. Keep one compatible React/Three dependency graph.
- Preserve map attribution, existing map style and camera behavior unless the task explicitly changes them.
- Centralize map/Three coordinate conversion. Test that world entities remain correctly positioned as the map pans, zooms, pitches, and rotates.
- Handle pause, route exit, backgrounding, and resume without runaway timers or duplicate events.

## First playable slice

Implement one controllable tornado/player that can move using the existing touch or controller input over the map.

Acceptance behavior:

- Input becomes an explicit game command and updates simulation state.
- The rendered entity follows the expected geographic/world position.
- Camera following and map pan/zoom/pitch/rotation do not detach or drift the entity.
- Simulation tests run headlessly and produce the expected outcome at normal and throttled frame rates.
- Pause/resume and route remount do not duplicate movement, timers, or events.
- The slice works offline and does not request GPS permission.
- If a durable checkpoint is needed for this behavior, save it only at an explicit pause/checkpoint through the existing profile-scoped repository. Restore it after restart. Add the smallest required migration only after checking the current schema and migration conventions.
- Verify the affected browser path and available Capacitor build. State clearly which native behavior was actually run on a device or emulator.

Do not add tornado merging, portals, digging, rewards, new animation menus, or all 21 extra animations in this slice. Record them as candidate follow-up slices with brief acceptance criteria.

## Engineering loop

For this slice:

1. Define the observable behavior and allowed edit paths.
2. Trace the existing input, map, rendering, lifecycle, and persistence paths.
3. Implement the smallest cohesive change.
4. Add meaningful headless tests for simulation behavior and lifecycle edge cases.
5. Run focused tests, relevant existing regression tests, typecheck, lint on changed files, and relevant browser/Capacitor builds.
6. Review the diff for unintentional scene changes, dead code removal, per-frame allocations, per-frame persistence, profile leakage, generated output, and accessibility regressions.
7. Log exact commands and pass/fail results. Record uncertainties instead of claiming unverified platform behavior.

Use small checkpoints or commits that can be reviewed and reverted. Do not push.

## Out of scope

- Rewriting the whole Three.js app or replacing its renderer.
- Copying the old game folder wholesale.
- Broad visual redesign or package upgrades unrelated to this slice.
- Moving every existing game behavior at once.
- Adding backend sync or pretending the client has remote multiplayer.
- Persisting frame-by-frame coordinates or sensitive GPS history.
- Changing scanner, reader, account/auth, or SQLite foundation behavior unrelated to this slice.

## Handoff

Finish with:

- The engine boundary and first-slice behavior implemented.
- Changed paths and checkpoint/commit references.
- Exact test and build results, including baseline failures.
- What was verified in browser, Android, and iOS; identify anything not run.
- Remaining risks and platform-specific limitations.
- A prioritized list of the next small game-port slices, each with one-sentence acceptance criteria, so Qwen can implement them one at a time.