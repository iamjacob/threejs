import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import MapGL, { type MapRef } from "react-map-gl/maplibre";
import { Canvas } from "react-three-map/maplibre";
import BoooksController from "../../components/layout/BoooksController";
import { useMapPlayStore } from "../../stores/useMapPlayStore";
import { HOME, HOME_VIEW } from "../core/config.ts";
import { MAP_PLAY_ACTIONS, MapPlayHud } from "./MapPlayHud";
import { OFFLINE_MAP_STYLE, polishMap, REMOTE_MAP_STYLE } from "./mapStyle";
import { HomeMarker, TornadoPlayer } from "./TornadoPlayer";
import { registerProbe } from "./testProbe";
import { useMapPlayRuntime } from "./useMapPlayRuntime";

const STYLE_TIMEOUT_MS = 8000;

/**
 * Map play surface: MapLibre map + react-three-map canvas + the existing BoooksController joystick.
 * Flow: joystick → `steer` command → GameLoop → TornadoPlayer reads the runtime each frame.
 */
export default function MapPlay() {
	const mapRef = useRef<MapRef>(null);
	const runtime = useMapPlayRuntime();
	const paused = useMapPlayStore((s) => s.paused);
	const [mapStyle, setMapStyle] = useState<string | StyleSpecification>(
		REMOTE_MAP_STYLE,
	);

	const goOffline = useCallback(() => {
		setMapStyle(OFFLINE_MAP_STYLE);
		useMapPlayStore.getState().setMapMode("offline");
	}, []);

	// Offline first launch: if the remote style never loads, use the bundled one.
	useEffect(() => {
		if (mapStyle !== REMOTE_MAP_STYLE) return;
		const timer = setTimeout(() => {
			if (!mapRef.current?.getMap().isStyleLoaded()) goOffline();
		}, STYLE_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [mapStyle, goOffline]);

	const attachCamera = useCallback(() => {
		const map = mapRef.current?.getMap();
		if (!map || !runtime) return;
		runtime.attachCamera({
			getBearing: () => map.getBearing(),
			jumpTo: (c) => map.jumpTo({ center: [c.lng, c.lat] }),
		});
	}, [runtime]);
	useEffect(() => {
		attachCamera();
		return () => runtime?.attachCamera(undefined);
	}, [attachCamera, runtime]);

	const onAction = useCallback(
		(id: string, on?: boolean) => {
			if (!runtime) return;
			if (id === "play") {
				if (on) runtime.loop.pause("user");
				else runtime.loop.resume("user");
			}
			if (id === "follow") {
				runtime.setFollowing(true);
				useMapPlayStore.getState().setFollowing(true);
			}
		},
		[runtime],
	);

	return (
		<main
			className="fixed inset-0 overflow-hidden bg-[#dfe4df]"
			data-testid="map-play"
		>
			<div
				aria-hidden="true"
				className="absolute inset-0"
				style={{
					background:
						"linear-gradient(180deg,#b7d8ff 0%,#dce9f1 40%,#f5eee3 100%)",
				}}
			/>
			<MapGL
				ref={mapRef}
				initialViewState={{
					...HOME_VIEW,
					latitude: HOME.lat,
					longitude: HOME.lng,
				}}
				mapStyle={mapStyle}
				maxPitch={75}
				// Zoom/rotate gestures stay anchored on the followed tornado at screen center.
				scrollZoom={{ around: "center" }}
				touchZoomRotate={{ around: "center" }}
				style={{ position: "absolute", inset: 0 }}
				onLoad={(e) => {
					polishMap(e.target);
					attachCamera();
					registerProbe({ map: e.target });
				}}
				onError={() => {
					if (mapStyle === REMOTE_MAP_STYLE) goOffline();
				}}
				onDragStart={() => {
					// A user pan detaches the camera; the "follow" action re-attaches it.
					runtime?.setFollowing(false);
					useMapPlayStore.getState().setFollowing(false);
				}}
			>
				{runtime && (
					<Canvas latitude={HOME.lat} longitude={HOME.lng} frameloop="always">
						<hemisphereLight args={["#fff8ea", "#5b2730", 2.1]} />
						<directionalLight
							color="#fff3df"
							intensity={2.4}
							position={[12, 34, 18]}
						/>
						<HomeMarker at={HOME} origin={HOME} />
						<TornadoPlayer runtime={runtime} origin={HOME} />
					</Canvas>
				)}
			</MapGL>
			<MapPlayHud />
			<BoooksController
				actions={MAP_PLAY_ACTIONS}
				storageKey="boooks-dock-map"
				activeToggles={{ play: paused }}
				onAction={onAction}
				onJoystick={(input) =>
					runtime?.loop.dispatch({ type: "steer", x: input.x, y: input.y })
				}
			/>
		</main>
	);
}
