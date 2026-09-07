import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect } from "react";
import Dissolve from "./Dissolve";
import DissolveController from "./DissolveController";

const Page = () => {
	useEffect(() => {
		const splash = document.getElementById("splash");

		if (!splash) return;

		splash.classList.add("fade-out");
		const timeout = window.setTimeout(() => splash.remove(), 1200);

		return () => window.clearTimeout(timeout);
	}, []);

	return (
		<div className="relative h-screen w-full bg-gray-900">
			<DissolveController />

			<Canvas
				camera={{ position: [0, 0, 5], fov: 75 }}
				gl={{ antialias: true }}
			>
				<ambientLight intensity={0.3} />
				<directionalLight
					position={[5, 5, 5]}
					intensity={0.8}
					castShadow
					shadow-mapSize-width={1024}
					shadow-mapSize-height={1024}
				/>
				<pointLight position={[10, 10, 10]} intensity={0.6} color="#ffaa44" />
				<pointLight
					position={[-10, -10, -10]}
					color="#4488ff"
					intensity={0.4}
				/>
				<pointLight position={[0, -5, 0]} color="#ff4400" intensity={0.3} />
				<fog attach="fog" args={["#1a1a1a", 8, 20]} />

				<Dissolve />

				<OrbitControls
					enablePan
					enableZoom
					enableRotate
					minDistance={2}
					maxDistance={10}
					enableDamping
					dampingFactor={0.05}
				/>
			</Canvas>
		</div>
	);
};

export default Page;
