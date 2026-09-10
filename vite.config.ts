import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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

const config = defineConfig(({ command }) => ({
	base: "/threejs/",
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
	],
}));

export default config;

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
