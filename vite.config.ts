import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

function publicImageVersions(directory = resolve("public"), prefix = "") {
	const versions: Record<string, string> = {};
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const filename = resolve(directory, entry.name);
		const path = `${prefix}/${entry.name}`;
		if (entry.isDirectory())
			Object.assign(versions, publicImageVersions(filename, path));
		else if (/\.(avif|webp|png|jpe?g|gif|svg|ico)$/i.test(entry.name))
			versions[path] = createHash("sha256")
				.update(readFileSync(filename))
				.digest("hex")
				.slice(0, 16);
	}
	return versions;
}

// `--mode native` builds for Capacitor: the WebView serves from the origin root, and a service
// worker is unnecessary there (assets are already local), so it is not generated.
const config = defineConfig(({ command, mode }) => ({
	base: mode === "native" ? "/" : "/beta/",
	build: mode === "native" ? { outDir: "dist-native" } : undefined,
	define: {
		__PUBLIC_IMAGE_VERSIONS__: JSON.stringify(
			command === "build" ? publicImageVersions() : {},
		),
	},
	resolve: { tsconfigPaths: true },
	plugins: [
		// DOM source attributes cannot be applied to Three.js objects.
		devtools({ injectSource: { enabled: false } }),
		tailwindcss(),
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		viteReact(),
		VitePWA({
			disable: mode === "native",
			registerType: "autoUpdate",
			injectRegister: "script-defer",
			includeAssets: ["favicon.ico"],
			manifest: {
				name: "Boooks",
				short_name: "Boooks",
				description: "Your personal 3D library, offline-first.",
				theme_color: "#06192e",
				background_color: "#06192e",
				display: "standalone",
				icons: [
					{ src: "pwa-192.png", sizes: "192x192", type: "image/png" },
					{ src: "pwa-512.png", sizes: "512x512", type: "image/png" },
					{
						src: "pwa-maskable-512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				// App shell only (JS/CSS/HTML/sql-wasm + icons). The 70+ MB of book data in
				// public/blockchain, public/reader and book images is NOT precached (see runtimeCaching).
				globPatterns: [
					"index.html",
					"assets/**/*.{js,css,wasm}",
					"*.{ico,png}",
				],
				// The largest chunks are ~630 kB; sql-wasm.wasm is ~650 kB.
				maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
				navigateFallback: "index.html",
				// The reader is its own document (an iframe). Without this, the SPA fallback served the
				// app's index.html into the reader frame instead of Foliate.
				navigateFallbackDenylist: [/\/reader\//],
				// Book assets are cached as they are viewed, so opened books work offline later.
				runtimeCaching: [
					{
						// The reader's own page, scripts and PDF.js (13 MB, mostly source maps and CMaps):
						// cached on first use, so a book opened once also opens offline.
						urlPattern: ({ url }) => /\/reader\//.test(url.pathname),
						handler: "StaleWhileRevalidate",
						options: {
							cacheName: "boooks-reader",
							expiration: { maxEntries: 120 },
						},
					},
					{
						urlPattern: ({ url, request }) =>
							request.destination === "image" ||
							/\/(book-images|experience|blockchain)\//.test(url.pathname),
						handler: "CacheFirst",
						options: {
							cacheName: "boooks-assets",
							expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
						},
					},
				],
			},
		}),
	],
}));

export default config;

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
