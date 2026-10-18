The optional cover-image generator requires a local installation of `sharp`,
which is not a direct project dependency. With it installed, run
`npm run images` after adding or changing catalog cover images.

The generator keeps every original and writes WebP variants to
`public/book-images/`, with their paths and dimensions in
`src/lib/bookImageVariants.json`. Small shelf covers use about 10% of the
original dimensions (at least 256 pixels tall/wide); images already under
512 pixels stay unchanged. Close views use a maximum of 1536 pixels.

Shelves choose small, detail, or original textures from the projected size
on screen, including device pixel ratio. Upgrades load in the background
while the current texture remains visible. File names include content hashes
and use the existing image cache headers. Open books use the detail versions;
the header and book bar use small covers.

`npm run atlas` packs every small shelf cover into a single
`public/book-images/cover-atlas.webp` (smallest power-of-two square that fits,
2 px padding) and writes `src/lib/coverAtlas.json` with each source path's
pixel rectangle plus ready-to-use `offset`/`repeat` UV transforms. The atlas
lets instanced shelves draw all books with one texture bind. Rerun it after
`npm run images`. Packing logic lives in `src/lib/atlasPacking.ts`
(`npm run test:atlas`).

Append `?controls` to the URL to show FPS, draw calls, triangles, and
texture counts in the top-left corner while optimising.
