export const settingsKey = 'boooks-reader-settings'

export function readStored(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
    catch { return fallback }
}

export function writeStored(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) }
    catch { /* Reading still works when browser storage is unavailable. */ }
}

export function readSettings() {
    const saved = readStored(settingsKey, {})
    return {
        size: Math.max(14, Math.min(32, Number(saved.size) || 18)),
        zoom: Math.max(.75, Math.min(3, Number(saved.zoom) || 1)),
        dark: saved.dark === true,
        shake: saved.shake === true,
    }
}

export function positionKey(source) {
    return `boooks-reader-position:${typeof source === 'string'
        ? source : `${source.name}:${source.size}:${source.lastModified}`}`
}

// Keep locally selected files on this device so reopening can resume them too.
export async function bookFile(id, file) {
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('boooks-reader', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('files')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
    try {
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction('files', file ? 'readwrite' : 'readonly')
            const store = transaction.objectStore('files')
            const request = file ? store.put(file, id) : store.get(id)
            transaction.oncomplete = () => resolve(request.result)
            transaction.onerror = () => reject(transaction.error)
            transaction.onabort = () => reject(transaction.error)
        })
    } finally { db.close() }
}
