/** Keep runtime-loaded public assets inside Vite's deployment base path. */
export function publicAssetUrl(path: string, base = import.meta.env.BASE_URL) {
	if (!path.startsWith("/") || path.startsWith("//")) {
		return path;
	}
	const url = path.startsWith(base) ? path : `${base}${path.slice(1)}`;
	const key = `/${url.slice(base.length)}`;
	const version =
		typeof __PUBLIC_IMAGE_VERSIONS__ === "undefined"
			? undefined
			: __PUBLIC_IMAGE_VERSIONS__?.[key];
	return version ? `${url}?v=${version}` : url;
}
declare const __PUBLIC_IMAGE_VERSIONS__: Record<string, string> | undefined;
