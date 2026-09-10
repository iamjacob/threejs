The overlay uses [Foliate JS](https://github.com/johnfactotum/foliate-js), pinned to
commit `78914aef4466eb960965702401634c2cb348e9b1`. Runtime modules and upstream
vendored dependencies live in `foliate/`, with the upstream MIT license.
PDF.js is Apache-2.0, zip.js is BSD-3-Clause, and fflate is MIT; their notices
are retained in the vendored files.

The reader is loaded only when Read is pressed. Its own document applies a
Content Security Policy that blocks inline book scripts and remote resources.
EPUB/PDF files selected in the reader stay in the browser.

`continuous-book.js` renders Foliate's book sections in one vertical scroll.
It mounts nearby sections and releases distant frames while retaining their
height, so long PDFs and EPUBs do not keep every page rendered in memory.

Catalog entries with an `epub` or `pdf` path open directly. Covers without a reading file
show the local file chooser. All public URLs respect the app's deployment base.
