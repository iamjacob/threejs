import { ContinuousBook } from './continuous-book.js'
import { bookFile, positionKey, readSettings, readStored, settingsKey, writeStored } from './reader-storage.js'

const params = new URLSearchParams(location.search)
const get = id => document.getElementById(id)
let source = params.get('url')
let opening = false
let reader
let currentPositionKey
const bookId = params.get('book') ?? params.get('url') ?? 'local'
const sourceKey = `boooks-reader-source:${bookId}`
const settings = readSettings()
// In the overlay, keep the iframe and its Close button on the same fullscreen
// surface. Fullscreening the parent document would cover the modal with the shelf.
const screenTarget = window.frameElement?.closest('[data-reader-surface]') ?? document.documentElement
const screenDocument = screenTarget.ownerDocument

const savePosition = () => {
    // Removing frames during teardown emits a final scroll event at zero.
    const position = reader && !reader.destroyed ? reader.getPosition() : null
    if (!opening && currentPositionKey && position) {
 writeStored(currentPositionKey, position)
 parent.postMessage({type: "reader-position", position}, location.origin)
 }
}
const setSettingsOpen = open => {
    get('settings').hidden = !open
    get('settings-toggle').setAttribute('aria-expanded', String(open))
    if (!open) get('settings-toggle').focus({ preventScroll: true })
}
const updateSettings = () => {
    document.documentElement.dataset.theme = settings.dark ? 'dark' : 'light'
    get('dark-mode').checked = settings.dark
    get('shake').checked = settings.shake
    get('size-label').textContent = reader?.fixed ? 'Page zoom' : 'Text size'
    get('size-value').textContent = reader?.fixed ? `${Math.round(settings.zoom * 100)}%` : `${settings.size}`
    get('size-down').disabled = reader?.fixed ? settings.zoom <= .75 : settings.size <= 14
    get('size-up').disabled = reader?.fixed ? settings.zoom >= 3 : settings.size >= 32
    get('size-down').setAttribute('aria-label', reader?.fixed ? 'Zoom out' : 'Decrease text size')
    get('size-up').setAttribute('aria-label', reader?.fixed ? 'Zoom in' : 'Increase text size')
    reader?.setSettings(settings)
    writeStored(settingsKey, settings)
}
get('settings-toggle').addEventListener('click', () => setSettingsOpen(get('settings').hidden))
const changeSize = direction => {
    if (reader?.fixed) settings.zoom = Math.max(.75, Math.min(3, settings.zoom + direction * .25))
    else settings.size = Math.max(14, Math.min(32, settings.size + direction * 2))
    updateSettings()
}
get('size-down').addEventListener('click', () => changeSize(-1))
get('size-up').addEventListener('click', () => changeSize(1))
get('dark-mode').addEventListener('change', event => { settings.dark = event.target.checked; updateSettings() })
get('pages').addEventListener('pointerdown', () => { if (!get('settings').hidden) setSettingsOpen(false) })
get('pages').addEventListener('scroll', savePosition, { passive: true })

const updateFullscreen = () => {
    get('fullscreen').textContent = screenDocument.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'
    get('fullscreen').disabled = !screenDocument.fullscreenEnabled
    if (!screenDocument.fullscreenEnabled) get('fullscreen').textContent = 'Fullscreen unavailable'
}
get('fullscreen').addEventListener('click', async () => {
    try {
        if (screenDocument.fullscreenElement) await screenDocument.exitFullscreen()
        else await screenTarget.requestFullscreen()
    } catch { get('settings-status').textContent = 'Fullscreen is unavailable in this browser. You can keep reading here.' }
})
screenDocument.addEventListener('fullscreenchange', updateFullscreen)
updateFullscreen()
const motion = parent.DeviceMotionEvent
get('shake-row').hidden = !motion || !isSecureContext
get('settings-hint').hidden = get('shake-row').hidden
get('shake').addEventListener('change', async event => {
    const input = event.target
    input.disabled = true
    try {
        settings.shake = input.checked && (!motion.requestPermission || await motion.requestPermission() === 'granted')
        get('settings-status').textContent = settings.shake ? 'Shake your phone to reopen your last book.'
            : input.checked ? 'Motion permission was not granted. You can still use Read.' : ''
    } catch {
        settings.shake = false
        get('settings-status').textContent = 'Motion is unavailable. You can still use Read.'
    } finally { input.disabled = false; updateSettings() }
})
updateSettings()

