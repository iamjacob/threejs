/** Keep runtime-loaded public assets inside Vite's deployment base path. */
export function publicAssetUrl(path: string, base = import.meta.env.BASE_URL) {
	if (!path.startsWith("/") || path.startsWith("//") || path.startsWith(base)) {
		return path;
	}
	return `${base}${path.slice(1)}`;
}
