import { Html } from "@react-three/drei";
import { type ThreeEvent, useLoader, useThree } from "@react-three/fiber";
import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	DoubleSide,
	type Group,
	SRGBColorSpace,
	type Texture,
	TextureLoader,
	Vector3,
} from "three";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { createBookDragGesture } from "../../lib/shelfDrag";
import { createShelfDragProjector } from "./shelfDragGeometry";

const FRAME_TEXTURES = [
	"/experience/shelf/Wood051_1K-JPG_Color.webp",
	"/experience/shelf/Wood051_1K-JPG_NormalGL.webp",
	"/experience/shelf/Wood051_1K-JPG_Roughness.webp",
];

export default function PictureFrame() {
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	const [imageTexture, setImageTexture] = useState<Texture | null>(null);
	const input = useRef<HTMLInputElement>(null);
	const frame = useRef<Group>(null);
	const { camera, gl } = useThree();
	const drag = useRef<{
		pointerId: number;
		start: { x: number; y: number };
		anchor: [number, number, number];
		project: ReturnType<typeof createShelfDragProjector>;
		release: () => void;
	} | null>(null);
	const [position, setPosition] = useState<[number, number, number]>([
		7.4, 0.25, 0,
	]);
	const [woodColor, woodNormal, woodRoughness] = useLoader(
		TextureLoader,
		FRAME_TEXTURES.map((path) => publicAssetUrl(path)),
	);
	const gesture = useRef(
		createBookDragGesture({
			onStart: () => undefined,
			onMove: () => undefined,
			onEnd: () => undefined,
		}),
	).current;

	useEffect(() => {
		const move = (event: PointerEvent) => {
			const active = drag.current;
			if (!active || active.pointerId !== event.pointerId) return;
			gesture.move(event);
			if (
				Math.hypot(
					event.clientX - active.start.x,
					event.clientY - active.start.y,
				) < 6
			)
				return;
			const delta = active.project(event);
			if (!delta) return;
			setPosition([
				active.anchor[0] + delta.x,
				active.anchor[1] + delta.y,
				Math.min(0.45, Math.hypot(delta.x, delta.y) * 0.25),
			]);
		};
		const end = (event: PointerEvent) => {
			if (!drag.current || drag.current.pointerId !== event.pointerId) return;
			gesture.end(event);
			const active = drag.current;
			drag.current = null;
			active.release();
			gl.domElement.style.cursor = "";
		};
		window.addEventListener("pointermove", move, true);
		window.addEventListener("pointerup", end, true);
		window.addEventListener("pointercancel", end, true);
		return () => {
			gesture.cancel();
			drag.current?.release();
			drag.current = null;
			window.removeEventListener("pointermove", move, true);
			window.removeEventListener("pointerup", end, true);
			window.removeEventListener("pointercancel", end, true);
		};
	}, [gl, gesture]);

	useEffect(() => {
		if (!imageUrl) {
			setImageTexture(null);
			return;
		}
		let active = true;
		new TextureLoader().load(imageUrl, (texture) => {
			if (!active) {
				texture.dispose();
				return;
			}
			texture.colorSpace = SRGBColorSpace;
			setImageTexture(texture);
		});
		return () => {
			active = false;
		};
	}, [imageUrl]);

	useEffect(() => {
		return () => {
			if (imageUrl) URL.revokeObjectURL(imageUrl);
		};
	}, [imageUrl]);
	useEffect(() => {
		return () => imageTexture?.dispose();
	}, [imageTexture]);

	const selectImage = (file: File | undefined) => {
		if (!file?.type.startsWith("image/")) return;
		if (imageUrl) URL.revokeObjectURL(imageUrl);
		setImageUrl(URL.createObjectURL(file));
	};
	// A6 opening: 10.5 x 14.8 cm at the shelf's 30 cm world scale.
	const openingWidth = 0.34;
	const openingHeight = 0.48;
	const border = 0.056;
	const frameWidth = openingWidth + border * 2;
	const frameHeight = openingHeight + border * 2;
	const depth = 0.072;
	const wood = {
		map: woodColor,
		normalMap: woodNormal,
		roughnessMap: woodRoughness,
	};

	return (
		<group
			ref={frame}
			position={position}
			rotation={[0, -Math.PI / 2, -0.06]}
			name="merch-picture-frame"
			onPointerDown={(event: ThreeEvent<PointerEvent>) => {
				if (!event.nativeEvent.isPrimary || event.button !== 0) return;
				const rect = gl.domElement.getBoundingClientRect();
				if (!gesture.start(event.nativeEvent)) return;
				event.stopPropagation();
				drag.current = {
					pointerId: event.pointerId,
					start: {
						x: event.clientX,
						y: event.clientY,
					},
					anchor: position,
					project: createShelfDragProjector(
						camera,
						rect,
						new Vector3(...position),
						event.nativeEvent,
					),
					release: () => {
						if (gl.domElement.hasPointerCapture(event.pointerId))
							gl.domElement.releasePointerCapture(event.pointerId);
					},
				};
				gl.domElement.setPointerCapture(event.pointerId);
				gl.domElement.style.cursor = "grabbing";
			}}
		>
			{[
				[0, frameHeight / 2 - border / 2, frameWidth, border],
				[0, -frameHeight / 2 + border / 2, frameWidth, border],
				[-frameWidth / 2 + border / 2, 0, border, frameHeight],
				[frameWidth / 2 - border / 2, 0, border, frameHeight],
			].map(([x, y, width, height]) => (
				<mesh key={`${x}-${y}`} position={[x, y, 0]} castShadow>
					<boxGeometry args={[width, height, depth]} />
					<meshStandardMaterial {...wood} />
				</mesh>
			))}
			<mesh position={[0, 0, depth / 2 + 0.002]}>
				<planeGeometry args={[openingWidth, openingHeight]} />
				<meshBasicMaterial
					map={imageTexture ?? undefined}
					color={imageTexture ? "#ffffff" : "#c7a878"}
					side={DoubleSide}
				/>
			</mesh>
			<Html position={[0, -frameHeight / 2 - 0.12, depth / 2]} center>
				<button
					type="button"
					className="picture-frame-upload"
					onClick={() => input.current?.click()}
					aria-label="Choose an image for the picture frame"
				>
					<ImagePlus size={13} aria-hidden="true" />
					<span>{imageTexture ? "Change image" : "Add image"}</span>
				</button>
				<input
					ref={input}
					type="file"
					accept="image/*"
					hidden
					onChange={(event) => {
						selectImage(event.target.files?.[0]);
						event.currentTarget.value = "";
					}}
				/>
			</Html>
		</group>
	);
}
