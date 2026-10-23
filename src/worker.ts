const BASE_PATH = "/beta";
/** Previous public base. Kept as a permanent redirect so printed QR codes and old links still work. */
const LEGACY_BASE_PATH = "/threejs";

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (
			url.pathname === LEGACY_BASE_PATH ||
			url.pathname.startsWith(`${LEGACY_BASE_PATH}/`)
		) {
			url.pathname = `${BASE_PATH}${url.pathname.slice(LEGACY_BASE_PATH.length) || "/"}`;
			return Response.redirect(url.toString(), 301);
		}
		if (
			url.pathname !== BASE_PATH &&
			!url.pathname.startsWith(`${BASE_PATH}/`)
		) {
			return new Response("Not found", { status: 404 });
		}

		const assetPath = url.pathname.slice(BASE_PATH.length);
		url.pathname = !assetPath || assetPath === "/" ? "/index.html" : assetPath;
		const response = await env.ASSETS.fetch(new Request(url, request));
		if (
			(request.method === "GET" || request.method === "HEAD") &&
			(response.status === 200 || response.status === 304) &&
			/\.(avif|webp|png|jpe?g|gif|svg|ico)$/i.test(url.pathname)
		) {
			const cached = new Response(response.body, response);
			cached.headers.set(
				"Cache-Control",
				/^[a-f0-9]{16}$/.test(url.searchParams.get("v") ?? "")
					? "public, max-age=31536000, immutable"
					: "public, max-age=86400, stale-while-revalidate=604800",
			);
			return cached;
		}
		return response;
	},
} satisfies ExportedHandler<Env>;
