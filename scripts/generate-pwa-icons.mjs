// Renders public/icons/logo.svg onto the app's navy background as PWA icons, using headless Chrome
// (ImageMagick's built-in SVG renderer drops the logo's gradient fill and produces a blank icon).
// Usage: node scripts/generate-pwa-icons.mjs   (CHROME_PATH overrides the browser)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "..");
const svg = readFileSync(resolve(root, "public/icons/logo.svg"), "utf8");
const BACKGROUND = "#06192e"; // matches <meta name="theme-color">
const icons = [
	{ file: "public/pwa-192.png", size: 192, logo: 0.6 },
	{ file: "public/pwa-512.png", size: 512, logo: 0.6 },
	// Maskable icons need the logo inside the central safe zone (~80% circle).
	{ file: "public/pwa-maskable-512.png", size: 512, logo: 0.5 },
];

const browser = await chromium.launch({
	executablePath:
		process.env.CHROME_PATH ??
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	headless: true,
});
try {
	for (const { file, size, logo } of icons) {
		const page = await browser.newPage({ viewport: { width: size, height: size } });
		await page.setContent(`<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${BACKGROUND};display:grid;place-items:center">
			<div style="width:${Math.round(size * logo)}px;height:${Math.round(size * logo)}px;display:grid;place-items:center">${svg.replace("<svg ", '<svg style="max-width:100%;max-height:100%;width:auto;height:100%" ')}</div>
		</body></html>`);
		await page.screenshot({ path: resolve(root, file), omitBackground: false });
		await page.close();
		console.log(`wrote ${file} (${size}×${size})`);
	}
} finally {
	await browser.close();
}
