Hi, I’m Jacob from Denmark, founder of Boooks. Thanks for checking it out! 

Boooks is an experimental 3D reading platform powered by React Three Fiber and Three.js. 

My goal is to make digital book collections feel personal and alive through interactive 3D covers, 
pages, and shelves. This playground features early components of the experience. Want to contribute? 

Get your code into the Boooks app today—we are heading into school system testing in early 2027!

iam@jacobg.me

The initial library comes from `public/books.json`, seeded from the existing catalog. The shelf and bottom helix share the same Zustand library, including scanned books restored from this browser's IndexedDB. `public/blockchain/data.json` remains available at its legacy URL; edit `books.json` for the app's catalog.

The footer helix is hidden by default. Set `VITE_SHOW_HELIX_NAV=true` to enable it. Drag or scroll the helix to choose a book; arrow keys, Home/End and Enter also work. Pinch or use +/− to change spacing. Book details appear at the top, with Open, Read and Back on the right. Long press a shelf book or use More → Edit on shelf to arrange it.

Run `npm run test:helix` and `npm run test:browsing` to check navigation and scene transitions.
