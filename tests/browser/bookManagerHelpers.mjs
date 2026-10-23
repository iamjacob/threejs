// Page helpers for tests/browser/book-manager.mjs.
import { BASE } from "./harness.mjs";

export const go = (page, origin, p) => page.goto(`${origin}${BASE}${p.replace(/^\//, "")}`);
export const manager = (page) => page.getByTestId("book-manager");
export const content = (page) => page.getByTestId("status-content");

const ONE_PX = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	"base64",
);
/** A real 1×1 PNG plus `n` trailing bytes → valid image bytes with a distinct sha256 per `n`. */
export const png = (n) => ({
	name: `page-${n}.png`,
	mimeType: "image/png",
	buffer: Buffer.concat([ONE_PX, Buffer.alloc(n)]),
});

/** Clicks "Add a page image" and answers the real <input type=file> chooser with `file`. */
export async function addPage(page, file) {
	const chooser = page.waitForEvent("filechooser", { timeout: 15_000 });
	await page.getByTestId("add-page").click();
	await (await chooser).setFiles(file);
}
