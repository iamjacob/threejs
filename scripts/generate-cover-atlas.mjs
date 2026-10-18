// Packs every "low" shelf cover variant into one WebP atlas so instanced
// shelves can draw all books with a single texture bind. Run `npm run images`
// first; this script consumes src/lib/bookImageVariants.json.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { atlasUvTransform, packAtlas } from '../src/lib/atlasPacking.ts'

const root = new URL('../', import.meta.url)
const variants = JSON.parse(await readFile(new URL('src/lib/bookImageVariants.json', root)))
const inputs = Object.entries(variants).map(([source, { low }]) => ({
    id: source, width: low.width, height: low.height, path: low.path,
}))
const { size, regions } = packAtlas(inputs, { padding: 2, maxSize: 4096 })
const composites = []
for (const region of regions) {
    const { path } = inputs.find(input => input.id === region.id)
    composites.push({
        input: await sharp(fileURLToPath(new URL(`public${path}`, root))).rotate().ensureAlpha().toBuffer(),
        left: region.x, top: region.y,
    })
}
await mkdir(new URL('public/book-images/', root), { recursive: true })
const output = new URL('public/book-images/cover-atlas.webp', root)
await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites).webp({ quality: 82, effort: 5 }).toFile(fileURLToPath(output))
const manifest = {
    path: '/book-images/cover-atlas.webp', size,
    regions: Object.fromEntries(regions.map(region => [region.id, {
        x: region.x, y: region.y, width: region.width, height: region.height,
        ...atlasUvTransform(region, size),
    }])),
}
await writeFile(new URL('src/lib/coverAtlas.json', root), `${JSON.stringify(manifest, null, 2)}\n`)
const used = regions.reduce((sum, { width, height }) => sum + width * height, 0)
console.log(`${regions.length} covers -> ${size}x${size} atlas, ${(used / (size * size) * 100).toFixed(0)}% filled, ${((await stat(output)).size / 1e3).toFixed(0)} kB`)
