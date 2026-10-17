# Book scanning

Pressing the front-page camera button, logo, or Menu → Add a book mounts
`BookScanner` and immediately starts the camera request. The browser asks for
permission when needed; there is no additional welcome or app consent screen.
Permission errors keep the portal open with Retry and Choose a photo options.
Microphone access is never requested. Cancel, capture, unmount, or hiding the
page stops all tracks, including a late permission grant. Retake and capturing
an additional cover face restart the camera directly. Camera capture requires
HTTPS or localhost; choosing a photo works without it.

The scanner model dropdown offers **Scanner 1 · Manual crop** (the original
flow) and **Scanner 2 · Auto corners**, and remembers the selection locally.
Scanner 2 detects the four corners after capture, upload, rotation, or switching
to it on the crop screen. It uses local edge and Hough line detection on a copy
limited to 512 pixels in a disposable web worker, then maps the points back to
the original photo for the existing perspective crop. No model download or
remote service is required. This is a geometric detector, not book recognition;
clutter or weak contrast may need manual correction. Dots remain draggable,
Reset and Full image remain available, and Detect corners again retries.
If no supported outline is found, manual placement remains available. Manual
edits, model changes, retakes, replacement photos, and closing cancel pending
detection so a late result cannot overwrite an adjusted crop.

Camera, cropper, and review are transparent overlays above the paused shelf,
without a full-screen dimmer or backdrop blur. Crop shading is limited to the
photo itself. The flashlight button controls the existing track's `torch`
capability when available; unsupported cameras show a disabled button. Closing,
capturing, hiding the tab, or changing cameras releases the light along with the
camera session, including an in-flight flashlight request.

The camera preview uses a red ribbon portal adapted
from [BOOOKS Portal Scanner](https://boooks-portal-scanner.insidyou.chatgpt.site).
Its gradient matches the logo (#7C1414 → #E22424). The preview reuses the scanner's video stream; original camera images still feed
the cropper. The portal renderer limits resolution and frame rate, stops while
hidden, and releases its resources on exit. A rounded CSS/video portal is used
when WebGL is unavailable or loses its context. Reduced motion freezes the
ribbons while keeping the live camera preview running.

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


The camera roll accepts multiple images and keeps one editable draft per book in the local `boooks-scan-drafts` IndexedDB database. New book retains earlier drafts in the history strip. Each photo retains its source, tag, crop and corner coordinates. Tags include covers, spine, pages, dust jacket, index, copyright, contents and other. Interior photos are attached in roll order when adding/updating the shelf book and can be read in both 3D and Foliate. Re-adding a draft updates its existing book ID. Storage failures are shown in the scanner.

## AI metadata API (frontend contract, backend pending)

After the front cover is cropped, the scanner waits 600 ms and POSTs to
`https://ai.boooks.app/v1/scans/metadata`. Changing crops or books cancels the
previous request; requests time out after 20 seconds. Retry is manual.
Only the cropped cover is sent, resized without upscaling to a maximum 768 px
on its longest side, JPEG quality 0.72. No full-resolution photo or credentials
are sent. The image is raw base64, without the data-URL prefix.

Request (`Content-Type: application/json`):
```json
{
  "version": 1,
  "scanId": "scan-uuid",
  "part": "front",
  "image": { "mimeType": "image/jpeg", "base64": "...", "width": 512, "height": 768 },
  "fields": ["title", "subtitle", "author"]
}
```

Successful response (`200`, `Content-Type: application/json`):
```json
{
  "metadata": {
    "title": "The Book Title",
    "subtitle": "An optional subtitle",
    "author": "First Author, Second Author"
  }
}
```
Return all three keys, using `null` for unreadable or absent fields. Extra keys
are allowed for future extensions. Non-2xx responses show a nonblocking retry
message. The frontend validates strings and caps each at 300 characters.
Suggestions require “Use suggestions”; manual fields remain editable and are
saved with scan history and the resulting library book.

The future backend must support CORS preflight (`OPTIONS`) and `POST` from the
frontend's deployment origin and localhost:3000 during development, allowing
`Content-Type`. No client API secret is required or embedded. This change only
implements the frontend; the service has not been deployed or verified.

Run contract tests: `node --test tests/scan-metadata.test.mjs`.
