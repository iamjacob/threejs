The overlay uses [Foliate JS](https://github.com/johnfactotum/foliate-js), pinned to
commit `78914aef4466eb960965702401634c2cb348e9b1`. Runtime modules and upstream
vendored dependencies live in `foliate/`, with the upstream MIT license.
PDF.js is Apache-2.0, zip.js is BSD-3-Clause, and fflate is MIT; their notices
are retained in the vendored files.

The reader is loaded when Read is pressed or shake-to-resume is enabled and triggered. Its own document applies a
Content Security Policy that blocks inline book scripts and remote resources.
EPUB/PDF files selected in the reader stay in the browser.

`continuous-book.js` renders Foliate's book sections in one vertical scroll.
It mounts nearby sections and releases distant frames while retaining their
height, so long PDFs and EPUBs do not keep every page rendered in memory.

The Settings icon contains EPUB text size, PDF/fixed-layout page zoom, dark mode,
fullscreen, and an optional shake-to-resume switch. The cinematic Read transition
opens a viewport-filling reader. Settings requests browser fullscreen on the
content surface inside its modal, including the iframe, ribbon and Close button.
Fullscreening the library document instead can promote its background above
the reader in the browser's top layer.
Leaving fullscreen keeps Foliate open; closing the reader exits only fullscreen
owned by that reader.
Shake gestures cannot grant browser fullscreen activation, so Settings offers
a fullscreen button. Motion permission is requested only when enabling the
switch on browsers that require it.

Settings and per-file chapter/page positions are saved in localStorage.
Locally selected files are kept in IndexedDB on this device for reopening.
Shaking resumes the last successfully opened book and its saved position;
three distinct jolts and a cooldown avoid triggering from normal tilts.
Storage or sensor access failures leave the regular Read controls available.

Catalog entries with an `epub` or `pdf` path open directly. Covers without a reading file
show the local file chooser. All public URLs respect the app's deployment base.

Local extension in `foliate/pdf.js`: `makePDF` also accepts a URL. Catalog PDFs
use PDF.js's streaming/range loading instead of `makeBook`'s full-response Blob
download, which failed for the 13.9 MB Fangekoret PDF in Chrome. Uploaded files
still use Foliate's original File/range-transport path.


Reading from the shelf opens the book in 3D first. A second Read click (or double click on the open model) moves the camera into Foliate. Browser fullscreen is available in Foliate Settings; its target contains both the reader and its close/bookmark controls.

The parent stores each book's section/page index and within-section fraction in `boooks-reading:<bookId>`. The iframe reports scroll positions through same-origin, source-checked messages. PDF and camera-roll pages have exact page indices; reflowable EPUB positions use the section index plus its scroll fraction. The red ribbon saves a separate bookmark and can return to it from either view. Scanned interior pages are read from the local scanned-book database.
