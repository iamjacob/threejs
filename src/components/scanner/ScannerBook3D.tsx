import { Canvas, useFrame } from "@react-three/fiber";
import { Edges, OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import {
	DoubleSide,
	type Group,
	SRGBColorSpace,
	type Texture,
	TextureLoader,
} from "three";
import type { PhotoTag } from "./scanDrafts";
import type { CroppedFace } from "./scannedBook";
export type PreviewSide = "front" | "spine" | "back" | "page";
function Surface({
	image,
	width,
	height,
	depth = 0.016,
	onPick,
}: {
	image?: string;
	width: number;
	height: number;
	depth?: number;
	onPick: () => void;
}) {
	const [texture, setTexture] = useState<Texture | null>(null);
	useEffect(() => {
		let active = true;
		let loaded: Texture | undefined;
		setTexture(null);
		if (image)
			new TextureLoader().load(
				image,
				(t) => {
					loaded = t;
					if (!active) {
						t.dispose();
						return;
					}
					t.colorSpace = SRGBColorSpace;
					setTexture(t);
				},
				undefined,
				() => {},
			);
		return () => {
			active = false;
			loaded?.dispose();
		};
	}, [image]);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Three.js surface; equivalent keyboard photo controls sit outside the canvas.
		<mesh
			onClick={(event) => {
				event.stopPropagation();
				if (event.delta < 6) onPick();
			}}
		>
			<boxGeometry args={[width, height, depth]} />
			{texture ? (
				<meshStandardMaterial
					map={texture}
					roughness={0.55}
					side={DoubleSide}
				/>
			) : (
				<meshPhysicalMaterial
					color="#a9dcfa"
					transmission={0.65}
					transparent
					opacity={0.65}
					roughness={0.13}
					thickness={0.12}
					ior={1.4}
					metalness={0.08}
					clearcoat={1}
					side={DoubleSide}
				/>
			)}
			{!texture && <Edges color="#a9dfff" threshold={20} />}
		</mesh>
	);
}
function Model({
	faces,
	pageImage,
	side,
	onPart,
}: {
	faces: Partial<Record<"front" | "spine" | "back", CroppedFace>>;
	pageImage?: string;
	side: PreviewSide;
	onPart: (tag: PhotoTag) => void;
}) {
	const root = useRef<Group>(null),
		front = useRef<Group>(null),
		back = useRef<Group>(null);
	useFrame((_, delta) => {
		const ease = 1 - Math.exp(-Math.min(delta, 0.1) * 9);
		if (root.current) {
			root.current.rotation.y +=
				((side === "back"
					? Math.PI
					: side === "spine"
						? Math.PI / 2
						: side === "page"
							? 0.15
							: -0.4) -
					root.current.rotation.y) *
				ease;
		}
		if (front.current)
			front.current.rotation.y +=
				((side === "page" ? -0.95 : 0) - front.current.rotation.y) * ease;
		if (back.current)
			back.current.rotation.y +=
				((side === "page" ? 0.95 : 0) - back.current.rotation.y) * ease;
	});
	return (
		<group ref={root} rotation={[0.15, -0.4, 0]}>
			<group ref={front} position={[-0.5, 0, 0.085]}>
				<group position={[0.5, 0, 0]}>
					<Surface
						width={1}
						height={1.42}
						image={faces.front?.image}
						onPick={() => onPart("front")}
					/>
				</group>
			</group>
			<group ref={back} position={[-0.5, 0, -0.085]}>
				<group position={[0.5, 0, 0]} rotation={[0, Math.PI, 0]}>
					<Surface
						width={1}
						height={1.42}
						image={faces.back?.image}
						onPick={() => onPart("back")}
					/>
				</group>
			</group>
			<group position={[-0.505, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
				<Surface
					width={0.17}
					height={1.42}
					image={faces.spine?.image}
					onPick={() => onPart("spine")}
				/>
			</group>
			{Array.from({ length: 16 }, (_, i) => (
				<group
					// biome-ignore lint/suspicious/noArrayIndexKey: Fixed decorative leaves never change order.
 key={`leaf-${i}`}
					position={[-0.49, 0, 0.075 - i * 0.01]}
					rotation={[0, side === "page" ? (i < 8 ? -0.8 : 0.8) : 0, 0]}
				>
					<mesh position={[0.49, 0, 0]}>
						<boxGeometry args={[0.98, 1.37, 0.008]} />
						<meshStandardMaterial
							color="#e9e4d7"
							roughness={0.9}
							transparent
							opacity={side === "page" ? 1 : 0.48}
						/>
					</mesh>
				</group>
			))}
			{side === "page" && (
				<group position={[-0.49, 0, 0.085]} rotation={[0, -0.8, 0]}>
					<group position={[0.49, 0, 0.005]}>
						<Surface
							width={0.98}
							height={1.37}
							depth={0.003}
							image={pageImage}
							onPick={() => onPart("page")}
						/>
					</group>
				</group>
			)}
		</group>
	);
}
export default function ScannerBook3D(props: Parameters<typeof Model>[0]) {
	return (
		<div className="scan-three-book">
			<Canvas
				dpr={[1, 1.5]}
				camera={{ position: [0, 0.1, 3.7], fov: 37 }}
				fallback={
					<span>3D preview unavailable. Use the photo controls below.</span>
				}
			>
				<ambientLight intensity={1.8} />
				<directionalLight position={[3, 4, 5]} intensity={3} />
				<directionalLight
					position={[-3, 1, -2]}
					color="#78c7ff"
					intensity={2}
				/>
				<Model {...props} />
				<OrbitControls
					enablePan={false}
					enableZoom={false}
					minPolarAngle={0.6}
					maxPolarAngle={2.3}
				/>
			</Canvas>
		</div>
	);
}
