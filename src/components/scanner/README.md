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

`VITE_SHOW_DEMO_UI` defaults to false. Set it to `true` in the Vite environment to
restore the header, scene bar, bottom tour controls, desktop devtools and automatic
demo progression. Restart the dev server or rebuild after changing it. The scan
actions and long-press book editor remain available with the demo UI hidden.

Validation: `npm run test:scanner`, `npm run test:shelf`, `npm run test:paths`,
`npx tsc --noEmit`, and `npm run build`. Device QA should cover permission denied,
permission canceled while pending, capture/retake, four-corner drag and rotation,
optional face scans, adding two different covers, reload, and long-press editing.
