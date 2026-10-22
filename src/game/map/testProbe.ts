import type { Map as MapLibreMap } from "maplibre-gl";
import type { Object3D } from "three";
import { Vector3 } from "three";
import { HOME } from "../core/config.ts";
import { geoToScene, type LngLat } from "../core/geo.ts";
import {
	activeDriverCount,
	type MapPlayRuntime,
} from "../runtime/mapRuntime.ts";

/**
 * Opt-in diagnostics for tests/browser/map-play.mjs (VITE_BOOOKS_TEST_HOOKS=1 builds only).
 * Projects the *rendered* tornado (its actual Three.js world position, through the camera that
 * react-three-map synced from the map) and the player's lng/lat (through MapLibre's own
 * map.project) to screen pixels. If the coordinate conversion or camera sync is wrong, the two
 * diverge under pan/zoom/pitch/rotation.
 */
declare global {
	interface Window {
		__boooksMap?: MapLibreMap;
		__boooksMapProbe?: () => MapProbe | undefined;
	}
}

export type MapProbe = {
	styleLoaded: boolean;
	webgl: boolean;
	player: LngLat;
	mapCenter: LngLat;
	following: boolean;
	pauseReasons: readonly string[];
	drivers: number;
	entityPx: { x: number; y: number };
	playerPx: { x: number; y: number };
	screenCenter: { x: number; y: number };
	maxObservedSpeed: number;
};

export const testHooksEnabled = import.meta.env.VITE_BOOOKS_TEST_HOOKS === "1";

type Probe = {
	map?: MapLibreMap;
	runtime?: MapPlayRuntime;
	entity?: Object3D;
	camera?: { userData?: { projByView?: ArrayLike<number> } };
	maxSpeed: number;
};
const probe: Probe = { maxSpeed: 0 };
const v = new Vector3();

export function registerProbe(part: Partial<Omit<Probe, "maxSpeed">>) {
	if (!testHooksEnabled) return;
	Object.assign(probe, part);
	if (probe.runtime && "runtime" in part) probe.maxSpeed = 0;
	window.__boooksMap = probe.map;
	window.__boooksMapProbe = read;
}

/** Called from the render loop (test builds only) to record the top speed actually simulated. */
export function sampleSpeed() {
	if (!testHooksEnabled || !probe.runtime) return;
	const p = probe.runtime.loop.world.player;
	probe.maxSpeed = Math.max(
		probe.maxSpeed,
		Math.hypot(p.velocityEast, p.velocityNorth),
	);
}

function read(): MapProbe | undefined {
	const { map, runtime, entity, camera } = probe;
	if (!map || !runtime || !entity || !camera) return undefined;
	const canvas = map.getCanvas();
	const w = canvas.clientWidth;
	const h = canvas.clientHeight;
	// react-three-map's syncCamera stores scene → clip as camera.userData.projByView
	// (projectionMatrix alone is projByView·cameraMatrix and needs the view matrix too).
	entity.updateWorldMatrix(true, false);
	v.setFromMatrixPosition(entity.matrixWorld);
	const m = camera.userData?.projByView as ArrayLike<number> | undefined;
	if (!m) return undefined;
	const x = m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12];
	const y = m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13];
	const ww = m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15];
	const player = { ...runtime.loop.world.player.position };
	const projected = map.project([player.lng, player.lat]);
	const center = map.getCenter();
	// Sanity: the entity's scene position must equal geoToScene(player) (same single helper).
	const expected = geoToScene(
		runtime.renderPosition({ lng: 0, lat: 0 }),
		HOME,
		[0, 0, 0],
	);
	if (Math.hypot(expected[0] - v.x, expected[2] - v.z) > 0.5) {
		console.warn(
			"probe: entity scene position differs from geoToScene",
			expected,
			v,
		);
	}
	return {
		styleLoaded: map.isStyleLoaded() !== false,
		webgl: Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl")),
		player,
		mapCenter: { lng: center.lng, lat: center.lat },
		following: runtime.isFollowing,
		pauseReasons: runtime.loop.pauseReasons,
		drivers: activeDriverCount(),
		entityPx: { x: ((x / ww + 1) / 2) * w, y: ((1 - y / ww) / 2) * h },
		playerPx: { x: projected.x, y: projected.y },
		screenCenter: { x: w / 2, y: h / 2 },
		maxObservedSpeed: probe.maxSpeed,
	};
}