const keyboard = event => {
    if (event.key === 'Escape') {
        if (!get('settings').hidden) {
            event.preventDefault()
            setSettingsOpen(false)
            return
        }
        if (screenDocument.fullscreenElement) return
        event.preventDefault()
        savePosition()
        parent.postMessage({ type: 'close-reader' }, location.origin)
    }
    if (event.target.closest?.('input, select, textarea, button, a, [contenteditable]')) return
    const distance = { ArrowDown: 80, ArrowUp: -80, PageDown: innerHeight * .85, PageUp: -innerHeight * .85, ' ': innerHeight * .85 }[event.key]
    if (distance) {
        event.preventDefault()
        get('pages').scrollBy({ top: event.shiftKey && event.key === ' ' ? -distance : distance })
    }
}
document.addEventListener('keydown', keyboard)

function showError() {
    parent.postMessage({ type: 'reader-error' }, location.origin)
    get('notice').hidden = false
    get('message').textContent = 'This file could not be opened.'
    get('hint').hidden = false
    get('choose').hidden = false
    get('retry').hidden = !source
}

async function open(file) {
    if (opening) return
    savePosition()
    opening = true
    source = file
    get('notice').hidden = false
    get('message').textContent = 'Opening book…'
    for (const id of ['cover', 'hint', 'choose', 'retry', 'sample']) get(id).hidden = true
    try {
        await reader?.destroy()
        // Let PDF.js stream/range-load remote PDFs instead of first buffering
        // the entire response into a Blob (large PDFs can fail in that path).
        const book = typeof file === 'string' && file.startsWith('scan:') ? await (await import('./scanned-pages.js')).makeScannedBook(file.slice(5)) : typeof file === 'string' && new URL(file).pathname.toLowerCase().endsWith('.pdf')
            ? await (await import('./foliate/pdf.js')).makePDF(file)
            : await (await import('./foliate/view.js')).makeBook(file)
        reader = new ContinuousBook(get('pages'), book, (doc, index) => {
            doc.addEventListener('keydown', keyboard)
            doc.addEventListener('pointerdown', () => { if (!get('settings').hidden) setSettingsOpen(false) })
            doc.addEventListener('click', event => {
                const link = event.target.closest?.('a[href]')
                if (!link) return
                const href = book.sections[index].resolveHref?.(link.getAttribute('href')) ?? link.getAttribute('href')
                event.preventDefault()
                if (!book.isExternal?.(href)) reader.goTo(href).catch(() => {})
            })
        }, settings)
        currentPositionKey = positionKey(file)
        await reader.open(params.has("page") ? {index: Math.max(0, Number(params.get("page")) || 0), fraction: Number(params.get("fraction")) || 0} : readStored(currentPositionKey))
        updateSettings()
        get('notice').hidden = true
        parent.postMessage({ type: 'reader-ready' }, location.origin)
        get('pages').focus({ preventScroll: true })
        writeStored('boooks-last-reader', { bookId })
        if (typeof file === 'string') writeStored(sourceKey, { url: file })
        else {
            // The reader remains usable if private browsing blocks IndexedDB.
            bookFile(bookId, file).then(() => writeStored(sourceKey, { local: true })).catch(() => {})
        }
    } catch (error) {
        console.error('Reader could not open the book:', error)
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
window.addEventListener('message', event => {
 if(event.origin === location.origin && event.source === parent && event.data?.type === 'reader-go-to' && reader && !opening) {
 const p = event.data.position; if(p && Number.isInteger(p.index) && p.index >= 0 && Number.isFinite(p.fraction)) reader.restorePosition(p);
 }
    if (event.origin === location.origin && event.source === parent && event.data?.type === 'save-reader-position') savePosition()
})
window.addEventListener('pagehide', () => {
    savePosition()
    screenDocument.removeEventListener('fullscreenchange', updateFullscreen)
    reader?.destroy().catch(() => {})
})
document.addEventListener('visibilitychange', () => { if (document.hidden) savePosition() })
const savedSource = readStored(sourceKey)
if (savedSource?.local) {
    try {
        const file = await bookFile(bookId)
        if (file) source = file
    } catch { /* Fall back to the catalog file or local file chooser. */ }
} else if (typeof savedSource?.url === 'string') source = savedSource.url
if (source) {
    if (source instanceof File || (typeof source === "string" && source === `scan:${bookId}`)) open(source)
    else {
        const url = new URL(source, location.href)
        if (url.origin === location.origin) open(url.href)
        else showError()
    }
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
