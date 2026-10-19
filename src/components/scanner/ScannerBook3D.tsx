import { Edges, Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	DoubleSide,
	type Group,
	Plane,
	Raycaster,
	SRGBColorSpace,
	type Texture,
	TextureLoader,
	Vector2,
	Vector3,
} from "three";
import {
	BOOK_SIZE_LIMITS_CM,
	type BookSizeCm,
	CM_PER_WORLD_UNIT,
	formatMeasurement,
} from "../../stores/useBookSizeStore";
import type { PhotoTag } from "./scanDrafts";
import type { CroppedFace } from "./scannedBook";

export type PreviewSide = "front" | "spine" | "back" | "page";
type Axis = keyof BookSizeCm;
type Unit = "cm" | "in";

const LIMITS = BOOK_SIZE_LIMITS_CM;
/** Scene units match the shelf: 30 cm per unit. */
const CM = 1 / CM_PER_WORLD_UNIT;

function axisVector(axis: Axis) {
	return axis === "height"
		? new Vector3(0, 1, 0)
		: axis === "width"
			? new Vector3(1, 0, 0)
			: new Vector3(0, 0, 1);
}

function Surface({
	image,
	width,
	height,
	onPick,
}: {
	image?: string;
	width: number;
	height: number;
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
				(value) => {
					loaded = value;
					value.colorSpace = SRGBColorSpace;
					if (active) setTexture(value);
					else value.dispose();
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
		// biome-ignore lint/a11y/noStaticElementInteractions: Three.js mesh; keyboard-equivalent controls live outside the canvas.
		<mesh
			onClick={(event) => {
				event.stopPropagation();
				if (event.delta < 6) onPick();
			}}
		>
			<boxGeometry args={[width, height, 0.015]} />
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
					opacity={0.64}
					roughness={0.15}
					side={DoubleSide}
				/>
			)}
			{!texture && <Edges color="#a9dfff" threshold={20} />}
		</mesh>
	);
}

function Rulers({
	width,
	height,
	depth,
	unit,
	day,
}: {
	width: number;
	height: number;
	depth: number;
	unit: Unit;
	day: boolean;
}) {
	const positions = useMemo(() => {
		const vertices: number[] = [];
		const stepCm = unit === "cm" ? 0.5 : 2.54 / 8;
		const majorEvery = unit === "cm" ? 2 : 8;
		const ruler = (
			start: Vector3,
			end: Vector3,
			normal: Vector3,
			lengthCm: number,
		) => {
			vertices.push(...start.toArray(), ...end.toArray());
			const count = Math.floor(lengthCm / stepCm);
			for (let index = 0; index <= count; index++) {
				const point = start
					.clone()
					.lerp(end, Math.min(1, (index * stepCm) / lengthCm));
				const tick =
					index % majorEvery === 0 ? 0.032 : index % 2 === 0 ? 0.021 : 0.012;
				vertices.push(
					...point.toArray(),
					...point.addScaledVector(normal, tick).toArray(),
				);
			}
		};
		ruler(
			new Vector3(width / 2 + 0.075, 0, depth / 2 + 0.06),
			new Vector3(width / 2 + 0.075, height, depth / 2 + 0.06),
			new Vector3(1, 0, 0),
			height / CM,
		);
		ruler(
			new Vector3(-width / 2, -0.05, depth / 2 + 0.07),
			new Vector3(width / 2, -0.05, depth / 2 + 0.07),
			new Vector3(0, 0, 1),
			width / CM,
		);
		ruler(
			new Vector3(-width / 2 - 0.075, -0.05, depth / 2),
			new Vector3(-width / 2 - 0.075, -0.05, -depth / 2),
			new Vector3(-1, 0, 0),
			depth / CM,
		);
		return new Float32Array(vertices);
	}, [width, height, depth, unit]);
	return (
		<>
			<lineSegments>
				<bufferGeometry>
					<bufferAttribute attach="attributes-position" args={[positions, 3]} />
				</bufferGeometry>
				<lineBasicMaterial
					color={day ? "#675a42" : "#c5b17e"}
					transparent
					opacity={0.86}
				/>
			</lineSegments>
			<Html
				position={[width / 2 + 0.16, height / 2, depth / 2 + 0.065]}
				center
				className="scan-ruler-label"
			>
				{formatMeasurement(height / CM, unit)}
			</Html>
			<Html
				position={[0, -0.11, depth / 2 + 0.19]}
				center
				className="scan-ruler-label"
			>
				{formatMeasurement(width / CM, unit)}
			</Html>
			<Html
				position={[-width / 2 - 0.2, -0.11, 0]}
				center
				className="scan-ruler-label"
			>
				{formatMeasurement(depth / CM, unit)}
			</Html>
		</>
	);
}

