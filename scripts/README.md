Run `npm run images` after adding or changing catalog cover images.

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
