import {
	BufferAttribute,
	BufferGeometry,
	Color,
	DoubleSide,
	LineBasicMaterial,
	LineSegments,
	Mesh,
	MeshBasicMaterial,
	OrthographicCamera,
	PlaneGeometry,
	Scene,
	SRGBColorSpace,
	Texture,
	WebGLRenderer,
} from "three";
import type { LibraryBook } from "../../lib/bookCatalog";
import { bookImagePath } from "../../lib/bookImages";
import {
	HELIX_HEIGHT,
	HELIX_RADIUS,
	HELIX_TWIST,
	helixBookPose,
} from "../../lib/helixNavigation";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { calendarHue, calendarLabels, calendarTicks, helixReadDay } from "../../lib/helixCalendar";

const SEGMENTS = 240;
const AXIS = 7;

/** Adapted from Reading Helix: orthographic ribbons, depth-shaded covers, and a fine ruler. */
export function createHelixRenderer(
	host: HTMLDivElement,
	books: LibraryBook[],
	invalidate: () => void,
) {
	const renderer = new WebGLRenderer({ antialias: true, alpha: true });
	renderer.setClearColor(0x000000, 0);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.domElement.setAttribute("aria-hidden", "true");
	const ruler = document.createElement("canvas");
	ruler.setAttribute("aria-hidden", "true");
	const context = ruler.getContext("2d");
	host.append(renderer.domElement, ruler);
	const scene = new Scene();
	const camera = new OrthographicCamera(
		-200,
		200,
		HELIX_HEIGHT / 2,
		-HELIX_HEIGHT / 2,
		0.1,
		500,
	);
	camera.position.z = 200;
	let width = 400;
	let disposed = false;
	const color = new Color();
	const hue = (index: number) =>
		(((index / Math.max(8, books.length) + 0.06) % 1) + 1) % 1;
	const strands = [1, -1].map((side) => {
		const geometry = new BufferGeometry();
		const positions = new Float32Array(SEGMENTS * 6);
		const colors = new Float32Array(SEGMENTS * 6);
		geometry.setAttribute("position", new BufferAttribute(positions, 3));
		geometry.setAttribute("color", new BufferAttribute(colors, 3));
		const indices: number[] = [];
		for (let i = 0; i < SEGMENTS - 1; i++) {
			const a = i * 2;
			indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
		geometry.setIndex(indices);
		const material = new MeshBasicMaterial({
			vertexColors: true,
			side: DoubleSide,
			transparent: true,
			opacity: 0.8,
			depthWrite: false,
		});
		const mesh = new Mesh(geometry, material);
		mesh.frustumCulled = false;
		scene.add(mesh);
		return { side, geometry, material, positions, colors };
	});
	const rungGeometry = new BufferGeometry();
	const rungPositions = new Float32Array(books.length * 6);
	const rungColors = new Float32Array(books.length * 6);
	rungGeometry.setAttribute("position", new BufferAttribute(rungPositions, 3));
	rungGeometry.setAttribute("color", new BufferAttribute(rungColors, 3));
	const rungMaterial = new LineBasicMaterial({
		vertexColors: true,
		transparent: true,
		opacity: 0.42,
		depthWrite: false,
	});
	const rungs = new LineSegments(rungGeometry, rungMaterial);
	rungs.frustumCulled = false;
	scene.add(rungs);
	const plane = new PlaneGeometry(1, 1);
	const covers = books.map((book, index) => {
		const material = new MeshBasicMaterial({
			color: new Color().setHSL(hue(index), 0.3, 0.3),
			transparent: true,
		});
		const mesh = new Mesh(plane, material);
		mesh.frustumCulled = false;
		scene.add(mesh);
		let image: HTMLImageElement | null = null;
		return {
			mesh,
			material,
			load() {
				if (image) return;
				image = new Image();
				image.crossOrigin = "anonymous";
				image.onload = () => {
					if (disposed || !image) return;
					const texture = new Texture(image);
					texture.colorSpace = SRGBColorSpace;
					texture.anisotropy = Math.min(
						4,
						renderer.capabilities.getMaxAnisotropy(),
					);
					texture.needsUpdate = true;
					material.map = texture;
					material.color.set(0xffffff);
					material.needsUpdate = true;
					invalidate();
				};
				image.src = publicAssetUrl(bookImagePath(book.cover.front, "low"));
			},
			dispose() {
				if (image) image.onload = null;
				material.map?.dispose();
				material.dispose();
			},
		};
	});
	return {
		resize() {
			width = Math.max(1, host.clientWidth);
			renderer.setSize(width, HELIX_HEIGHT, false);
			camera.left = -width / 2;
			camera.right = width / 2;
			camera.updateProjectionMatrix();
			const dpr = renderer.getPixelRatio();
			ruler.width = width * dpr;
			ruler.height = HELIX_HEIGHT * dpr;
		},
		draw(position: number, spacing: number) {
			if (disposed) return;
			const wave = (Math.PI * 2) / HELIX_TWIST;
			for (const strand of strands) {
				for (let i = 0; i < SEGMENTS; i++) {
					const x = -width / 2 - 20 + ((width + 40) * i) / (SEGMENTS - 1);
					const phase = (x + position * spacing) * wave;
					const y = Math.sin(phase) * HELIX_RADIUS * strand.side;
					const z = Math.cos(phase) * HELIX_RADIUS * strand.side;
					const depth = (z / HELIX_RADIUS + 1) / 2;
					const tangent = Math.cos(phase) * HELIX_RADIUS * wave * strand.side;
					const halfWidth = 1.15 * (0.6 + 0.4 * depth);
					const nx = (-tangent / Math.hypot(1, tangent)) * halfWidth;
					const ny = halfWidth / Math.hypot(1, tangent);
					const offset = i * 6;
					strand.positions.set(
						[x + nx, AXIS + y + ny, z, x - nx, AXIS + y - ny, z],
						offset,
					);
					color.setHSL(hue(position + x / spacing), 0.8, 0.3 + depth * 0.28);
					strand.colors.set(
						[color.r, color.g, color.b, color.r, color.g, color.b],
						offset,
					);
				}
				strand.geometry.attributes.position.needsUpdate = true;
				strand.geometry.attributes.color.needsUpdate = true;
			}
			covers.forEach((cover, index) => {
				const pose = helixBookPose(index, position, spacing);
				cover.mesh.visible = Math.abs(pose.x) < width / 2 + 60;
				const offset = index * 6;
				if (!cover.mesh.visible) {
					rungPositions.fill(10000, offset, offset + 6);
					return;
				}
				cover.load();
				rungPositions.set(
					[
						pose.x,
						AXIS + pose.y,
						HELIX_RADIUS,
						pose.x,
						AXIS - pose.y,
						-HELIX_RADIUS,
					],
					offset,
				);
				color.setHSL(hue(index), 0.8, 0.5);
				rungColors.set(
					[color.r, color.g, color.b, color.r, color.g, color.b],
					offset,
				);
				cover.mesh.position.set(pose.x, AXIS + pose.y, pose.z + 1);
				const aspect = Math.max(
					1.15,
					Math.min(
						1.8,
						books[index].dimensions[1] / books[index].dimensions[0],
					),
				);
				cover.mesh.scale.set(14 * pose.scale, 14 * aspect * pose.scale, 1);
				cover.mesh.renderOrder = pose.z;
			});
			rungGeometry.attributes.position.needsUpdate = true;
			rungGeometry.attributes.color.needsUpdate = true;
			renderer.render(scene, camera);
			if (!context) return;
			const dpr = renderer.getPixelRatio();
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, width, HELIX_HEIGHT);
			const centerIndex = Math.max(0, Math.min(books.length - 1, Math.round(position)));
			const readDays = books.map((book) => helixReadDay(book));
			const dateSpan = Math.max(365, Math.max(...readDays) - Math.min(...readDays));
			const pixelsPerDay = spacing / Math.max(14, dateSpan / Math.max(1, books.length - 1));
			const ticks = calendarTicks(readDays[centerIndex], pixelsPerDay, width);
			const base = HELIX_HEIGHT - 24;
			context.fillStyle = "rgba(239,230,212,.1)";
			context.fillRect(0, base, width, 1);
			for (const tick of ticks) {
				if (tick.x < -10 || tick.x > width + 10) continue;
				context.globalAlpha = tick.alpha;
				context.fillStyle = `hsl(${calendarHue(tick.day) * 360} 78% 66%)`;
				context.fillRect(tick.x - tick.width / 2, base - tick.height, tick.width, tick.height);
			}
			context.globalAlpha = 1;
			context.textAlign = "center";
			const labels = calendarLabels(ticks, (text, strong) => {
				context.font = `${strong ? 600 : 400} ${strong ? 11 : 9}px ui-monospace, monospace`;
				return context.measureText(text).width;
			});
			for (const label of labels) {
				if (label.x < -40 || label.x > width + 40) continue;
				context.font = `${label.strong ? 600 : 400} ${label.strong ? 11 : 9}px ui-monospace, monospace`;
				context.fillStyle = `hsl(${calendarHue(label.day) * 360} 48% 78% / ${label.strong ? 0.92 : 0.64})`;
				context.fillText(label.label, label.x, base + 12);
			}
			context.fillStyle = "#ef454b";
			context.fillRect(width / 2 - 1, base - 34, 2, 34);
			context.beginPath();
			context.moveTo(width / 2 - 3, base + 1);
			context.lineTo(width / 2 + 3, base + 1);
			context.lineTo(width / 2, base - 3);
			context.fill();
		},
		dispose() {
			disposed = true;
			covers.forEach((cover) => {
				cover.dispose();
			});
			strands.forEach((strand) => {
				strand.geometry.dispose();
				strand.material.dispose();
			});
			plane.dispose();
			rungGeometry.dispose();
			rungMaterial.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
			renderer.domElement.remove();
			ruler.remove();
		},
	};
}
