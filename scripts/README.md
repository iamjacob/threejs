The optional cover-image generator requires a local installation of `sharp`,
which is not a direct project dependency. With it installed, run
`npm run images` after adding or changing catalog cover images.

The generator keeps every original and writes WebP variants to
`public/book-images/`, with their paths and dimensions in
`src/lib/bookImageVariants.json`: `low` (384 px, the size that packs all
covers into one 2048² atlas), `medium` (1024 px) and `detail` (1536 px).
Front covers keep a higher WebP quality than spines and back covers. Stale
files from earlier runs are deleted.

Shelves choose the small texture by default and upgrade to `detail`
(`medium` on low-tier devices, see `src/lib/renderQuality.ts`) from the
projected size on screen, including device pixel ratio; originals are only
used by the reader. Upgrades load in the background while the current texture
remains visible. File names include content hashes and use the existing image
cache headers. The header and book bar use small covers.

`npm run atlas` packs every small shelf cover into a single opaque RGB
`public/book-images/cover-atlas.webp` (smallest power-of-two square that fits,
2 px padding) and writes `src/lib/coverAtlas.json` with each source path's
pixel rectangle plus ready-to-use `offset`/`repeat` UV transforms. At runtime,
`src/lib/runtimeAtlas.ts` merges any device-local/scanned book covers with the
build-time catalog regions into a single unified `map` texture so instanced
shelves draw all books (catalog + local) from one texture bind. Rerun
`npm run atlas` after `npm run images`. Packing logic lives in
`src/lib/atlasPacking.ts` (`npm run test:atlas`).


Append `?controls` to the URL to show FPS, draw calls, triangles, and
texture counts in the top-left corner while optimising.
