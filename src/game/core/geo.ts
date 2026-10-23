/**
 * The ONLY place that converts between geographic, ground-meter and scene coordinates.
 *
 * Scene space is react-three-map's <Canvas latitude longitude> space (v1.0.1, coordsToMatrix):
 * origin at the canvas lng/lat, x = east, y = up, z = south, in "meters at the origin latitude".
 * We convert through Web Mercator exactly like MapLibre does, so an entity at lng/lat lands on the
 * same map pixel at any distance from the origin and under any pan/zoom/pitch/rotation (the map's
 * view-projection matrix is applied to tiles and to the custom layer alike).
 *
 * Pure TS: no three, React or MapLibre imports, so it runs headlessly.
 */

/** Matches maplibre-gl 5.24.0 `src/geo/lng_lat.ts` earthRadius. */
export const EARTH_RADIUS = 6371008.8;
const EARTH_CIRCUMFERENCE = 2 * Math.PI * EARTH_RADIUS;
const DEG = Math.PI / 180;
export const MAX_LATITUDE = 85.051129;

export type LngLat = { lng: number; lat: number };
export type Vec3 = [number, number, number];

export const mercatorX = (lng: number) => (180 + lng) / 360;
export const mercatorY = (lat: number) =>
	(180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2))) /
	360;
export const lngFromMercatorX = (x: number) => x * 360 - 180;
export const latFromMercatorY = (y: number) =>
	(360 / Math.PI) * Math.atan(Math.exp(((180 - y * 360) * Math.PI) / 180)) - 90;

/** Mercator units per meter at `lat` (MapLibre `meterInMercatorCoordinateUnits`). */
export const mercatorUnitsPerMeter = (lat: number) =>
	1 / EARTH_CIRCUMFERENCE / Math.cos(lat * DEG);

/** Writes the scene position of `point` (relative to the canvas `origin`) into `out`. */
export function geoToScene(
	point: LngLat,
	origin: LngLat,
	out: Vec3,
	altitude = 0,
): Vec3 {
	const s = mercatorUnitsPerMeter(origin.lat);
	out[0] = (mercatorX(point.lng) - mercatorX(origin.lng)) / s;
	out[1] = (altitude * mercatorUnitsPerMeter(point.lat)) / s; // MapLibre: z = alt / circumference(lat)
	out[2] = (mercatorY(point.lat) - mercatorY(origin.lat)) / s;
	return out;
}

/** Inverse of geoToScene (ground plane). */
export function sceneToGeo(
	x: number,
	z: number,
	origin: LngLat,
	out: LngLat,
): LngLat {
	const s = mercatorUnitsPerMeter(origin.lat);
	out.lng = lngFromMercatorX(mercatorX(origin.lng) + x * s);
	out.lat = latFromMercatorY(mercatorY(origin.lat) + z * s);
	return out;
}

/** Moves `from` by ground meters on the local tangent plane; writes into `out` (may alias). */
export function offsetByMeters(
	from: LngLat,
	east: number,
	north: number,
	out: LngLat,
): LngLat {
	const lat = from.lat + north / EARTH_RADIUS / DEG;
	const lng = from.lng + east / (EARTH_RADIUS * Math.cos(from.lat * DEG)) / DEG;
	out.lat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
	out.lng = ((((lng + 180) % 360) + 360) % 360) - 180;
	return out;
}

/** Local [east, north] ground meters from `origin` to `point` (city scale). Writes into `out`. */
export function metersBetween(
	origin: LngLat,
	point: LngLat,
	out: [number, number],
): [number, number] {
	out[0] =
		(point.lng - origin.lng) * DEG * EARTH_RADIUS * Math.cos(origin.lat * DEG);
	out[1] = (point.lat - origin.lat) * DEG * EARTH_RADIUS;
	return out;
}

/** Great-circle distance in meters (haversine). */
export function distanceMeters(a: LngLat, b: LngLat): number {
	const dLat = (b.lat - a.lat) * DEG;
	const dLng = (b.lng - a.lng) * DEG;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Screen-relative intent → world ground direction. `x` right, `y` up (unit disk), `bearing` is
 * the map bearing in degrees (clockwise from north at the top of the screen).
 * Writes [east, north] into `out`.
 */
export function screenToWorld(
	x: number,
	y: number,
	bearingDeg: number,
	out: [number, number],
): [number, number] {
	const b = bearingDeg * DEG;
	const cos = Math.cos(b);
	const sin = Math.sin(b);
	out[0] = x * cos + y * sin;
	out[1] = -x * sin + y * cos;
	return out;
}
