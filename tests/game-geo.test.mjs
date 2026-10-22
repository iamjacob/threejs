import assert from "node:assert/strict";
import { test } from "node:test";
import maplibre from "maplibre-gl"; // CommonJS build in Node; default import gives the namespace

const { MercatorCoordinate } = maplibre;
import {
	distanceMeters,
	geoToScene,
	metersBetween,
	offsetByMeters,
	sceneToGeo,
	screenToWorld,
} from "../src/game/core/geo.ts";

const HOME = { lng: 9.55368, lat: 55.707813 };
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b} (eps ${eps})`);

/**
 * Reproduces react-three-map 1.0.1's scene → map mapping (coordsToMatrix: translate to the origin's
 * MercatorCoordinate, scale by meterInMercatorCoordinateUnits with y flipped, rotate -90° about x).
 * A scene point (x, y, z) lands at mercator (ox + x·s, oy + z·s, oz + y·s). Using MapLibre's own
 * MercatorCoordinate makes this a contract test against the installed library versions.
 */
function sceneToMercator([x, y, z], origin) {
	const o = MercatorCoordinate.fromLngLat([origin.lng, origin.lat], 0);
	const s = o.meterInMercatorCoordinateUnits();
	return { x: o.x + x * s, y: o.y + z * s, z: y * s };
}

test("geoToScene lands on the exact map position MapLibre computes (near and far from origin)", () => {
	const points = [
		HOME,
		{ lng: 9.56, lat: 55.71 },
		{ lng: 9.60, lat: 55.66 }, // ~5 km
		{ lng: 10.21, lat: 56.157 }, // Aarhus, ~65 km
		{ lng: 12.568, lat: 55.676 }, // Copenhagen, ~190 km
	];
	const out = [0, 0, 0];
	for (const p of points) {
		const expected = MercatorCoordinate.fromLngLat([p.lng, p.lat], 0);
		const got = sceneToMercator(geoToScene(p, HOME, out), HOME);
		close(got.x, expected.x, 1e-12, `x for ${p.lng},${p.lat}`);
		close(got.y, expected.y, 1e-12, `y for ${p.lng},${p.lat}`);
	}
});

test("altitude maps to MapLibre's mercator z at the point's latitude", () => {
	const p = { lng: 9.6, lat: 55.66 };
	const expected = MercatorCoordinate.fromLngLat([p.lng, p.lat], 120);
	const got = sceneToMercator(geoToScene(p, HOME, [0, 0, 0], 120), HOME);
	close(got.z, expected.z, 1e-15, "z");
});

test("scene axes: east = +x, north = -z, ~meters at the origin", () => {
	const east = offsetByMeters(HOME, 100, 0, { lng: 0, lat: 0 });
	const north = offsetByMeters(HOME, 0, 100, { lng: 0, lat: 0 });
	const e = geoToScene(east, HOME, [0, 0, 0]);
	const n = geoToScene(north, HOME, [0, 0, 0]);
	close(e[0], 100, 0.05, "east x");
	close(e[2], 0, 1e-6, "east z");
	close(n[2], -100, 0.05, "north z");
	close(n[0], 0, 1e-6, "north x");
});

test("sceneToGeo inverts geoToScene", () => {
	const p = { lng: 9.6, lat: 55.66 };
	const [x, , z] = geoToScene(p, HOME, [0, 0, 0]);
	const back = sceneToGeo(x, z, HOME, { lng: 0, lat: 0 });
	close(back.lng, p.lng, 1e-12, "lng");
	close(back.lat, p.lat, 1e-12, "lat");
});

test("offsetByMeters / metersBetween / distance agree at city scale", () => {
	const p = offsetByMeters(HOME, 300, -400, { lng: 0, lat: 0 });
	const [east, north] = metersBetween(HOME, p, [0, 0]);
	close(east, 300, 1e-6, "east");
	close(north, -400, 1e-6, "north");
	close(distanceMeters(HOME, p), 500, 0.5, "haversine");
	const aliased = { ...HOME };
	offsetByMeters(aliased, 10, 0, aliased);
	assert.ok(aliased.lng > HOME.lng, "out may alias input");
});

test("screenToWorld: stick 'up' means up on screen for any map bearing", () => {
	const out = [0, 0];
	const cases = [
		// bearing, stick (x, y) → expected (east, north)
		[0, 0, 1, 0, 1],
		[0, 1, 0, 1, 0],
		[90, 0, 1, 1, 0], // map rotated: top of screen faces east
		[180, 0, 1, 0, -1],
		[-90, 0, 1, -1, 0],
		[90, 1, 0, 0, -1], // right on screen faces south
	];
	for (const [b, x, y, e, n] of cases) {
		screenToWorld(x, y, b, out);
		close(out[0], e, 1e-12, `east @${b}`);
		close(out[1], n, 1e-12, `north @${b}`);
	}
});
