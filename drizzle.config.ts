import { defineConfig } from "drizzle-kit";

// Generates SQL migrations only. They are bundled into the app and applied by
// src/data/db/migrate.ts (Drizzle's fs-based migrator cannot run in a WebView).
export default defineConfig({
	dialect: "sqlite",
	schema: "./src/data/schema.ts",
	out: "./drizzle",
	breakpoints: true,
});
