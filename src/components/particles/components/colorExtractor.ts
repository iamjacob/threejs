import {
	BoxGeometry,
	BufferGeometry,
	Color,
	Float32BufferAttribute,
	type Texture,
	Vector2,
	Vector3,
} from "three";

export interface TexturePixels {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}

function readTexturePixels(texture: Texture): TexturePixels {
	const canvas = document.createElement("canvas");
	const image = texture.image as HTMLImageElement;
	canvas.width = image.naturalWidth || image.width;
	canvas.height = image.naturalHeight || image.height;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("Cannot read book texture pixels.");
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** Samples the same six material slots and UVs as the finished BoxGeometry book. */
export function createBookParticleGeometry(
	textures: Texture[],
	dimensions: [number, number, number],
	resolution = 6400,
	readPixels: (texture: Texture) => TexturePixels = readTexturePixels,
) {
	if (textures.length !== 6)
		throw new Error("Book particles need six face maps.");
	const box = new BoxGeometry(...dimensions);
	const vertices = box.getAttribute("position");
	const uvs = box.getAttribute("uv");
	const normals = box.getAttribute("normal");
	const positions: number[] = [];
	const targets: number[] = [];
	const colors: number[] = [];
	const alphas: number[] = [];
	const sizes: number[] = [];
	const velocities: number[] = [];
	const faceIds: number[] = [];
	const faceNormals: number[] = [];
	const sampleUvs: number[] = [];
	const color = new Color();
	const uv = new Vector2();
	const target = new Vector3();
	const cache = new Map<Texture, TexturePixels>();
	const density = Math.sqrt(resolution / (dimensions[0] * dimensions[1]));

	try {
		for (const group of box.groups) {
			const faceId = group.materialIndex ?? 0;
			const texture = textures[faceId];
			const pixels = cache.get(texture) ?? readPixels(texture);
			cache.set(texture, pixels);
			if (texture.matrixAutoUpdate) texture.updateMatrix();

			// Derive each face's UV basis from Three.js itself, including the
			// reversed back cover and the different top/bottom orientations.
			const corners = new Map<string, number>();
			for (let i = group.start; i < group.start + group.count; i++) {
				const index = box.index?.getX(i) ?? i;
				corners.set(`${uvs.getX(index)},${uvs.getY(index)}`, index);
			}
			const originIndex = corners.get("0,0");
			const uIndex = corners.get("1,0");
			const vIndex = corners.get("0,1");
			if (
				originIndex === undefined ||
				uIndex === undefined ||
				vIndex === undefined
			)
				throw new Error("Book face has no rectangular UV basis.");
			const origin = new Vector3().fromBufferAttribute(vertices, originIndex);
			const uAxis = new Vector3()
				.fromBufferAttribute(vertices, uIndex)
				.sub(origin);
			const vAxis = new Vector3()
				.fromBufferAttribute(vertices, vIndex)
				.sub(origin);
			const normal = new Vector3().fromBufferAttribute(normals, originIndex);
			const columns = Math.max(2, Math.ceil(uAxis.length() * density));
			const rows = Math.max(2, Math.ceil(vAxis.length() * density));
			const size =
				Math.max(uAxis.length() / columns, vAxis.length() / rows) * 1.2;

			for (let row = 0; row < rows; row++) {
				for (let column = 0; column < columns; column++) {
					// Sample cell centers. Preserve the full image bounds, even
					// with transparent borders; never stretch the remaining pixels.
					const u = (column + 0.5) / columns;
					const v = (row + 0.5) / rows;
					texture.transformUv(uv.set(u, v));
					const x = Math.min(pixels.width - 1, Math.floor(uv.x * pixels.width));
					const y = Math.min(
						pixels.height - 1,
						Math.floor(uv.y * pixels.height),
					);
					const offset = (y * pixels.width + x) * 4;
					color.setRGB(
						pixels.data[offset] / 255,
						pixels.data[offset + 1] / 255,
						pixels.data[offset + 2] / 255,
						texture.colorSpace,
					);
					target
						.copy(origin)
						.addScaledVector(uAxis, u)
						.addScaledVector(vAxis, v);
					targets.push(...target.toArray());
					colors.push(color.r, color.g, color.b);
					alphas.push(pixels.data[offset + 3] / 255);
					faceNormals.push(...normal.toArray());
					faceIds.push(faceId);
					sampleUvs.push(u, v);
					sizes.push(size);

					const radius = 0.75 + Math.random() * 1.5;
					const theta = Math.random() * Math.PI * 2;
					const z = Math.random() * 2 - 1;
					const ring = Math.sqrt(1 - z * z);
					positions.push(
						radius * ring * Math.cos(theta),
						radius * z,
						radius * ring * Math.sin(theta),
					);
					velocities.push(
						(Math.random() - 0.5) * 0.008,
						(Math.random() - 0.5) * 0.008,
						(Math.random() - 0.5) * 0.008,
					);
				}
			}
		}
	} finally {
		box.dispose();
	}

	const geometry = new BufferGeometry();
	for (const [name, array, itemSize] of [
		["position", positions, 3],
		["targetPosition", targets, 3],
		["color", colors, 3],
		["opacity", alphas, 1],
		["size", sizes, 1],
		["velocity", velocities, 3],
		["faceId", faceIds, 1],
		["faceNormal", faceNormals, 3],
		["uv", sampleUvs, 2],
	] as const) {
		geometry.setAttribute(name, new Float32BufferAttribute(array, itemSize));
	}
	return geometry;
}
