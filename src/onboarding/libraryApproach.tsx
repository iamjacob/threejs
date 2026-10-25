import { Stats } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { Color, type Group } from "three";
import RenderStats from "../components/layout/RenderStats";
import SceneEnvironment from "../components/layout/SceneEnvironment";
import { SceneScreenshot } from "../components/layout/SceneScreenshot";
import ShaderWarmup from "../components/layout/ShaderWarmup";
import Lightning from "../components/lightning/Lightning";
import { currentShelfArcFraction } from "../components/shelves/useShelfArc";
import TourCamera from "../components/tour/TourCamera";
import TourDirector from "../components/tour/TourDirector";
import TourScene from "../components/tour/TourScene";
import { useBookStore } from "../stores/useBookStore";
import { useTourStore } from "../stores/useTourStore";
import { LIBRARY_CLEAR, libraryRestPose } from "./libraryPose";
import { journeySession, libraryHostHandlers } from "./session";

function downloadScreenshot(dataUrl: string) {
	const link = document.createElement("a");
	link.href = dataUrl;
	link.download = `boooks-shelf-${Date.now()}.png`;
	link.click();
}

function tallestBook() {
	let tallest = 0;
	for (const book of useBookStore.getState().books) {
		const height = book.dimensions[1] ?? 0;
		if (height > tallest) tallest = height;
	}
	return tallest;
}

/**
 * The real shelves, carried in front of the tunnel. They stay mounted for the
 * whole flight so the hand-off does not suspend them again and flash empty.
 */
export function LibraryApproach({ library }: { library: boolean }) {
	const group = useRef<Group>(null);
	useLayoutEffect(() => {
		const groupNode = group.current;
		if (!library || !groupNode) return;
		groupNode.visible = true;
		groupNode.position.set(0, 0, 0);
		groupNode.quaternion.identity();
		groupNode.scale.set(1, 1, 1);
	}, [library]);
	useFrame(() => {
		const groupNode = group.current;
		if (!groupNode) return;
		// Restate the settled pose every frame. A later render must not hide it.
		if (library) {
			groupNode.visible = true;
			groupNode.position.set(0, 0, 0);
			groupNode.quaternion.identity();
			return;
		}
		const arrival = journeySession.arrival;
		const position = arrival.anchorPosition;
		const quaternion = arrival.anchorQuaternion;
		if (!position || !quaternion || arrival.progress <= 0.02) {
			groupNode.visible = false;
			return;
		}
		groupNode.visible = true;
		groupNode.position.set(position[0], position[1], position[2]);
		groupNode.quaternion.set(
			quaternion[0],
			quaternion[1],
			quaternion[2],
			quaternion[3],
		);
	});
	return (
		<group ref={group} name="library-approach">
			<LibraryReady />
			<Suspense fallback={null}>
				<TourScene />
				<Lightning />
			</Suspense>
		</group>
	);
}

function LibraryReady() {
	const ready = useTourStore((state) => state.ready);
	useEffect(() => {
		const stage = document.getElementById("boooks-stage");
		if (stage) stage.dataset.libraryReady = ready ? "true" : "false";
	}, [ready]);
	return null;
}

/** Paint the library clear colour and resting camera before the browser does. */
function LibraryHandoffFrame() {
	const { camera, scene, gl, size } = useThree();
	useLayoutEffect(() => {
		const pose = libraryRestPose(
			size.width / Math.max(1, size.height),
			tallestBook(),
			size.width < 768,
			currentShelfArcFraction(),
		);
		camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
		camera.up.set(0, 1, 0);
		camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
		if (
			"fov" in camera &&
			"near" in camera &&
			"updateProjectionMatrix" in camera
		) {
			camera.fov = pose.fov;
			camera.near = 0.01;
			camera.far = 500;
			camera.updateProjectionMatrix();
		}
		scene.background = new Color(LIBRARY_CLEAR);
		scene.fog = null;
		gl.setClearColor(LIBRARY_CLEAR);
	}, [camera, gl, scene, size.height, size.width]);
	return null;
}

export function LiveLibrary({ showStats }: { showStats: boolean }) {
	return (
		<>
			<LibraryHandoffFrame />
			<Suspense fallback={null}>
				<SceneEnvironment />
				<ShaderWarmup />
			</Suspense>
			<TourCamera skipEntrance />
			<TourDirector />
			<SceneScreenshot
				onCaptured={(dataUrl) => {
					downloadScreenshot(dataUrl);
					libraryHostHandlers.onScreenshot();
				}}
			/>
			{showStats ? <Stats /> : null}
			{showStats ? <RenderStats /> : null}
		</>
	);
}
