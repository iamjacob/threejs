import { COVER_ATLAS_PATH, coverAtlasRect } from "../../lib/coverAtlas";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import type { FileStore } from "../../platform/files/fileStore";
import type { TornadoInstance } from "../core/tornadoBooks.ts";

/**
 * Builds ONE canvas texture with a cell per tornado instance, once per library load (never in the
 * frame loop). Every cell is first painted as a deterministic metadata fallback (color + title),
 * then overwritten with the real cover when it is available LOCALLY:
 * - scans: bytes from the profile's FileStore (IndexedDB / native filesystem);
 * - catalog: a region of the bundled prebuilt cover atlas (same origin; cached by the HTTP/SW cache).
 * No remote URLs are ever requested. Failures keep the fallback.
 */
export const CELL_W = 96;
export const CELL_H = 144;
export const COLUMNS = 12;

export type CoverSheet = {
	canvas: HTMLCanvasElement;
	/** Per instance: UV rect [u, v, w, h] of its cell (v from the bottom, three.js convention). */
	rects: [number, number, number, number][];
	/** How each cell ended up, for diagnostics/tests. */
	sources: ("fallback" | "atlas" | "file")[];
};

export function cellRect(
	index: number,
	rows: number,
): [number, number, number, number] {
	const col = index % COLUMNS;
	const row = Math.floor(index / COLUMNS);
	const w = 1 / COLUMNS;
	const h = 1 / rows;
	return [col * w, 1 - (row + 1) * h, w, h];
}

let atlasImage: Promise<HTMLImageElement | undefined> | undefined;
function loadAtlas() {
	atlasImage ??= new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => {
			atlasImage = undefined; // retry on a later load (e.g. back online)
			resolve(undefined);
		};
		img.src = publicAssetUrl(COVER_ATLAS_PATH);
	});
	return atlasImage;
}

async function decodeBlob(bytes: Uint8Array, mimeType: string) {
	const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType });
	return createImageBitmap(blob);
}

function paintFallback(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	inst: TornadoInstance,
) {
	ctx.fillStyle = inst.color;
	ctx.fillRect(x, y, CELL_W, CELL_H);
	ctx.fillStyle = "rgba(255,255,255,0.18)";
	ctx.fillRect(x + 6, y + 8, CELL_W - 12, 2);
	ctx.fillRect(x + 6, y + CELL_H - 10, CELL_W - 12, 2);
	ctx.fillStyle = "#fff8ea";
	ctx.font = "bold 13px system-ui, sans-serif";
	ctx.textBaseline = "top";
	const words = inst.title.split(/\s+/);
	let line = "";
	let ly = y + 18;
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (ctx.measureText(next).width > CELL_W - 14 && line) {
			ctx.fillText(line, x + 7, ly, CELL_W - 14);
			ly += 15;
			line = word;
			if (ly > y + CELL_H - 44) break;
		} else line = next;
	}
	if (line && ly <= y + CELL_H - 44) ctx.fillText(line, x + 7, ly, CELL_W - 14);
	ctx.font = "11px system-ui, sans-serif";
	ctx.fillStyle = "rgba(255,248,234,0.8)";
	ctx.fillText(inst.author, x + 7, y + CELL_H - 26, CELL_W - 14);
}

export async function buildCoverSheet(
	instances: TornadoInstance[],
	files: FileStore | undefined,
	isCancelled: () => boolean = () => false,
): Promise<CoverSheet | undefined> {
	if (!instances.length) return undefined;
	const rows = Math.max(1, Math.ceil(instances.length / COLUMNS));
	const canvas = document.createElement("canvas");
	canvas.width = COLUMNS * CELL_W;
	canvas.height = rows * CELL_H;
	const ctx = canvas.getContext("2d");
	if (!ctx) return undefined;
	const sources: CoverSheet["sources"] = [];
	instances.forEach((inst, i) => {
		paintFallback(
			ctx,
			(i % COLUMNS) * CELL_W,
			Math.floor(i / COLUMNS) * CELL_H,
			inst,
		);
		sources.push("fallback");
	});
	const needsAtlas = instances.some((i) => i.cover?.kind === "asset");
	const atlas = needsAtlas ? await loadAtlas() : undefined;
	for (let i = 0; i < instances.length; i++) {
		if (isCancelled()) return undefined;
		const cover = instances[i].cover;
		const x = (i % COLUMNS) * CELL_W;
		const y = Math.floor(i / COLUMNS) * CELL_H;
		try {
			if (cover?.kind === "asset" && atlas) {
				const rect = coverAtlasRect(cover.path); // [u, v, w, h], v from the bottom
				if (!rect) continue;
				const [u, v, w, h] = rect;
				const sw = w * atlas.naturalWidth;
				const sh = h * atlas.naturalHeight;
				const sx = u * atlas.naturalWidth;
				const sy = (1 - v - h) * atlas.naturalHeight;
				ctx.drawImage(atlas, sx, sy, sw, sh, x, y, CELL_W, CELL_H);
				sources[i] = "atlas";
			} else if (cover?.kind === "blob" && files) {
				const bytes = await files.get(cover.key);
				if (!bytes) continue; // missing locally (evicted / not copied): keep fallback
				const bitmap = await decodeBlob(bytes, cover.mimeType);
				ctx.drawImage(bitmap, x, y, CELL_W, CELL_H);
				bitmap.close();
				sources[i] = "file";
			}
		} catch {
			/* Undecodable image: keep the deliberate fallback. */
		}
	}
	return {
		canvas,
		rects: instances.map((_, i) => cellRect(i, rows)),
		sources,
	};
}
