import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
	BufferAttribute,
	BufferGeometry,
	CanvasTexture,
	Mesh,
	MeshBasicMaterial,
	type PerspectiveCamera,
	PlaneGeometry,
	Points,
	type ShaderMaterial,
	SRGBColorSpace,
	Vector3,
} from "three";
import { auraDebug } from "./debug";
import { useAuraFocus } from "./focusStore";
import { AuraMaterial, createEmberMaterial } from "./materials";
import { type AuraBook, labelFor } from "./mockData";
import {
	auraMotion,
	BLOOM_S,
	clamp,
	MAX_FRAME_S,
	SETTLED_DISTANCE,
	smoothstep,
} from "./motion";
import { AURA_STYLES, type AuraStyleName } from "./styles";

type AuraMat = InstanceType<typeof AuraMaterial>;

const MARGIN = 1.45;
const QUIET_RGB = [0xe8 / 255, 0xe1 / 255, 0xd2 / 255] as const;
const _corner = new Vector3();
const _ndc = new Vector3();
const _dir = new Vector3();
const _point = new Vector3();

type Rect = {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	w: number;
	h: number;
};

type Slot = {
	bookId: string | null;
	b: number;
	signals: AuraBook | null;
};

const plusTextures = new Map<number, CanvasTexture>();

function plusTexture(count: number) {
	const cached = plusTextures.get(count);
	if (cached) return cached;
	const canvas = document.createElement("canvas");
	canvas.width = 64;
	canvas.height = 40;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Could not draw the aura +N tag");
	context.fillStyle = "rgba(220,228,245,0.85)";
	context.font = "600 26px Inter, Helvetica, Arial, sans-serif";
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillText(`+${count}`, 32, 21);
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	plusTextures.set(count, texture);
	return texture;
}

function hexTo(target: Vector3, hex: string) {
	const value = Number.parseInt(hex.slice(1), 16);
	target.set(
		((value >> 16) & 255) / 255,
		((value >> 8) & 255) / 255,
		(value & 255) / 255,
	);
	return target;
}

function setHex(attribute: BufferAttribute, index: number, hex: string) {
	const color = hexTo(_point, hex);
	attribute.setXYZ(index, color.x, color.y, color.z);
}

