import type { Map as MapLibreMap } from "maplibre-gl";
import type { InstancedMesh, Object3D } from "three";
import { Matrix4, Vector3 } from "three";
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
	/** Books in the rendered tornado: active profile id, book ids, and how each cover resolved. */
	library?: { profileId: string; sources: string[]; ids: string[] };
	/** Rendered tornado: instanced meshes under the entity and their total instance count. */
	booksMeshes: number;
	booksInstances: number;
	/** Largest instance distance from the tornado axis / height, from the live instance matrices. */
	booksMaxRadius: number;
	booksMaxHeight: number;
};

export const testHooksEnabled = import.meta.env.VITE_BOOOKS_TEST_HOOKS === "1";

type Probe = {
	library?: { profileId: string; sources: string[]; ids: string[] };
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
		library: probe.library,
		...countBookMeshes(entity),
	};
}

function countBookMeshes(entity: Object3D) {
	let booksMeshes = 0;
	let booksInstances = 0;
	let booksMaxRadius = 0;
	let booksMaxHeight = 0;
	const m4 = new Matrix4();
	const p = new Vector3();
	entity.traverse((o) => {
		const m = o as InstancedMesh;
		if (m.isInstancedMesh && o.name === "tornado-books") {
			booksMeshes++;
			booksInstances += m.count;
			// Actual instance matrices on the GPU-bound mesh, so "all books at the origin" is caught.
			for (let i = 0; i < m.count; i++) {
				m.getMatrixAt(i, m4);
				p.setFromMatrixPosition(m4);
				booksMaxRadius = Math.max(booksMaxRadius, Math.hypot(p.x, p.z));
				booksMaxHeight = Math.max(booksMaxHeight, p.y);
			}
		}
	});
	return { booksMeshes, booksInstances, booksMaxRadius, booksMaxHeight };
}
