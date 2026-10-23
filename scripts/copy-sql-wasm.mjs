// Copies the sql.js wasm that jeep-sqlite 2.8.0 links against into public/assets.
// jeep-sqlite bundles sql.js glue from the 1.11.x line; the newer sql.js 1.15.x wasm fails with
// "LinkError: WebAssembly.instantiate(): Import #34". See docs/engineering/boooks-port-plan.md (S1).
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
export const PINNED_SQLJS_VERSION = "1.11.0";

const pkgPath = require.resolve("sql.js-jeep-wasm/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
if (version !== PINNED_SQLJS_VERSION) {
	throw new Error(
		`sql.js-jeep-wasm is ${version}; jeep-sqlite needs ${PINNED_SQLJS_VERSION}. Re-run the web restart test before changing this.`,
	);
}
const source = resolve(dirname(pkgPath), "dist/sql-wasm.wasm");
const target = resolve(import.meta.dirname, "../public/assets/sql-wasm.wasm");
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`copied sql.js ${version} wasm → public/assets/sql-wasm.wasm`);
