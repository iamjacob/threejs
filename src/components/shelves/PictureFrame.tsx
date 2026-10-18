import { Html } from "@react-three/drei";
import { type ThreeEvent, useLoader, useThree } from "@react-three/fiber";
import { ImagePlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { SHELF_RADIUS, shelfSlotPose } from "./shelfArrangement";
import { createShelfDragProjector } from "./shelfDragGeometry";

const FRAME_TEXTURES = [
	"/experience/shelf/Wood051_1K-JPG_Color.webp",
	"/experience/shelf/Wood051_1K-JPG_NormalGL.webp",
	"/experience/shelf/Wood051_1K-JPG_Roughness.webp",
];

// A6 opening: 10.5 x 14.8 cm at the shelf's 30 cm world scale.
const openingWidth = 0.34;
const openingHeight = 0.48;
const border = 0.056;
const frameWidth = openingWidth + border * 2;
const frameHeight = openingHeight + border * 2;
const depth = 0.072;

/**
 * Stands on a shelf like one more book, facing the viewer. `shelf` and `angle`
 * come from `pictureFrameSlot`; dragging slides it along that shelf's arc.
 */
export default function PictureFrame({
	shelf,
	angle,
}: {
	shelf: number;
	angle: number;
}) {
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	const [imageTexture, setImageTexture] = useState<Texture | null>(null);
	const input = useRef<HTMLInputElement>(null);
	const frame = useRef<Group>(null);
	const { camera, gl } = useThree();
	const drag = useRef<{
		pointerId: number;
		start: { x: number; y: number };
		anchorAngle: number;
		project: ReturnType<typeof createShelfDragProjector>;
		release: () => void;
	} | null>(null);
	// Manual slide along the arc, relative to the computed slot.
	const [offsetAngle, setOffsetAngle] = useState(0);
	const [lift, setLift] = useState(0);
	const pose = useMemo(
		() => shelfSlotPose(shelf, angle + offsetAngle, frameHeight),
		[shelf, angle, offsetAngle],
	);
	const position: [number, number, number] = [
		pose.position[0],
		pose.position[1] + lift,
		pose.position[2],
	];
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
			// World +x runs along the arc toward decreasing shelf angle
			// (the shelf group is rotated 90° about Y).
			setOffsetAngle(active.anchorAngle - delta.x / SHELF_RADIUS);
			setLift(Math.min(0.08, Math.hypot(delta.x, delta.y) * 0.08));
		};
		const end = (event: PointerEvent) => {
			if (!drag.current || drag.current.pointerId !== event.pointerId) return;
			gesture.end(event);
			const active = drag.current;
			drag.current = null;
			active.release();
			setLift(0);
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
	const wood = {
		map: woodColor,
		normalMap: woodNormal,
		roughnessMap: woodRoughness,
	};

	return (
		<group
			ref={frame}
			position={position}
			rotation={pose.rotation}
			name="merch-picture-frame"
			onPointerDown={(event: ThreeEvent<PointerEvent>) => {
				if (!event.nativeEvent.isPrimary || event.button !== 0) return;
				const rect = gl.domElement.getBoundingClientRect();
				if (!gesture.start(event.nativeEvent)) return;
				event.stopPropagation();
				const world = frame.current
					? frame.current.getWorldPosition(new Vector3())
					: new Vector3(...position);
				drag.current = {
					pointerId: event.pointerId,
					start: {
						x: event.clientX,
						y: event.clientY,
					},
					anchorAngle: offsetAngle,
					project: createShelfDragProjector(
						camera,
						rect,
						world,
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
