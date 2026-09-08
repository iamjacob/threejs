import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
	base: "/threejs/",
	resolve: { tsconfigPaths: true },
	plugins: [
		// DOM source attributes cannot be applied to Three.js objects.
		devtools({ injectSource: { enabled: false } }),
		tailwindcss(),
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		viteReact(),
	],
});

export default config;
