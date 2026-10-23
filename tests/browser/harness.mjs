// Static server for dist/ under the /threejs/ base (SPA fallback like src/worker.ts) and a
// persistent-profile Chrome launcher, so IndexedDB survives "app restarts" and SIGKILL crashes.
import { readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

export const BASE = "/threejs/";
const types = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".wasm": "application/wasm",
	".webmanifest": "application/manifest+json",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
};

export async function serveDist(port = 4318) {
	const dist = new URL("../../dist/", import.meta.url).pathname;
	const server = createServer(async (req, res) => {
		const url = new URL(req.url, "http://x");
		let path = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : "";
		if (!path || !extname(path)) path = "index.html";
		let body;
		try {
			body = await readFile(join(dist, normalize(path)));
		} catch {
			res.writeHead(404).end();
			return;
		}
		res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
		res.end(body);
	});
	await new Promise((resolve) => server.listen(port, resolve));
	return { origin: `http://localhost:${port}`, close: () => server.close() };
}

const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function freshProfile(dir) {
	await rm(dir, { recursive: true, force: true });
	return dir;
}

export async function launch(profileDir) {
	const ctx = await chromium.launchPersistentContext(profileDir, { executablePath: chrome, headless: true });
	const page = ctx.pages()[0] ?? (await ctx.newPage());
	page.on("pageerror", (e) => console.log("  pageerror:", e.message));
	return { ctx, page };
}

/**
 * SIGKILLs every Chrome process using this profile (no unload, no close), like a crash or OS kill.
 * Persistent contexts expose no browser process handle, so match on --user-data-dir.
 * Throws if nothing was killed, so a "crash" can never silently degrade into a clean close.
 */
export async function crash(ctx, profileDir) {
	const { execFileSync } = await import("node:child_process");
	const pids = execFileSync("pgrep", ["-f", `user-data-dir=${profileDir}`], { encoding: "utf8" })
		.split("\n")
		.filter(Boolean)
		.map(Number);
	if (!pids.length) throw new Error("crash(): no Chrome process found to kill");
	for (const pid of pids) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	}
	await ctx.close().catch(() => {});
	return pids.length;
}

/** Makes the next <input type=file>.click() pick a 1×1 PNG (the web adapter uses a file input). */
export function stubImagePicker(page) {
	return page.evaluate(() => {
		const png = Uint8Array.from(
			atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
			(c) => c.charCodeAt(0),
		);
		HTMLInputElement.prototype.click = function () {
			const dt = new DataTransfer();
			dt.items.add(new File([png], "dot.png", { type: "image/png" }));
			this.files = dt.files;
			this.dispatchEvent(new Event("change"));
		};
	});
}
