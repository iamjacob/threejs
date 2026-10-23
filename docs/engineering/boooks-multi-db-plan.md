# Per-person SQLite files + "Who's reading?" picker: spike and plan

Owner request: "Save on this device" gives each person their own `.db` file. On launch, a Netflix-style picker shows
the people saved on this device, plus *Continue as guest*. Owner decision: one file per saved person, plus a small
shared **device** database for the picker and same-device messages. Prove it on web and Android first, then build.

This reverses rule 6 of `boooks-port-plan.md` ("one database per install"). Nothing below is built until the
Android spike passes.

## Spike status

| Target | Command | Status |
|---|---|---|
| Web (real Chrome, persistent profile) | `npm run build:test && node tests/browser/multi-db-spike.mjs` | **8/8 answered, all safe** |
| Android emulator (API 36, native SQLite files) | test-hooks `cap:sync` + APK, then `node tests/browser/android-multi-db-spike.mjs` | **7/7 answered, all safe**: M1 reproduced natively; 4 separate `*SQLite.db` files on disk; intact after `am force-stop`; close/reopen; ~12 KB per small file; airplane-mode write kept |
| iOS / physical device | — | not run |

Spike code is disposable and only in test-hooks builds: `src/data/spike/multiDbSpike.ts`, loaded from
`__root.tsx` behind `VITE_BOOOKS_TEST_HOOKS`.

### Web results

| # | Question | Answer |
|---|---|---|
| M1 | The old pattern (a fresh `SQLiteConnection` per database): does opening a second database close the first? | **Yes, it closes it.** "No available connection for person-a". `checkConnectionsConsistency()` on a new connection object resets every open connection (the same logic is in `CapacitorSQLite.java`). |
| M2 | 4 files open at once through one shared connection: do rows stay in their own file? | yes `{device:1, a:2, b:1, c:1}` |
| M3 | Concurrent writes to different files: are all committed? | yes |
| M4 | After a clean restart, is each file restored from IndexedDB? | yes |
| M5 | Browser SIGKILL after a flushed write: does the row survive, with the other files intact? | yes |
| M6 | Can one file be closed while the others keep working, then reopened intact? | yes (this is the "switch person" path) |
| M7 | Storage cost of 10 extra small person files on web | ~131 KiB (coarse) |
| M8 | An offline write plus reload on one person's file | kept |

**One fix is already in the main code:** `capacitorDriver.ts` now shares one `SQLiteConnection` per page. Without it,
opening a second file would silently close the first (M1). With a single database the change has no effect on
current behavior, and all existing suites still pass.

## Proposed design (built only after the Android spike passes)

```
device.db  (one per install)   picker list, active person, consented "On this device" directory,
                               same-device conversations/members/messages, guest-import markers
person-<id>.db  (one per saved person)   that person's notes, files, library_books, profile_settings,
                                         outbox, Maps checkpoint
guest.db   (the persistent guest; "Continue as guest")
```

- **Picker** (`/who`): shown on launch and from *Switch person*. It reads only `device.db`, so nothing personal
  loads until someone picks a tile. Choosing a person closes the previous person's file (M6), clears memory (the
  existing `profileSession` clear → ready), and opens theirs.
- **"Save on this device"**: creates `person-<id>.db`, copies the guest's rows in with the existing idempotent,
  verified merge, and keeps `guest.db`. The deterministic ids of a retry find the same file. No sign-in: there is no
  auth provider, so the picker says "Saved on this device".
- **Messages** stay in `device.db`, because they connect two people. Membership checks are unchanged.
- **Migrations** run per file: device migrations on `device.db`, person migrations on each person file when it opens.
- **Upgrade from today's single `boooks` database**: a one-time, resumable split (device rows → `device.db`; each
  profile's rows → its file), verified row by row, with the original `boooks` database kept until verification
  passes.
- **Web**: one tab lock covers all files. Each file flushes separately (M5).
- **Privacy, stated in the UI**: separate files keep people apart in the app. It is **not** encryption. Anyone
  holding the device can read any file. A PIN would only hide the picker. Real protection needs SQLCipher and key
  management (a separate decision).

## Next step

1. Free disk space so the emulator can start, then run the Android spike (commands above).
2. If it passes, build in this order: device/person schema split + upgrade, then the picker, then "Save on this
   device", with Chrome and Android tests that no data flashes between people.
