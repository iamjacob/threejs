# Book scanning

The app opens with `BookScanner`. “Scan a book” opens the app consent screen;
“Yes, allow camera” is the only action that calls `getUserMedia`. The browser then
requests its own permission if it has not already been granted. Nothing requests
camera access on mount. Microphone access is never requested. Cancel, capture,
unmount, or hiding the page stops all tracks, including a late permission grant.
Camera capture requires HTTPS or localhost; choosing a photo works without it.

The four-corner homography is adapted from the supplied offline perspective
cropper. It corrects perspective on the GPU, limits cover textures to 2048 pixels,
and releases its temporary WebGL context. Front cover is required; spine and back
are optional. Download exports the currently previewed face. There is no OCR or
automatic book identification: the user captures a cover and enters its title.

Adding a book saves its cover data in local IndexedDB, appends the book to
`useBookStore`, inserts a shelf slot through `useShelfControlsStore`, and starts
`useTourStore.addScannedBook`. The existing particle renderer samples the new
cover's texture and resolves into the same scaled shelf pose. Completion returns
to a paused, interactive library. If local storage is unavailable, adding still
works for the current visit and the UI explains that it was not saved.
The crop and photographs are never uploaded. Shelf arrangement history remains
session-only, as in the existing editor.

The top-right menu → Settings → Features controls the demo UI, DNA navigation,
and tour captions immediately. Gold plates and picture frames are always available
under Menu → Shop. Choices are saved in this browser.
Restore defaults clears those choices back to the build's defaults:
`VITE_SHOW_DEMO_UI` and `VITE_SHOW_HELIX_NAV` default to
false, and tour captions start hidden. Restart or rebuild after changing the
environment defaults. Scanning and long-press editing remain available with the
demo UI hidden. Sign in is currently a placeholder; the language selector changes
the navigation labels and remembers its choice.

Validation: `npm run test:scanner`, `npm run test:shelf`, `npm run test:paths`,
`npx tsc --noEmit`, and `npm run build`. Device QA should cover permission denied,
permission canceled while pending, capture/retake, four-corner drag and rotation,
optional face scans, adding two different covers, reload, and long-press editing.