function SizeHandle({
	axis,
	position,
	active,
	onDown,
	onHover,
}: {
	axis: Axis;
	position: [number, number, number];
	active: boolean;
	onDown: (event: ReactPointerEvent<HTMLButtonElement>, axis: Axis) => void;
	onHover: (axis: Axis | null) => void;
}) {
	return (
		<Html position={position} center zIndexRange={[30, 0]}>
			<button
				type="button"
				className={`scan-size-handle${active ? " is-active" : ""}`}
				aria-label={`Drag to resize book ${axis}`}
				onPointerEnter={() => onHover(axis)}
				onPointerLeave={() => onHover(null)}
				onPointerDown={(event) => onDown(event, axis)}
			>
				<span aria-hidden="true">▲</span>
				<i />
				<span aria-hidden="true">▼</span>
			</button>
		</Html>
	);
}

function BookModel({
	faces,
	side,
	size,
	unit,
	onPart,
	onSize,
}: {
	faces: Partial<Record<"front" | "spine" | "back", CroppedFace>>;
	side: PreviewSide;
	size: BookSizeCm;
	unit: Unit;
	onPart: (tag: PhotoTag) => void;
	onSize: (axis: Axis, value: number) => void;
}) {
	const group = useRef<Group>(null);
	const { camera, gl } = useThree();
	const [hovered, setHovered] = useState<Axis | null>(null);
	const [day, setDay] = useState(false);
	const [dragging, setDragging] = useState(false);
	const drag = useRef<{
		id: number;
		axis: Axis;
		plane: Plane;
		direction: Vector3;
		start: number;
		pointerStart: number;
	} | null>(null);
	const raycaster = useRef(new Raycaster()).current;
	const ndc = useRef(new Vector2()).current;
	const hit = useRef(new Vector3()).current;
	const width = size.width * CM;
	const height = size.height * CM;
	const depth = size.thickness * CM;
	const board = Math.max(0.004, depth * 0.12);
	const spine = depth / 2;
	const coverWidth = width - spine;
	const coverCenter = -width / 2 + spine + coverWidth / 2;
	const paperDepth = Math.max(0.006, depth - board * 2);

	useEffect(() => {
		const update = () =>
			setDay(document.documentElement.dataset.theme !== "dark");
		update();
		const observer = new MutationObserver(update);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});
		return () => observer.disconnect();
	}, []);

	const project = (
		event: { clientX: number; clientY: number },
		plane: Plane,
	) => {
		const rect = gl.domElement.getBoundingClientRect();
		ndc.set(
			(2 * (event.clientX - rect.left)) / rect.width - 1,
			1 - (2 * (event.clientY - rect.top)) / rect.height,
		);
		raycaster.setFromCamera(ndc, camera);
		return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
	};

	const handleDown = (
		event: ReactPointerEvent<HTMLButtonElement>,
		axis: Axis,
	) => {
		event.preventDefault();
		event.stopPropagation();
		const direction = axisVector(axis);
		const origin =
			axis === "height"
				? new Vector3(coverCenter, height, depth / 2 + 0.07)
				: axis === "width"
					? new Vector3(width / 2, height * 0.48, depth / 2 + 0.08)
					: new Vector3(coverCenter, height * 0.44, depth / 2);
		const view = new Vector3();
		camera.getWorldDirection(view);
		const normal = new Vector3()
			.crossVectors(direction, new Vector3().crossVectors(view, direction))
			.normalize();
		if (normal.lengthSq() < 1e-5) normal.set(0, 0, 1);
		const plane = new Plane().setFromNormalAndCoplanarPoint(normal, origin);
		const startPoint = project(event, plane);
		if (!startPoint) return;
		drag.current = {
			id: event.pointerId,
			axis,
			plane,
			direction,
			start: size[axis],
			pointerStart: startPoint.dot(direction) / CM,
		};
		setDragging(true);
	};

	useEffect(() => {
		const move = (event: PointerEvent) => {
			const current = drag.current;
			if (!current || current.id !== event.pointerId) return;
			const point = project(event, current.plane);
			if (!point) return;
			const step = unit === "cm" ? 0.1 : 2.54 / 8;
			const [min, max] = LIMITS[current.axis];
			const raw =
				current.start +
				point.dot(current.direction) / CM -
				current.pointerStart;
			const value = Math.round(raw / step) * step;
			onSize(current.axis, Math.max(min, Math.min(max, value)));
		};
		const up = (event: PointerEvent) => {
			if (drag.current?.id !== event.pointerId) return;
			drag.current = null;
			setDragging(false);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
		return () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
		};
	});

	useFrame((_, delta) => {
		if (!group.current) return;
		const ease = 1 - Math.exp(-Math.min(delta, 0.06) * 8);
		const targetY =
			side === "back"
				? Math.PI
				: side === "spine"
					? Math.PI / 2
					: side === "page"
						? 0.15
						: -0.38;
		group.current.rotation.y += (targetY - group.current.rotation.y) * ease;
	});

	const front = faces.front?.image;
	return (
		<>
			<ambientLight intensity={1.55} />
			<directionalLight position={[1.5, 2.4, 3]} intensity={2.1} />
			<group ref={group} rotation={[0, -0.38, 0]}>
				<group position={[coverCenter, height / 2, depth / 2 - board / 2]}>
					{front ? (
						<Surface
							image={front}
							width={coverWidth}
							height={height}
							onPick={() => onPart("front")}
						/>
					) : (
						<mesh>
							<boxGeometry args={[coverWidth, height, board]} />
							<meshPhysicalMaterial
								color="#a9dcfa"
								transmission={0.55}
								transparent
								opacity={0.6}
								roughness={0.16}
							/>
							<Edges color="#a9dfff" />
						</mesh>
					)}
				</group>
				<group position={[coverCenter, height / 2, -depth / 2 + board / 2]}>
					{faces.back ? (
						<Surface
							image={faces.back.image}
							width={coverWidth}
							height={height}
							onPick={() => onPart("back")}
						/>
					) : (
						<mesh>
							<boxGeometry args={[coverWidth, height, board]} />
							<meshStandardMaterial color="#334960" />
						</mesh>
					)}
				</group>
				<mesh position={[-width / 2 + spine, height / 2, 0]}>
					<cylinderGeometry
						args={[spine, spine, height, 24, 1, true, Math.PI, Math.PI]}
					/>
					<meshStandardMaterial color="#263b51" side={DoubleSide} />
				</mesh>
				<mesh position={[coverCenter, height / 2, 0]}>
					<boxGeometry args={[coverWidth - board, height - 0.02, paperDepth]} />
					<meshStandardMaterial color="#e9e4d7" roughness={0.92} />
				</mesh>
				{faces.spine && (
					<group
						position={[-width / 2 - 0.004, height / 2, 0]}
						rotation={[0, -Math.PI / 2, 0]}
					>
						<Surface
							image={faces.spine.image}
							width={depth}
							height={height}
							onPick={() => onPart("spine")}
						/>
					</group>
				)}
				<Rulers
					width={width}
					height={height}
					depth={depth}
					unit={unit}
					day={day}
				/>
				<SizeHandle
					axis="height"
					position={[coverCenter, height + 0.09, depth / 2 + 0.07]}
					active={hovered === "height" || drag.current?.axis === "height"}
					onHover={setHovered}
					onDown={handleDown}
				/>
				<SizeHandle
					axis="width"
					position={[width / 2 + 0.1, height * 0.47, depth / 2 + 0.07]}
					active={hovered === "width" || drag.current?.axis === "width"}
					onHover={setHovered}
					onDown={handleDown}
				/>
				<SizeHandle
					axis="thickness"
					position={[coverCenter, height * 0.43, depth / 2 + 0.09]}
					active={hovered === "thickness" || drag.current?.axis === "thickness"}
					onHover={setHovered}
					onDown={handleDown}
				/>
			</group>
			<OrbitControls
				enabled={!dragging}
				enablePan={false}
				enableDamping
				dampingFactor={0.08}
				minDistance={0.75}
				maxDistance={4.8}
				minPolarAngle={0.6}
				maxPolarAngle={2.3}
				target={[0, height / 2, 0]}
			/>
		</>
	);
}

