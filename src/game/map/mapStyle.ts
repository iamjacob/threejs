import type { StyleSpecification } from "maplibre-gl";

/**
 * Same style as the old Expo app (`map-experience.web.tsx` MAP_STYLE). OpenFreeMap requires
 * attribution; MapLibre's default AttributionControl shows it from the style's sources.
 */
export const REMOTE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/**
 * Bundled fallback used when the remote style cannot load (offline first launch, captive portal,
 * blocked network). No tile sources, so it needs no network: the game stays playable on a plain
 * ground with a grid drawn by the 3D layer. Colors follow the old app's polishMap palette.
 */
export const OFFLINE_MAP_STYLE: StyleSpecification = {
	version: 8,
	name: "boooks-offline",
	sources: {},
	layers: [
		{
			id: "background",
			type: "background",
			paint: { "background-color": "#eee9df" },
		},
	],
};

/**
 * Paint tweaks from the old app's `polishMap` (Expo `map-experience.web.tsx`), so the map keeps its
 * look. Style layers vary by provider; every change is best-effort.
 */
// biome-ignore lint/suspicious/noExplicitAny: maplibre Map type is only needed structurally here.
export function polishMap(map: any) {
	const layers: { id: string; type: string }[] | undefined =
		map?.getStyle?.()?.layers;
	if (!layers) return;
	for (const layer of layers) {
		const id = layer.id.toLowerCase();
		try {
			if (layer.type === "background")
				map.setPaintProperty(layer.id, "background-color", "#eee9df");
			if (layer.type === "fill" && id.includes("water"))
				map.setPaintProperty(layer.id, "fill-color", "#cddde5");
			if (
				layer.type === "fill" &&
				(id.includes("building") || id.includes("structure"))
			) {
				map.setPaintProperty(layer.id, "fill-color", "#cfaaa2");
				map.setPaintProperty(layer.id, "fill-opacity", 0.76);
			}
			if (layer.type === "fill-extrusion" && id.includes("building")) {
				map.setPaintProperty(layer.id, "fill-extrusion-color", "#bd8179");
				map.setPaintProperty(layer.id, "fill-extrusion-opacity", 0.78);
			}
			if (
				layer.type === "line" &&
				/(road|street|motorway|bridge|tunnel|path)/.test(id)
			)
				map.setPaintProperty(
					layer.id,
					"line-color",
					id.includes("motorway") ? "#d7c39c" : "#e8ddca",
				);
		} catch {
			/* Unsupported paint properties are non-fatal. */
		}
	}
}
