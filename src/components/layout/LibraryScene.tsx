import { Stats } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { currentRenderQuality } from "../../lib/renderQuality";
import Lightning from "../lightning/Lightning";
import TourCamera from "../tour/TourCamera";
import TourDirector from "../tour/TourDirector";
import TourScene from "../tour/TourScene";
import RenderStats from "./RenderStats";
import SceneEnvironment from "./SceneEnvironment";
import { SceneScreenshot } from "./SceneScreenshot";
import ShaderWarmup from "./ShaderWarmup";

const renderQuality = currentRenderQuality();

function downloadScreenshot(dataUrl: string) {
	const link = document.createElement("a");
	link.href = dataUrl;
	link.download = `boooks-shelf-${Date.now()}.png`;
	link.click();
}

/**
 * The 3D library. Mounted immediately so WebGL setup, shelf textures and the
 * cover atlas load in parallel with IndexedDB hydration; the wrapper stays
 * hidden behind the loader until the first full scene is ready.
 */
export default function LibraryScene({
	visible,
	paused,
	interactive,
	stage,
	showStats,
	onScreenshot,
}: {
	visible: boolean;
	paused: boolean;
	interactive: boolean;
	stage: string;
	showStats: boolean;
	onScreenshot: () => void;
}) {
	return (
		<div
			className={`fixed inset-0 transition-opacity duration-700 ease-out ${
				visible ? "opacity-100" : "opacity-0"
			}`}
			data-scene={stage}
			inert={!interactive}
			aria-hidden={!interactive}
		>
			<Canvas
				frameloop={paused ? "never" : "always"}
				shadows={renderQuality.shadows ? "percentage" : false}
				dpr={renderQuality.dpr}
				// A transparent canvas forces per-frame page compositing and locks many
				// phones to 30 fps; the scene paints its own background instead.
				gl={{ alpha: false, powerPreference: "high-performance" }}
				camera={{ position: [0, 4, 8], fov: 45, near: 0.01, far: 500 }}
			>
				<Suspense fallback={null}>
					<SceneEnvironment />
					<TourScene />
					<Lightning />
					<ShaderWarmup />
				</Suspense>
				<TourCamera />
				<TourDirector />
				<SceneScreenshot
					onCaptured={(dataUrl) => {
						downloadScreenshot(dataUrl);
						onScreenshot();
					}}
				/>
				{showStats && <Stats />}
				{showStats && <RenderStats />}
			</Canvas>
		</div>
	);
}