function Controls({
	size,
	unit,
	setUnit,
	onSize,
	source,
	overridden,
	reset,
}: {
	size: BookSizeCm;
	unit: Unit;
	setUnit: (unit: Unit) => void;
	onSize: (axis: Axis, value: number) => void;
	source: string;
	overridden: boolean;
	reset: () => void;
}) {
	const presets = [
		{ name: "Pocket", height: 17.8, width: 10.8 },
		{ name: "A5", height: 21, width: 14.8 },
		{ name: "6 × 9 in", height: 22.86, width: 15.24 },
		{ name: "Royal", height: 23.4, width: 15.6 },
		{ name: "Coffee table", height: 30.48, width: 25.4 },
	];
	const axes: { key: Axis; label: string }[] = [
		{ key: "height", label: "Height" },
		{ key: "width", label: "Width" },
		{ key: "thickness", label: "Spine thickness" },
	];
	const toDisplay = (cm: number) => (unit === "cm" ? cm : cm / 2.54);
	const fromDisplay = (value: number) => (unit === "cm" ? value : value * 2.54);
	return (
		<section className="scan-size-controls" aria-label="Book size adjuster">
			<header>
				<div>
					<h3>Book size</h3>
					<small>{overridden ? "Manually adjusted" : source}</small>
				</div>
				<fieldset className="scan-size-unit">
					<legend className="sr-only">Units</legend>
					{(["cm", "in"] as const).map((choice) => (
						<button
							key={choice}
							type="button"
							aria-pressed={unit === choice}
							onClick={() => setUnit(choice)}
						>
							{choice}
						</button>
					))}
				</fieldset>
			</header>
			<div className="scan-size-presets">
				{presets.map((preset) => (
					<button
						key={preset.name}
						type="button"
						aria-pressed={
							Math.abs(preset.height - size.height) < 0.06 &&
							Math.abs(preset.width - size.width) < 0.06
						}
						onClick={() => {
							onSize("height", preset.height);
							onSize("width", preset.width);
						}}
					>
						{preset.name}
					</button>
				))}
			</div>
			{axes.map(({ key, label }) => (
				<label className="scan-size-range" key={key}>
					<span>
						{label}
						<output>{formatMeasurement(size[key], unit)}</output>
					</span>
					<input
						type="range"
						min={toDisplay(LIMITS[key][0])}
						max={toDisplay(LIMITS[key][1])}
						step={unit === "cm" ? 0.1 : 1 / 8}
						value={toDisplay(size[key])}
						onChange={(event) =>
							onSize(key, fromDisplay(Number(event.target.value)))
						}
					/>
				</label>
			))}
			{overridden && (
				<button type="button" className="scan-size-reset" onClick={reset}>
					Reset to enriched size
				</button>
			)}
		</section>
	);
}

export default function ScannerBook3D({
	faces,
	side,
	onPart,
	size,
	unit,
	setUnit,
	onSize,
	source,
	overridden,
	reset,
}: {
	faces: Partial<Record<"front" | "spine" | "back", CroppedFace>>;
	side: PreviewSide;
	onPart: (tag: PhotoTag) => void;
	size: BookSizeCm;
	unit: Unit;
	setUnit: (unit: Unit) => void;
	onSize: (axis: Axis, value: number) => void;
	source: string;
	overridden: boolean;
	reset: () => void;
}) {
	return (
		<div className="scan-size-configurator">
			<div className="scan-three-book scan-three-book-sized">
				<Canvas
					camera={{ position: [0.3, 0.55, 2.4], fov: 38 }}
					dpr={[1, 1.5]}
					fallback={<span>3D preview unavailable. Use the sliders below.</span>}
				>
					<BookModel
						faces={faces}
						side={side}
						size={size}
						unit={unit}
						onPart={onPart}
						onSize={onSize}
					/>
				</Canvas>
			</div>
			<Controls
				size={size}
				unit={unit}
				setUnit={setUnit}
				onSize={onSize}
				source={source}
				overridden={overridden}
				reset={reset}
			/>
		</div>
	);
}
