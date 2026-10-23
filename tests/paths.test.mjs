import assert from "node:assert/strict";
import { test } from "node:test";
import { publicAssetUrl } from "../src/lib/publicAssetUrl.ts";
import worker from "../src/worker.ts";

test("the fixed QR URL and its trailing-slash form serve index.html", async () => {
	for (const pathname of ["/beta", "/beta/", "/beta/index.html"]) {
		let assetRequest;
		const response = new Response("app", { headers: { "Content-Type": "text/html" } });
		const result = await worker.fetch(new Request(`https://boooks.app${pathname}?from=qr`), {
			ASSETS: { fetch(request) { assetRequest = request; return Promise.resolve(response); } },
		});
		assert.equal(assetRequest.url, "https://boooks.app/index.html?from=qr");
		assert.equal(result, response);
	}
});

test("scripts, textures and PDFs lose exactly one prefix and preserve request headers", async () => {
	for (const path of ["assets/app.js", "experience/shelf/wood.webp", "blockchain/book.pdf", "assets/beta/file.css"]) {
		let assetRequest;
		const response = new Response(null, { status: 206, headers: { "Content-Range": "bytes 0-99/200" } });
		const result = await worker.fetch(new Request(`https://boooks.app/beta/${path}?v=1`, {
			method: "HEAD", headers: { Range: "bytes=0-99", "If-None-Match": "asset-v1" },
		}), {
			ASSETS: { fetch(request) { assetRequest = request; return Promise.resolve(response); } },
		});
		assert.equal(assetRequest.url, `https://boooks.app/${path}?v=1`);
		assert.equal(assetRequest.method, "HEAD");
		assert.equal(assetRequest.headers.get("Range"), "bytes=0-99");
		assert.equal(assetRequest.headers.get("If-None-Match"), "asset-v1");
		assert.equal(result, response);
	}
});

test("similarly named paths and other site routes are not rewritten", async () => {
	for (const path of ["/beta-other", "/beta2/assets/app.js", "/threejs-other", "/", "/assets/app.js"]) {
		const result = await worker.fetch(new Request(`https://boooks.app${path}`), {
			ASSETS: { fetch() { assert.fail("An unrelated path reached the asset binding"); } },
		});
		assert.equal(result.status, 404);
	}
});

test("old /threejs links (printed QR codes) permanently redirect to the same place under /beta", async () => {
	const cases = [
		["/threejs", "/beta/"],
		["/threejs/", "/beta/"],
		["/threejs/book/978-0-141-01881-2?from=qr", "/beta/book/978-0-141-01881-2?from=qr"],
		["/threejs/assets/app.js", "/beta/assets/app.js"],
	];
	for (const [from, to] of cases) {
		const result = await worker.fetch(new Request(`https://boooks.app${from}`), {
			ASSETS: { fetch() { assert.fail("a legacy URL must redirect, not be served"); } },
		});
		assert.equal(result.status, 301, from);
		assert.equal(result.headers.get("Location"), `https://boooks.app${to}`, from);
	}
});

test("missing assets keep their 404 response instead of becoming HTML", async () => {
	const response = new Response("Not found", { status: 404 });
	const result = await worker.fetch(new Request("https://boooks.app/beta/assets/missing.js"), {
		ASSETS: { fetch() { return Promise.resolve(response); } },
	});
	assert.equal(result, response);
});

test("runtime asset paths use the deployment base without changing external or already-prefixed URLs", () => {
	for (const path of ["/experience/wood.webp", "/blockchain/book.pdf", "/favicon.ico"]) {
		assert.equal(publicAssetUrl(path, "/beta/"), `/beta${path}`);
		assert.equal(publicAssetUrl(path, "/"), path);
	}
	for (const path of ["/beta/experience/wood.webp", "https://cdn.example.com/cover.webp", "//cdn.example.com/cover.webp", "data:image/webp;base64,AAAA", "blob:https://boooks.app/book", "relative.webp"]) {
		assert.equal(publicAssetUrl(path, "/beta/"), path);
	}
});

test("versioned cover URLs are stable across components and change with image content", () => {
	globalThis.__PUBLIC_IMAGE_VERSIONS__ = { "/blockchain/front.webp": "0123456789abcdef" };
	try {
		const versioned = "/beta/blockchain/front.webp?v=0123456789abcdef";
		assert.equal(publicAssetUrl("/blockchain/front.webp", "/beta/"), versioned);
		assert.equal(publicAssetUrl("/beta/blockchain/front.webp", "/beta/"), versioned);
		assert.equal(publicAssetUrl(versioned, "/beta/"), versioned);
		assert.equal(publicAssetUrl("/blockchain/front.webp", "/"), "/blockchain/front.webp?v=0123456789abcdef");
		globalThis.__PUBLIC_IMAGE_VERSIONS__["/blockchain/front.webp"] = "abcdef0123456789";
		assert.notEqual(publicAssetUrl("/blockchain/front.webp", "/beta/"), versioned);
	} finally {
		delete globalThis.__PUBLIC_IMAGE_VERSIONS__;
	}
});

test("cover caching preserves the asset stream and validators", async () => {
	for (const [query, expected] of [
		["?v=0123456789abcdef", "public, max-age=31536000, immutable"],
		["", "public, max-age=86400, stale-while-revalidate=604800"],
	]) {
		const response = new Response("image bytes", { headers: { "Content-Type": "image/webp", ETag: '"cover-hash"' } });
		const result = await worker.fetch(new Request(`https://boooks.app/beta/blockchain/front.webp${query}`), {
			ASSETS: { fetch() { return Promise.resolve(response); } },
		});
		assert.equal(result.headers.get("Cache-Control"), expected);
		assert.equal(result.headers.get("ETag"), '"cover-hash"');
		assert.equal(result.headers.get("Content-Type"), "image/webp");
		assert.equal(result.body, response.body);
		assert.equal(await result.text(), "image bytes");
	}
});

test("missing covers and catalog JSON never get long-lived image caching", async () => {
	for (const [path, status] of [["blockchain/missing.webp", 404], ["blockchain/data.json", 200]]) {
		const response = new Response(null, { status });
		const result = await worker.fetch(new Request(`https://boooks.app/beta/${path}`), {
			ASSETS: { fetch() { return Promise.resolve(response); } },
		});
		assert.equal(result, response);
		assert.equal(result.headers.has("Cache-Control"), false);
	}
});
