# Slice: tornado from the active profile's books (with the book data model)

Branch `boooks/tornado-library-books` (local only, no upstream), from `boooks/game-engine` @ `c81c2f2`.
**Do not push:** an unexplained auto-push updated `origin/boooks/data-foundation` twice (see agent log).

## Why this slice adds a data model

Inspection found **no book model in SQLite**. Books came from three places, none profile-aware:
`public/books.json` (22 catalog books, covers under `/blockchain/…`), IndexedDB `boooks-scans` (scanned books with
covers embedded as data URLs), and in-memory `useBookStore`. The owner approved Option 1: the smallest SQLite book
model plus a profile-scoped repository, then the tornado.

## Ownership decisions (owner-approved)

| Data | Owner | Stored |
|------|-------|--------|
| `books.json` catalog | **shared**, every profile can see it | stays in the bundle; **not** copied into SQLite per profile |
| A profile's library | that profile | `library_books` row per (profile, book) |
| Scanned books | **personal** | `library_books` row with scan metadata + cover `files` rows |
| Legacy device-wide scans | **the persistent guest profile** (created before account linking) | imported once; never assigned to a signed-in account |
| `/maps` tornado (was `/play`) | shows only the **active profile's library**, never the whole catalog | — |

Adding a catalog book is an explicit action that creates one `library_books` row with `source='catalog'` and
`catalog_id`. It is **not** marked as read.

## Schema (migration `0002_library_books`)

One table. It follows the `notes` conventions (text id, `profile_id` FK, `client_key` natural key, soft delete,
timestamps):

```
library_books(
  id text pk, profile_id text not null → profiles.id,
  client_key text not null,              -- 'catalog:<catalogId>' or 'scan:<legacyScanId>'; unique per profile
  source text not null ('catalog'|'scan'),
  catalog_id text null,                  -- set when source='catalog'
  title text not null, author text not null default '',
  width_cm real, height_cm real, thickness_cm real,   -- physical size, null if unknown
  color text null,                       -- fallback tint, '#rrggbb'
  cover_front_file_id, cover_back_file_id, cover_spine_file_id text null → files.id (same profile)
  added_at integer not null, deleted_at integer null, created_at, updated_at integer not null
)
unique(profile_id, client_key); index(profile_id, deleted_at, added_at)
```

- **Catalog data stays separate:** catalog books are referenced by `catalog_id`, and their covers still come from the
  bundled `/blockchain/…` paths and the prebuilt atlas. Only personal scan covers become `files` rows (bytes in the
  FileStore, sha256 `blob_key`).
- **No `profile_settings` use** for books.

## Legacy scan import (`importLegacyScans`)

- **Target:** the guest profile only. It runs when the active profile is a guest (not merged). If the active profile
  is an account, the import is skipped and reported.
- **Idempotent:** `client_key = 'scan:<id>'` is unique per profile, and blobs are content-addressed, so a re-run
  inserts nothing new.
- **Recoverable:** each scan is imported as bytes → FileStore (idempotent), then one SQLite transaction for the file
  rows and the book row. A crash between scans leaves completed scans done; the next run continues.
- **Verified before release:** after import, each row and its cover files are read back (bytes present, sha256
  matches). Only then is the legacy record marked imported, in a **separate** IndexedDB database `boooks-scans-import`.
  *Revised during implementation:* the scanner opens `boooks-scans` with `indexedDB.open(name, 1)`, so bumping that
  database to version 2 would make the scanner fail with `VersionError`. The original `books` records are **kept**;
  deleting them is a later, separate cleanup.
- **The scanner still writes new scans only to IndexedDB** (`scannedBook.ts` is out of scope). New scans are picked up
  by the same import the next time `/maps` loads, as long as the active profile is the guest. Scans made while an
  account is active are not imported yet (reported as `skipped_not_guest`); routing new scans to the active profile is
  a follow-up.
- **Never silent:** scans with no or invalid front image, or undecodable data URLs, are reported as `failed` with a
  reason, and their IndexedDB record is untouched.

## Guest → account merge

`copyRows` is extended to copy `library_books` like notes: deterministic ids, file ids remapped to the copied file
rows, `ON CONFLICT DO NOTHING`. If the target already has the same `client_key` (for example both added the same
catalog book), **the target wins** and the guest row id is reported in `skippedConflicts`; verification covers the
book rows. Existing note behavior is unchanged.

## Tornado presentation

- Layout: the existing spiral (`core/tornadoShape.ts`, verified against the legacy `book-vortex.web.tsx`: radius·(1−t^1.2),
  16π turns, height·(1−t), scale 0.72 + 0.24·(1−t)). Each book's slot is **stable**: books are sorted by
  `(added_at, id)`, so adding a book appends at the top and existing books keep their positions across renders and
  restarts.
- Rendering: one InstancedMesh, capped at 72 visible (the oldest 72; the rest are counted in the HUD). Covers come from
  the existing `coverAtlas` for catalog books. Scan covers are loaded once from the FileStore into a small runtime
  canvas atlas when the library loads, never in the frame loop.
- Fallback: a missing or unreadable cover gets a deterministic palette color from title and author (as in the legacy
  `book-box.web.jsx` `paletteFor`), with no network fetch.
- Data flow: `bootstrapData` → `listLibraryBooks(ctx, activeProfileId)` → a pure `tornadoBooks()` mapping →
  `TornadoPlayer` props. It reloads on profile switch, and stale results are dropped by a request token.

## Allowed paths

`src/data/schema.ts`, `drizzle/0002_*`, `drizzle/meta/*`, `src/data/db/migrations.gen.ts`,
`src/data/repositories/libraryBooks.ts`, `src/data/usecases/{libraryBooks,legacyScanImport,mergeRows}.ts`,
`src/data/testing.ts`, `src/game/**`, `src/stores/useMapPlayStore.ts`, `tests/data-*.mjs`, `tests/game-*.mjs`,
`tests/browser/*`, `docs/engineering/**`. **Not edited:** scanner UI, `scannedBook.ts` (read-only use of its record
shape), shelves, library scene, `useBookStore`.
