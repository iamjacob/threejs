// Fixtures for tests/data-book-files*.test.mjs: minimal byte-valid EPUB and PDF files.
const enc = (s) => new TextEncoder().encode(s);
const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
const u32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

/**
 * A stored (uncompressed) ZIP with the given entries, in order. CRCs are zero: the importer only
 * checks the OCF layout (first entry `mimetype`, uncompressed, exact content) and the EOCD.
 */
export function zip(entries, { method = 0, withEnd = true } = {}) {
	const parts = [];
	const central = [];
	let offset = 0;
	for (const [name, body] of entries) {
		const n = enc(name);
		const b = typeof body === "string" ? enc(body) : body;
		const local = [0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(method), 0, 0, 0, 0, ...u32(0), ...u32(b.length), ...u32(b.length), ...u16(n.length), ...u16(0)];
		parts.push(Uint8Array.from(local), n, b);
		central.push({ n, size: b.length, offset });
		offset += local.length + n.length + b.length;
	}
	const cdStart = offset;
	for (const c of central) {
		const h = [0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(method), 0, 0, 0, 0, ...u32(0), ...u32(c.size), ...u32(c.size), ...u16(c.n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset)];
		parts.push(Uint8Array.from(h), c.n);
		offset += h.length + c.n.length;
	}
	if (withEnd)
		parts.push(Uint8Array.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, ...u16(central.length), ...u16(central.length), ...u32(offset - cdStart), ...u32(cdStart), 0, 0]));
	const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

export const epub = (tag = "a") =>
	zip([
		["mimetype", "application/epub+zip"],
		["META-INF/container.xml", `<container><!-- ${tag} --></container>`],
	]);
export const pdf = (tag = "a") => enc(`%PDF-1.4\n% ${tag}\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n`);

export const file = (bytes, extra = {}) => ({ bytes, originalName: "book.epub", rightsBasis: "public_domain", sourceNote: "Project Gutenberg", ...extra });
