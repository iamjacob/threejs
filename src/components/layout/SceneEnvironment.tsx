import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
	Color,
	DoubleSide,
	Group,
	Mesh,
	MeshBasicMaterial,
} from "three";
import {
	type EnvironmentMode,
	usePresentationStore,
} from "../../stores/usePresentationStore";

const BACKGROUNDS: Record<EnvironmentMode, string> = {
	library: "#07182c",
	castle: "#180b2e",
	forest: "#071d18",
	zen: "#8a9ba0",
};

function makeMaterial(color: string, opacity = 1) {
	return new MeshBasicMaterial({
		color,
		transparent: opacity < 1,
		opacity,
		depthWrite: false,
		side: DoubleSide,
	});
}

function CastleBackdrop({ opacity }: { opacity: number }) {
	const stone = useMemo(() => makeMaterial("#100d27", opacity), [opacity]);
	const windows = useMemo(() => makeMaterial("#ffc875", opacity), [opacity]);
	const towers = Array.from({ length: 12 }, (_, index) => {
		const angle = (index / 12) * Math.PI * 2;
		return [Math.sin(angle) * 28, -1.5, Math.cos(angle) * 28] as [number, number, number];
	});
	return (
		<group>
			{towers.map(([x, y, z], index) => (
				<group key={index} position={[x, y + (index % 2 ? 4 : 2.5), z]} rotation={[0, (index / 12) * Math.PI * 2, 0]}>
					<mesh material={stone}>
						<boxGeometry args={[3.2, index % 2 ? 8 : 5, 2]} />
					</mesh>
					<mesh position={[0, index % 2 ? 4.6 : 3.1, 0]} material={stone}>
						<coneGeometry args={[2.1, 2.4, 4]} />
					</mesh>
					{[-0.65, 0.65].map((windowX) => (
						<mesh key={windowX} position={[windowX, 0.7, -1.05]} material={windows}>
							<boxGeometry args={[0.25, 0.8, 0.04]} />
						</mesh>
					))}
				</group>
			))}
		</group>
	);
}

function CastleSky({ opacity }: { opacity: number }) {
	const moon = useMemo(() => makeMaterial("#fff0c2", opacity), [opacity]);
	const star = useMemo(() => makeMaterial("#fff7d1", opacity), [opacity]);
	const stars = useMemo(
		() =>
			Array.from({ length: 90 }, (_, index) => ({
				position: [
					Math.sin((index / 90) * Math.PI * 2) * (36 + (index % 5) * 3),
					((index * 29) % 18) + 4,
					Math.cos((index / 90) * Math.PI * 2) * (36 + (index % 5) * 3),
				] as [number, number, number],
				scale: 0.015 + (index % 4) * 0.012,
			})),
		[],
	);
	return (
		<group>
			<mesh position={[9, 9, -25]} material={moon}>
				<sphereGeometry args={[2.2, 24, 16]} />
			</mesh>
			{stars.map((item) => (
				<mesh key={item.position.join(":")} position={item.position} scale={item.scale} material={star}>
					<sphereGeometry args={[1, 8, 8]} />
				</mesh>
			))}
		</group>
	);
}

function ForestBackdrop({ opacity }: { opacity: number }) {
	const trunk = useMemo(() => makeMaterial("#07150f", opacity), [opacity]);
	const leaves = useMemo(() => makeMaterial("#0d3929", opacity), [opacity]);
	return (
		<group>
			{Array.from({ length: 16 }, (_, index) => {
				const angle = (index / 16) * Math.PI * 2;
				const radius = 23 + (index % 3) * 3;
				const x = Math.sin(angle) * radius;
				const z = Math.cos(angle) * radius;
				const height = 5 + (index % 4) * 1.8;
				return (
					<group key={index} position={[x, height / 2, z]} rotation={[0, angle, 0]}>
						<mesh material={trunk}>
							<cylinderGeometry args={[0.35, 0.6, height, 7]} />
						</mesh>
						<mesh position={[0, height / 2 + 1.3, 0]} material={leaves}>
							<coneGeometry args={[2.8, 5, 8]} />
						</mesh>
					</group>
				);
			})}
		</group>
	);
}

function ZenBackdrop({ opacity }: { opacity: number }) {
	const colors = ["#40545d", "#60777b", "#9cafad"];
	return (
		<group>
			{colors.map((color, index) => (
				<mesh key={color} position={[0, index * 2.1 - 2, -24 - index * 2]} material={makeMaterial(color, opacity)}>
					<coneGeometry args={[14 - index * 2, 5, 7]} />
				</mesh>
			))}
			{Array.from({ length: 8 }, (_, index) => {
				const angle = (index / 8) * Math.PI * 2;
				return (
					<mesh key={index} position={[Math.sin(angle) * 25, 0, Math.cos(angle) * 25]} rotation={[0, angle, 0]} material={makeMaterial(colors[index % colors.length], opacity)}>
						<coneGeometry args={[10, 5, 7]} />
					</mesh>
				);
			})}
			<mesh position={[5, 7, -25]} material={makeMaterial("#ffe5bd", opacity)}>
				<sphereGeometry args={[1.8, 24, 16]} />
			</mesh>
		</group>
	);
}

export default function SceneEnvironment() {
	const { scene } = useThree();
	const environment = usePresentationStore((state) => state.environment);
	const root = useRef<Group>(null);
	const opacity = useRef(1);

	useEffect(() => {
		scene.background = new Color(BACKGROUNDS[environment]);
		opacity.current = 0;
	}, [environment, scene]);

	useFrame((_, delta) => {
		if (!root.current) return;
		opacity.current = Math.min(1, opacity.current + delta * 1.8);
		root.current.position.set(0, -2, 0);
		root.current.traverse((object) => {
			const mesh = object as Mesh;
			if (!mesh.isMesh) return;
			const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
			materials.forEach((currentMaterial) => {
				if (currentMaterial.transparent) currentMaterial.opacity = opacity.current;
			});
		});
	});

	return (
		<group ref={root} name="environment-backdrop" renderOrder={-1000}>
			{environment === "castle" && <><CastleBackdrop opacity={1} /><CastleSky opacity={1} /></>}
			{environment === "forest" && <ForestBackdrop opacity={1} />}
			{environment === "zen" && <ZenBackdrop opacity={1} />}
		</group>
	);
}
