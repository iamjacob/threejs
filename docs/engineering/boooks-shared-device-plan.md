# Slice: several people on one device, offline (local profiles, consented directory, local messages)

Branch `boooks/offline-shared-device` (local only, **not pushed**), from `boooks/tornado-library-books` @ `f56bf20`.

## Prerequisite gate (checked before any code)

| Requirement | Evidence at `f56bf20` |
|---|---|
| Shared catalog is separate; adding a book is explicit | `addCatalogBook`; test "catalog books: explicit add only… not copied to new profiles" |
| Personal books scoped by `profile_id` | `library_books.profile_id` FK, `libraryBookRepository` filters, isolation test |
| Legacy import → guest is idempotent and keeps originals until verified | `importLegacyScans` + 5 tests in `data-legacy-scans` |
| Covers in the FileStore, metadata in SQLite | `files` rows (sha256 `blob_key`) |
| Migration, use cases and tests pass | `test:data` 42/42, `test:game` 37/37, `tsc` exit 0 |

**Not verifiable from the repo:** that a human reviewed `644f283`. This branch sits on top of it, so it can be reviewed separately.

## Product decisions in this slice (please confirm)

1. **New people are `kind: 'local'`**, not `guest`. Only the first-launch guest receives legacy device-wide scans and
   can be promoted, so a second person never takes over the first person's scans. `kind` is a TS enum on a `text`
   column, so this needed no SQL change.
2. **Visibility defaults to off** for every existing and new profile. Opting in stores **only** a chosen public name
   in `device_directory`. The private `display_name` is never returned by directory lookups. Avatars are not included
   yet.
3. **Opening a conversation requires both sides to be opted in.** Each side then only sees the name the other chose.
4. **Opting out** deletes the `device_directory` row only. It removes the person from future lookups and new
   conversations. **Existing conversations stay readable by their members.** Whether opting out should also hide
   existing conversations is an open policy decision.
5. Conversations are 1:1, with a deterministic id `local-dm:<a>|<b>` (sorted). There are no groups, no deletion and
   no "leave" yet.
6. **No PIN or lock per profile.** Anyone holding the device can switch to any profile. This is an organization and
   privacy boundary inside the app, not security, and the UI says so.

## Schema (migration `0003_shared_device`, add-only, no cascades)

```
device_directory(profile_id pk → profiles, public_name, created_at, updated_at)
conversations(id pk, scope 'local', created_by_profile_id → profiles, created_at, updated_at)
conversation_members(conversation_id → conversations, profile_id → profiles, public_name, joined_at; pk(conv, profile))
messages(id pk, conversation_id → conversations, author_profile_id → profiles, client_key, body,
         scope 'local', status 'saved', created_at;
         unique(author_profile_id, client_key); index(conversation_id, created_at, id))
```

- `scope`/`status` are closed enums with one value each (`local`/`saved`), so no code path can claim "sent",
  "delivered" or "read". Remote messages would need a new scope and a new status set.
- **Local messages never touch the outbox** (tested). The sync boundary cannot upload them.
- All foreign keys are `ON DELETE no action`. Nothing cascades into books or files.

## Session and UI

- `src/stores/profileSession.ts`: one switch path for all stores. It emits `clear` synchronously, then persists the
  switch, then emits `ready`. A `generation` counter lets loaders drop stale results. If a switch fails, it reopens the
  profile that is actually active in SQLite.
- `useNotesStore` and `usePeopleStore` subscribe to it. `/play` loaders now read the active profile from SQLite
  (`resolveActiveProfile`) instead of the `boot.profile` value cached at page load. Before this change, a checkpoint
  could be loaded or saved under the previous person after a switch on another route.
- `/people` route: who is using the device, add a person, the visibility toggle, the "On this device" directory,
  conversations, a thread and a composer. "Saved on this device" appears only after the durable write resolves.

## Not in scope / not claimed

There is no remote account search, cross-device delivery, delivered/read receipts, encryption, profile lock/PIN,
profile deletion or Supabase/Hono work. No backend config exists in the repo (searched: no supabase/hono references).
