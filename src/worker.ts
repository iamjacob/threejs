const BASE_PATH = "/threejs";

export default {
	fetch(request, env) {
		const url = new URL(request.url);
		if (
			url.pathname !== BASE_PATH &&
			!url.pathname.startsWith(`${BASE_PATH}/`)
		) {
			return new Response("Not found", { status: 404 });
		}

		const assetPath = url.pathname.slice(BASE_PATH.length);
		url.pathname = !assetPath || assetPath === "/" ? "/index.html" : assetPath;
		return env.ASSETS.fetch(new Request(url, request));
	},
} satisfies ExportedHandler<Env>;
