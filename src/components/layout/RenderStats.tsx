import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useState } from "react";
import { currentRenderQuality } from "../../lib/renderQuality";
import { useLevelStore } from "../../stores/useLevelStore";

const quality = currentRenderQuality();

type Snapshot = {
	fps: number;
	frameMs: number;
	calls: number;
	triangles: number;
	geometries: number;
	textures: number;
	programs: number;
};

/**
 * Renderer counters for optimisation work. Mount alongside drei's <Stats />;
 * values update twice per second so the overlay itself stays cheap.
 */
export default function RenderStats() {
	const gl = useThree((state) => state.gl);
	const level = useLevelStore((state) => state.libraryLevel);
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const frames = useRef(0);
	const elapsed = useRef(0);
	const worst = useRef(0);
	useFrame((_, delta) => {
		frames.current += 1;
		elapsed.current += delta;
		worst.current = Math.max(worst.current, delta);
		if (elapsed.current < 0.5) return;
		const { render, memory, programs } = gl.info;
		setSnapshot({
			fps: frames.current / elapsed.current,
			frameMs: worst.current * 1000,
			calls: render.calls,
			triangles: render.triangles,
			geometries: memory.geometries,
			textures: memory.textures,
			programs: programs?.length ?? 0,
		});
		frames.current = 0;
		elapsed.current = 0;
		worst.current = 0;
	});
	if (!snapshot) return null;
	return (
		<Html fullscreen style={{ pointerEvents: "none" }} zIndexRange={[100, 0]}>
			<pre
				data-testid="render-stats"
				style={{
					position: "absolute",
					top: 56,
					left: 0,
					margin: 0,
					padding: "6px 8px",
					font: "11px/1.4 ui-monospace, monospace",
					color: "#9f9",
					background: "rgba(0,0,0,.65)",
				}}
			>
				{`level ${level}  tier ${quality.tier}  dpr ${gl.getPixelRatio().toFixed(2)}  shadows ${quality.shadows ? "on" : "off"}
fps        ${snapshot.fps.toFixed(0)}  (worst ${snapshot.frameMs.toFixed(1)} ms)
draw calls ${snapshot.calls}
triangles  ${snapshot.triangles.toLocaleString()}
geometries ${snapshot.geometries}
textures   ${snapshot.textures}
programs   ${snapshot.programs}`}
			</pre>
		</Html>
	);
}
