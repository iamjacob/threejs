import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
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
let originalBytes = 0, lowBytes = 0, detailBytes = 0
for (const source of [...sources].sort()) {
    const input = new URL(`public${source}`, root)
    const buffer = await readFile(input)
    const metadata = await sharp(buffer).metadata()
    const { width, height } = metadata
    const longest = Math.max(width, height)
    const original = { path: source, width, height, bytes: buffer.length }
    const entry = { original }
    for (const [level, maxSize, quality] of [
        ['low', longest <= 512 ? longest : Math.max(256, Math.round(longest * 0.1)), 78],
        ['detail', 1536, 86],
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
    detailBytes += entry.detail.bytes
}
await writeFile(new URL('src/lib/bookImageVariants.json', root), `${JSON.stringify(variants, null, 2)}\n`)
console.log(`${sources.size} textures: originals ${(originalBytes / 1e6).toFixed(2)} MB; shelf ${(lowBytes / 1e6).toFixed(2)} MB; detail ${(detailBytes / 1e6).toFixed(2)} MB`)
