import { makeBook } from './foliate/view.js'
import { ContinuousBook } from './continuous-book.js'

const params = new URLSearchParams(location.search)
const get = id => document.getElementById(id)
let source = params.get('url')
let opening = false
let reader

const keyboard = event => {
    if (event.key === 'Escape') {
        event.preventDefault()
        parent.postMessage({ type: 'close-reader' }, location.origin)
    }
    if (event.target.closest?.('input, select, textarea')) return
    const distance = { ArrowDown: 80, ArrowUp: -80, PageDown: innerHeight * .85, PageUp: -innerHeight * .85, ' ': innerHeight * .85 }[event.key]
    if (distance) {
        event.preventDefault()
        get('pages').scrollBy({ top: event.shiftKey && event.key === ' ' ? -distance : distance })
    }
}
document.addEventListener('keydown', keyboard)

function showError() {
    get('notice').hidden = false
    get('message').textContent = 'This file could not be opened.'
    get('hint').hidden = false
    get('choose').hidden = false
    get('retry').hidden = !source
}

async function open(file) {
    if (opening) return
    opening = true
    source = file
    get('notice').hidden = false
    get('message').textContent = 'Opening book…'
    for (const id of ['cover', 'hint', 'choose', 'retry', 'sample']) get(id).hidden = true
    try {
        await reader?.destroy()
        // Let PDF.js stream/range-load remote PDFs instead of first buffering
        // the entire response into a Blob (large PDFs can fail in that path).
        const book = typeof file === 'string' && new URL(file).pathname.toLowerCase().endsWith('.pdf')
            ? await (await import('./foliate/pdf.js')).makePDF(file)
            : await makeBook(file)
        reader = new ContinuousBook(get('pages'), book, (doc, index) => {
            doc.addEventListener('keydown', keyboard)
            doc.addEventListener('click', event => {
                const link = event.target.closest?.('a[href]')
                if (!link) return
                const href = book.sections[index].resolveHref?.(link.getAttribute('href')) ?? link.getAttribute('href')
                event.preventDefault()
                if (!book.isExternal?.(href)) reader.goTo(href).catch(() => {})
            })
        })
        await reader.open()
        get('notice').hidden = true
        get('pages').focus({ preventScroll: true })
    } catch {
        showError()
    } finally {
        opening = false
    }
}

get('retry').addEventListener('click', () => open(source))
get('sample').addEventListener('click', () => open(new URL('../boooks-about.pdf', location.href).href))
get('choose').addEventListener('click', () => get('book-file').click())
get('book-file').addEventListener('change', event => {
    const file = event.target.files[0]
    if (file) open(file)
    event.target.value = ''
})
window.addEventListener('pagehide', () => { reader?.destroy().catch(() => {}) })
if (source) {
    const url = new URL(source, location.href)
    if (url.origin === location.origin) open(url.href)
    else showError()
} else {
    get('message').textContent = 'This book has no reading file yet.'
    get('hint').textContent = 'Try Foliate with our Boooks PDF, or open your own book.'
    get('hint').hidden = false
    get('sample').hidden = false
    get('choose').hidden = false
    if (params.get('cover')) {
        get('cover').src = params.get('cover')
        get('cover').hidden = false
    }
}
