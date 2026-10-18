import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = new URL('../', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('public/books.json', root)))
const sources = new Set(catalog.flatMap(book =>
    (book.coverImage ?? []).flatMap(cover => Object.values(cover))))
sources.add('/experience/books/assets/booktexture.webp')
sources.add('/experience/books/assets/booktextureSide.webp')
await mkdir(new URL('public/book-images/', root), { recursive: true })
const variants = {}
let originalBytes = 0, lowBytes = 0, mediumBytes = 0, detailBytes = 0
// Shelf covers: 384 px on the longest side packs 53 covers into a 2048² atlas
// at ~86% (416 px already overflows into a 4096² atlas at 25%). Spines and
// back covers carry print noise that a lower quality hides without visible loss.
const LOW_SIZE = 384
const MEDIUM_SIZE = 1024
const DETAIL_SIZE = 1536
for (const source of [...sources].sort()) {
    const input = new URL(`public${source}`, root)
    const buffer = await readFile(input)
    const metadata = await sharp(buffer).metadata()
    const { width, height } = metadata
    const longest = Math.max(width, height)
    const original = { path: source, width, height, bytes: buffer.length }
    const entry = { original }
    const frontCover = /\.front\.|\/front\./.test(source)
    for (const [level, maxSize, quality] of [
        ['low', LOW_SIZE, 78],
        ['medium', MEDIUM_SIZE, frontCover ? 82 : 78],
        ['detail', DETAIL_SIZE, frontCover ? 86 : 80],
    ]) {
        if (longest <= maxSize) { entry[level] = original; continue }
        const hash = createHash('sha256').update(source).update(buffer)
            .update(`${maxSize}:${quality}:v1`).digest('hex').slice(0, 16)
        const path = `/book-images/${hash}-${level}.webp`
        const output = new URL(`public${path}`, root)
        const image = sharp(buffer).rotate().resize({
            width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true,
        }).webp({ quality, effort: 5 })
        const result = await image.toFile(fileURLToPath(output))
        entry[level] = { path, width: result.width, height: result.height, bytes: (await stat(output)).size }
    }
    variants[source] = entry
    originalBytes += original.bytes
    lowBytes += entry.low.bytes
    mediumBytes += entry.medium.bytes
    detailBytes += entry.detail.bytes
}
await writeFile(new URL('src/lib/bookImageVariants.json', root), `${JSON.stringify(variants, null, 2)}\n`)
// Drop variants from earlier runs so the published folder only holds live files.
const live = new Set(Object.values(variants).flatMap(entry =>
    Object.values(entry).map(variant => variant.path.split('/').at(-1))))
live.add('cover-atlas.webp')
for (const name of await readdir(new URL('public/book-images/', root))) {
    if (!live.has(name)) await rm(new URL(`public/book-images/${name}`, root))
}
console.log(`${sources.size} textures: originals ${(originalBytes / 1e6).toFixed(2)} MB; shelf ${(lowBytes / 1e6).toFixed(2)} MB; medium ${(mediumBytes / 1e6).toFixed(2)} MB; detail ${(detailBytes / 1e6).toFixed(2)} MB`)