function projectBook(
	book: AuraBook,
	camera: PerspectiveCamera,
	view: { width: number; height: number },
): Rect | null {
	const ref = useAuraFocus.getState().refs.get(book.bookId);
	if (!ref) return null;
	ref.object.updateWorldMatrix(true, false);
	const [width, height, thickness] = ref.dimensions;
	let x0 = Number.POSITIVE_INFINITY;
	let x1 = Number.NEGATIVE_INFINITY;
	let y0 = Number.POSITIVE_INFINITY;
	let y1 = Number.NEGATIVE_INFINITY;
	for (let corner = 0; corner < 8; corner++) {
		_corner.set(
			(corner & 1 ? 0.5 : -0.5) * width,
			(corner & 2 ? 0.5 : -0.5) * height,
			(corner & 4 ? 0.5 : -0.5) * thickness,
		);
		_corner.applyMatrix4(ref.object.matrixWorld).project(camera);
		const sx = (_corner.x + 1) * 0.5 * view.width;
		const sy = (1 - _corner.y) * 0.5 * view.height;
		x0 = Math.min(x0, sx);
		x1 = Math.max(x1, sx);
		y0 = Math.min(y0, sy);
		y1 = Math.max(y1, sy);
	}
	if (!Number.isFinite(x0) || x1 - x0 < 2 || y1 - y0 < 2) return null;
	return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function screenToWorld(
	px: number,
	py: number,
	distance: number,
	camera: PerspectiveCamera,
	view: { width: number; height: number },
	target: Vector3,
) {
	_ndc.set((px / view.width) * 2 - 1, -(py / view.height) * 2 + 1, 0.5);
	_ndc.unproject(camera);
	_dir.copy(_ndc).sub(camera.position).normalize();
	target.copy(camera.position).addScaledVector(_dir, distance);
}

function frustum(
	camera: PerspectiveCamera,
	distance: number,
	view: { width: number; height: number },
) {
	const visibleH = 2 * Math.tan((camera.fov * Math.PI) / 180 / 2) * distance;
	const visibleW = visibleH * (view.width / Math.max(1, view.height));
	return { visibleW, visibleH };
}

function applyStyle(material: AuraMat, style: AuraStyleName) {
	const preset = AURA_STYLES[style];
	for (const [index, color] of preset.colors.entries()) {
		material.uColors[index]?.copy(color);
	}
	material.uWaveA = preset.waveA;
	material.uWaveB = preset.waveB;
	material.uRings = preset.rings;
	material.uShape = preset.shape;
}

function paintSlotSignals(material: AuraMat, book: AuraBook) {
	material.uAlignment = book.alignment;
	material.uLiked = book.liked;
	material.uReadState = book.read;
	material.uProgress = book.progress;
	material.uOwned = book.owned;
	material.uSeed = book.seed;
	material.uInvite = book.invite;
	hexTo(material.uFriendColor, book.friendColor || "#ff9f6e");
}

function createPointGeometry(count: number) {
	const geometry = new BufferGeometry();
	geometry.setAttribute(
		"position",
		new BufferAttribute(new Float32Array(count * 3), 3),
	);
	geometry.setAttribute(
		"aColor",
		new BufferAttribute(new Float32Array(count * 3), 3),
	);
	for (const name of ["aLit", "aShape", "aSize", "aPhase", "aAlpha"]) {
		geometry.setAttribute(
			name,
			new BufferAttribute(new Float32Array(count), 1),
		);
	}
	geometry.setDrawRange(0, 0);
	return geometry;
}

function attribute(geometry: BufferGeometry, name: string) {
	return geometry.getAttribute(name) as BufferAttribute;
}

export default function FocusedAura({
	itemsRef,
}: {
	itemsRef: { current: AuraBook[] };
}) {
	const resources = useMemo(() => buildResources(), []);
	const slots = useRef<Slot[]>([
		{ bookId: null, b: 0, signals: null },
		{ bookId: null, b: 0, signals: null },
	]);
	const time = useRef(0);
	const styleName = useRef<AuraStyleName | null>(null);
	const shelf = useRef<string | null>(null);

	useEffect(() => {
		return () => {
			resources.plane.dispose();
			for (const mesh of resources.aura) mesh.material.dispose();
			for (const points of resources.embers) {
				points.geometry.dispose();
				points.material.dispose();
			}
			resources.quiet.geometry.dispose();
			resources.quiet.material.dispose();
			for (const mesh of resources.plus) mesh.material.dispose();
		};
	}, [resources]);

	useFrame((state, delta) => {
		const camera = state.camera as PerspectiveCamera;
		const view = state.size;
		const { focusedId, style, shelf: shelfId, share } = useAuraFocus.getState();
		if (shelf.current !== shelfId) {
			shelf.current = shelfId;
			for (const slot of slots.current) {
				slot.bookId = null;
				slot.b = 0;
				slot.signals = null;
			}
		}
		if (styleName.current !== style) {
			styleName.current = style;
			for (const mesh of resources.aura) applyStyle(mesh.material, style);
		}

		const reduced = auraMotion.reduced;
		const motion = reduced ? 0 : 1;
		const frame = Math.min(delta, MAX_FRAME_S);
		if (auraMotion.frozenTime !== undefined)
			time.current = auraMotion.frozenTime;
		else if (reduced) time.current = 3;
		else time.current += frame;
		const pixelRatio = state.gl.getPixelRatio();
		for (const mesh of resources.aura) {
			mesh.material.uTime = time.current;
			mesh.material.uMotion = motion;
		}
		for (const points of [...resources.embers, resources.quiet]) {
			points.material.uniforms.uTime.value = time.current;
			points.material.uniforms.uMotion.value = motion;
			points.material.uniforms.uPR.value = pixelRatio;
		}

		const items = itemsRef.current;
		const focused = focusedId
			? (items.find((item) => item.bookId === focusedId) ?? null)
			: null;
		const index = focused ? items.indexOf(focused) : -1;
		const settled =
			!!focused &&
			!auraMotion.scrolling &&
			Math.abs(auraMotion.vis - index) < SETTLED_DISTANCE;
		const pair = slots.current;
		let current = pair.find((slot) => slot.bookId === focusedId && focusedId);
		if (
			!current &&
			focused &&
			useAuraFocus.getState().refs.has(focused.bookId)
		) {
			current = pair.find((slot) => !slot.bookId || slot.b <= 0);
			if (current) {
				current.bookId = focused.bookId;
				current.b = reduced ? 1 : 0;
				current.signals = focused;
			}
		}
		if (current && focused && current.bookId === focused.bookId)
			current.signals = focused;

		const rects = new Map<string, Rect>();
		for (const item of items) {
			const rect = projectBook(item, camera, view);
			if (rect) rects.set(item.bookId, rect);
		}

		let visibleAuras = 0;
		pair.forEach((slot, slotIndex) => {
			const goal = slot === current && settled ? 1 : 0;
			if (reduced) slot.b = goal;
			else {
				const step = frame / BLOOM_S;
				slot.b = clamp(
					slot.b +
						Math.sign(goal - slot.b) * Math.min(Math.abs(goal - slot.b), step),
					0,
					1,
				);
			}
			const eased = smoothstep(slot.b);
			const show =
				!!slot.signals && eased > 0.002 && rects.has(slot.bookId ?? "");
			const mesh = resources.aura[slotIndex];
			const points = resources.embers[slotIndex];
			const plus = resources.plus[slotIndex];
			mesh.visible = show;
			points.visible = show;
			if (!show) {
				plus.visible = false;
				points.material.uniforms.uFade.value = 0;
				if (slot !== current) {
					slot.bookId = null;
					slot.signals = null;
				}
				return;
			}
			visibleAuras += 1;
			const book = slot.signals;
			const rect = rects.get(slot.bookId ?? "");
			if (!book || !rect) return;
			paintSlotSignals(mesh.material, book);
			mesh.material.uBloom = eased;
			const ref = useAuraFocus.getState().refs.get(book.bookId);
			if (!ref) return;
			ref.object.getWorldPosition(_point);
			const distance = Math.max(0.35, _point.distanceTo(camera.position));
			placeAura(mesh, rect, distance, camera, view);
			placeEmbers(points, plus, book, rect, distance, eased, camera, view);
		});

		placeQuiet(resources.quiet, items, rects, pair, camera, view);

		const label = focused ? labelFor(focused, share) : null;
		auraDebug.focusedId = focusedId;
		auraDebug.shelf = shelfId;
		auraDebug.style = style;
		auraDebug.auras = visibleAuras;
		auraDebug.vis = auraMotion.vis;
		auraDebug.scrolling = auraMotion.scrolling;
		auraDebug.title = label?.title ?? "";
		auraDebug.status = label?.status ?? "";
		auraDebug.friends = label?.friends ?? "";
		auraDebug.slots = pair.map((slot) => ({
			bookId: slot.bookId,
			b: Math.round(slot.b * 100) / 100,
		}));
		auraDebug.books = items.map((item) => {
			const rect = rects.get(item.bookId);
			return {
				id: item.bookId,
				title: item.title,
				x: rect ? (rect.x0 + rect.x1) / 2 : 0,
				y: rect ? (rect.y0 + rect.y1) / 2 : 0,
				w: rect?.w ?? 0,
				h: rect?.h ?? 0,
			};
		});
	});

	return (
		<>
			<primitive object={resources.aura[0]} />
			<primitive object={resources.aura[1]} />
			<primitive object={resources.embers[0]} />
			<primitive object={resources.embers[1]} />
			<primitive object={resources.plus[0]} />
			<primitive object={resources.plus[1]} />
			<primitive object={resources.quiet} />
		</>
	);
}

function buildResources() {
	const plane = new PlaneGeometry(1, 1);
	const aura = [0, 1].map((index) => {
		const mesh = new Mesh(plane, new AuraMaterial());
		mesh.name = `aura-slot-${index}`;
		mesh.renderOrder = -1;
		mesh.frustumCulled = false;
		mesh.raycast = () => {};
		mesh.visible = false;
		applyStyle(mesh.material, "aurora");
		return mesh;
	});
	const embers = [0, 1].map((index) => {
		const points = new Points(createPointGeometry(4), createEmberMaterial());
		points.name = `aura-embers-${index}`;
		points.renderOrder = 2;
		points.frustumCulled = false;
		points.raycast = () => {};
		points.visible = false;
		return points;
	});
	const plus = [0, 1].map((index) => {
		const mesh = new Mesh(
			plane,
			new MeshBasicMaterial({
				transparent: true,
				depthTest: false,
				depthWrite: false,
				toneMapped: false,
				opacity: 0,
			}),
		);
		mesh.name = `aura-plus-${index}`;
		mesh.renderOrder = 3;
		mesh.frustumCulled = false;
		mesh.raycast = () => {};
		mesh.visible = false;
		return mesh;
	});
	const quiet = new Points(createPointGeometry(16), createEmberMaterial());
	quiet.name = "aura-quiet";
	quiet.renderOrder = 2;
	quiet.frustumCulled = false;
	quiet.raycast = () => {};
	quiet.material.uniforms.uFade.value = 1;
	return { plane, aura, embers, plus, quiet };
}

function placeAura(
	mesh: Mesh<PlaneGeometry, AuraMat>,
	rect: Rect,
	distance: number,
	camera: PerspectiveCamera,
	view: { width: number; height: number },
) {
	const coverW = rect.w * 0.965;
	const coverH = rect.h * 0.965;
	const unit = Math.min(coverW, coverH);
	const planeW = coverW * 1.08 + 2 * MARGIN * unit;
	const planeH = coverH + 2 * MARGIN * unit;
	const { visibleW, visibleH } = frustum(camera, distance, view);
	const worldW = (planeW / view.width) * visibleW;
	const worldH = (planeH / view.height) * visibleH;
	const coverWorldW = (coverW / view.width) * visibleW;
	const coverWorldH = (coverH / view.height) * visibleH;
	screenToWorld(
		(rect.x0 + rect.x1) / 2,
		(rect.y0 + rect.y1) / 2,
		distance,
		camera,
		view,
		mesh.position,
	);
	mesh.quaternion.copy(camera.quaternion);
	mesh.scale.set(worldW, worldH, 1);
	mesh.material.uPlaneSize.set(worldW, worldH);
	mesh.material.uCoverSize.set(coverWorldW, coverWorldH);
	mesh.material.uCornerRadius = Math.min(coverWorldW, coverWorldH) * 0.035;
}

function placeEmbers(
	points: Points,
	plus: Mesh,
	book: AuraBook,
	rect: Rect,
	distance: number,
	fade: number,
	camera: PerspectiveCamera,
	view: { width: number; height: number },
) {
	const geometry = points.geometry as BufferGeometry;
	const position = attribute(geometry, "position");
	const color = attribute(geometry, "aColor");
	const lit = attribute(geometry, "aLit");
	const shape = attribute(geometry, "aShape");
	const size = attribute(geometry, "aSize");
	const phase = attribute(geometry, "aPhase");
	const alpha = attribute(geometry, "aAlpha");
	const scale = (rect.w * 0.965) / 130;
	const cx = (rect.x0 + rect.x1) / 2;
	const baseline = rect.y1 + 24 * scale;
	const gap = 19 * scale;
	const count = book.embers.length;
	const start = cx - ((count - 1) / 2) * gap - (book.extra ? 10 * scale : 0);
	book.embers.forEach((ember, index) => {
		screenToWorld(
			start + index * gap,
			baseline,
			distance,
			camera,
			view,
			_point,
		);
		position.setXYZ(index, _point.x, _point.y, _point.z);
		setHex(color, index, ember.color);
		lit.setX(index, ember.lit);
		shape.setX(index, 0);
		size.setX(index, 21 * scale);
		phase.setX(index, index * 2.1 + book.seed * 6);
		alpha.setX(index, 1);
	});
	let drawn = count;
	if (book.mine) {
		screenToWorld(
			rect.x1 + 4 * scale,
			rect.y0 - 4 * scale,
			distance,
			camera,
			view,
			_point,
		);
		position.setXYZ(count, _point.x, _point.y, _point.z);
		shape.setX(count, 1);
		lit.setX(count, 1);
		size.setX(count, 19 * scale);
		phase.setX(count, book.seed * 4);
		alpha.setX(count, 1);
		drawn += 1;
	}
	for (const attr of [position, color, lit, shape, size, phase, alpha])
		attr.needsUpdate = true;
	geometry.setDrawRange(0, drawn);
	(points.material as ShaderMaterial).uniforms.uFade.value = fade;
	const material = plus.material as MeshBasicMaterial;
	plus.visible = book.extra > 0;
	material.opacity = fade;
	if (book.extra > 0) {
		material.map = plusTexture(book.extra);
		material.needsUpdate = true;
		const { visibleW, visibleH } = frustum(camera, distance, view);
		screenToWorld(
			start + (count - 1) * gap + 22 * scale,
			baseline,
			distance,
			camera,
			view,
			plus.position,
		);
		plus.quaternion.copy(camera.quaternion);
		plus.scale.set(
			((24 * scale) / view.width) * visibleW,
			((15 * scale) / view.height) * visibleH,
			1,
		);
	}
}

function placeQuiet(
	points: Points,
	items: AuraBook[],
	rects: Map<string, Rect>,
	slots: Slot[],
	camera: PerspectiveCamera,
	view: { width: number; height: number },
) {
	const geometry = points.geometry as BufferGeometry;
	const position = attribute(geometry, "position");
	const color = attribute(geometry, "aColor");
	const lit = attribute(geometry, "aLit");
	const shape = attribute(geometry, "aShape");
	const size = attribute(geometry, "aSize");
	const alpha = attribute(geometry, "aAlpha");
	items.forEach((book, index) => {
		const rect = rects.get(book.bookId);
		if (!rect) {
			alpha.setX(index, 0);
			return;
		}
		let focus = 0;
		for (const slot of slots) {
			if (slot.bookId === book.bookId)
				focus = Math.max(focus, smoothstep(slot.b));
		}
		const ref = useAuraFocus.getState().refs.get(book.bookId);
		const distance = ref
			? Math.max(
					0.35,
					ref.object.getWorldPosition(_point).distanceTo(camera.position) || 1,
				)
			: 1;
		const scale = rect.w / 130;
		screenToWorld(
			(rect.x0 + rect.x1) / 2,
			rect.y1 + 13 * scale,
			distance,
			camera,
			view,
			_point,
		);
		position.setXYZ(index, _point.x, _point.y, _point.z);
		color.setXYZ(index, QUIET_RGB[0], QUIET_RGB[1], QUIET_RGB[2]);
		lit.setX(index, 0);
		shape.setX(index, 2);
		size.setX(index, 5.5);
		alpha.setX(index, book.quiet ? 0.34 * (1 - focus) : 0);
	});
	for (const attr of [position, color, lit, shape, size, alpha])
		attr.needsUpdate = true;
	geometry.setDrawRange(0, items.length);
}
