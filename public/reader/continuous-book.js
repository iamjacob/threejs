// Foliate's book interface, rendered as one scroll with nearby sections mounted.
export class ContinuousBook {
    constructor(host, book, onDocument, settings = { size: 18, zoom: 1, dark: false }) {
        this.host = host
        this.book = book
        this.onDocument = onDocument
        this.fixed = book.rendition?.layout === 'pre-paginated'
        this.settings = settings
        this.records = []
        this.destroyed = false
        this.observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                const record = this.records.find(item => item.element === entry.target)
                record.wanted = entry.isIntersecting
                if (record.wanted) this.load(record)
                else this.release(record)
            }
        }, { root: host, rootMargin: '1200px 0px' })
        this.resize = new ResizeObserver(() => {
            for (const record of this.records) {
                if (this.fixed && record.doc) this.resizePage(record)
            }
        })
        this.resize.observe(host)
    }

    async open(position) {
        this.host.replaceChildren()
        this.host.scrollTop = 0
        for (const [index, section] of this.book.sections.entries()) {
            if (section.linear === 'no') continue
            const element = document.createElement('section')
            element.className = `book-section ${this.fixed ? 'fixed-page' : 'chapter'}`
            if (this.fixed) element.style.width = `${this.settings.zoom * 100}%`
            element.dataset.section = String(index)
            element.setAttribute('aria-label', `${this.fixed ? 'Page' : 'Chapter'} ${this.records.length + 1}`)
            element.style.height = `${this.fixed ? this.host.clientWidth * 1.5 : Math.max(300, this.host.clientHeight)}px`
            this.host.append(element)
            this.records.push({ index, section, element, wanted: false })
        }
        const first = this.records.find(record => record.index === position?.index) ?? this.records[0]
        if (!first) throw new Error('Empty book')
        first.wanted = true
        await this.load(first)
        if (position) this.restorePosition(position)
        for (const record of this.records) this.observer.observe(record.element)
    }

    async load(record) {
        if (record.frame || record.loading || this.destroyed) return
        record.loading = true
        try {
            const source = await record.section.load()
            if (this.destroyed || !record.wanted) return
            const frame = document.createElement('iframe')
            record.frame = frame
            frame.title = record.element.getAttribute('aria-label')
            frame.setAttribute('sandbox', 'allow-same-origin allow-scripts')
            frame.setAttribute('scrolling', 'no')
            const ready = new Promise((resolve, reject) => {
                frame.onload = resolve
                frame.onerror = reject
            })
            frame.src = typeof source === 'string' ? source : source.src
            record.element.replaceChildren(frame)
            await ready
            if (this.destroyed || !record.wanted) return
            const doc = frame.contentDocument
            record.doc = doc
            this.onDocument(doc, record.index)
            if (this.fixed) {
                const viewport = doc.querySelector('meta[name="viewport"]')?.content ?? ''
                const dimensions = Object.fromEntries(viewport.split(/[,;\s]+/).map(pair => pair.split('=')))
                const image = doc.querySelector('img')
                if (image && !image.complete) await new Promise(resolve => { image.onload = resolve; image.onerror = resolve })
                record.width = Number(dimensions.width) || image?.naturalWidth || 600
                record.height = Number(dimensions.height) || image?.naturalHeight || 900
                record.onZoom = typeof source === 'object' ? source.onZoom : null
                await this.resizePage(record)
            } else {
                record.style = doc.createElement('style')
                doc.head.append(record.style)
                this.styleDocument(record)
                frame.style.height = '1px'
                const fit = () => {
                    if (this.destroyed || !record.doc) return
                    const height = Math.ceil(Math.max(doc.body.getBoundingClientRect().height, doc.body.scrollHeight))
                    this.setHeight(record, height)
                    frame.style.height = `${height}px`
                }
                fit()
                record.measure = new ResizeObserver(fit)
                record.measure.observe(doc.body)
                doc.fonts.ready.then(fit)
            }
            record.element.dataset.loaded = 'true'
        } catch {
            if (!this.destroyed && record.wanted) {
                record.frame?.remove()
                record.frame = null
                record.doc = null
                const retry = document.createElement('button')
                retry.textContent = 'Load this page again'
                retry.onclick = () => this.load(record)
                record.element.replaceChildren(retry)
            }
        } finally {
            record.loading = false
            if (!record.wanted || this.destroyed) this.release(record)
        }
    }

    async resizePage(record) {
        if (record.resizing || !record.doc || this.destroyed) return
        const width = record.element.clientWidth
        if (width === record.renderedWidth) return
        record.resizing = true
        record.renderedWidth = width
        const scale = width / record.width
        this.setHeight(record, record.height * scale)
        if (record.onZoom) {
            record.frame.style.width = `${width}px`
            record.frame.style.height = `${record.height * scale}px`
            try { await record.onZoom({ doc: record.doc, scale }) }
            catch { /* Closing or scrolling away can cancel a PDF render. */ }
        } else {
            Object.assign(record.frame.style, {
                width: `${record.width}px`, height: `${record.height}px`,
                transform: `scale(${scale})`, transformOrigin: 'top left',
            })
        }
        record.resizing = false
        if (!record.wanted) this.release(record)
        else if (record.element.clientWidth !== width) this.resizePage(record)
    }

    release(record) {
        if (record.loading || record.resizing) return
        record.measure?.disconnect()
        record.measure = null
        record.frame?.remove()
        record.frame = null
        record.doc = null
        record.renderedWidth = null
        delete record.element.dataset.loaded
        record.section.unload?.()
    }

    getPosition() {
        const top = this.host.scrollTop
        const record = this.records.find(item => item.element.offsetTop + item.element.offsetHeight > top)
            ?? this.records.at(-1)
        if (!record) return null
        return { index: record.index, fraction: Math.max(0, Math.min(1,
            (top - record.element.offsetTop) / Math.max(1, record.element.offsetHeight))) }
    }

    restorePosition(position) {
        const record = this.records.find(item => item.index === position?.index)
        if (!record) return
        const fraction = Math.max(0, Math.min(1, Number(position.fraction) || 0))
        this.host.scrollTop = record.element.offsetTop + fraction * record.element.offsetHeight
    }

    setHeight(record, height) {
        const position = this.getPosition()
        record.element.style.height = `${height}px`
        if (position) this.restorePosition(position)
    }

    styleDocument(record) {
        if (!record.style) return
        const { size, dark } = this.settings
        record.style.textContent = `
            html { overflow: hidden; height: auto !important; font-size: ${size}px !important; }
            body { box-sizing: border-box; margin: 0 !important; padding: 64px 24px 32px !important;
                min-height: 0 !important; height: auto !important; color: ${dark ? '#e7e2d9' : '#292524'} !important;
                background: ${dark ? '#171b22' : '#f6f3ed'} !important; font: 1rem/1.7 Georgia, serif !important; overflow-wrap: break-word; }
            p, li, blockquote, dd, dt { font-size: 1rem !important; line-height: 1.7 !important; }
            img, svg, video { max-width: 100% !important; height: auto; }
            ${dark ? 'body *:not(svg):not(svg *) { color: inherit !important; background-color: transparent !important; } a { color: #a8c8ff !important; }' : ''}
        `
    }

    setSettings(settings) {
        this.settings = settings
        for (const record of this.records) {
            if (this.fixed) {
                record.element.style.width = `${settings.zoom * 100}%`
                if (record.doc) this.resizePage(record)
            } else this.styleDocument(record)
        }
    }

    async goTo(href) {
        const target = await this.book.resolveHref(href)
        const record = this.records.find(item => item.index === target.index)
        if (!record) return
        record.wanted = true
        await this.load(record)
        record.element.scrollIntoView({ block: 'start' })
        const anchor = typeof target.anchor === 'function' ? target.anchor(record.doc) : null
        if (anchor?.getBoundingClientRect) this.host.scrollTop += anchor.getBoundingClientRect().top
    }

    async destroy() {
        this.destroyed = true
        this.observer.disconnect()
        this.resize.disconnect()
        for (const record of this.records) {
            record.wanted = false
            this.release(record)
        }
        this.host.replaceChildren()
        await this.book.destroy?.()
    }
}
