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
fullscreen, and an optional shake-to-resume switch. The Read click requests
browser fullscreen where supported; otherwise the reader fills the viewport.
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
