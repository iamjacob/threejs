import assert from "node:assert/strict";
import { test } from "node:test";
import {
	BoxGeometry,
	Mesh,
	MeshBasicMaterial,
	Raycaster,
	RepeatWrapping,
	SRGBColorSpace,
	Texture,
	Vector3,
} from "three";
import { getBookTextureUrls } from "../../book/bookTextures.ts";
import {
	createBookParticleGeometry,
	type TexturePixels,
} from "./colorExtractor.ts";

// Asymmetric, distinct images expose swapped faces, horizontal mirrors and Y flips.
function fixture() {
	const textures = Array.from({ length: 6 }, (_, face) => {
		const texture = new Texture();
		texture.name = String(face);
		texture.colorSpace = SRGBColorSpace;
		return texture;
	});
	const readPixels = (texture: Texture): TexturePixels => {
		const width = 4;
		const height = 6;
		const data = new Uint8ClampedArray(width * height * 4);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				data.set(
					[20 + Number(texture.name) * 35, 10 + x * 60, 15 + y * 40, 255],
					(y * width + x) * 4,
				);
			}
		}
		return { width, height, data };
	};
	return { textures, readPixels };
}

const linear = (byte: number) => {
	const value = byte / 255;
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const near = (actual: number, expected: number) =>
	assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test("every particle samples its corresponding BoxGeometry face and pixel", () => {
	const { textures, readPixels } = fixture();
	const dimensions: [number, number, number] = [0.7, 1, 0.1];
	const particles = createBookParticleGeometry(
		textures,
		dimensions,
		96,
		readPixels,
	);
	const materials = textures.map((map) => new MeshBasicMaterial({ map }));
	const book = new Mesh(new BoxGeometry(...dimensions, 4, 7, 2), materials);
	const counts = Array(6).fill(0);
	const targets = particles.getAttribute("targetPosition");
	for (let i = 0; i < targets.count; i++) {
		const target = new Vector3().fromBufferAttribute(targets, i);
		const normal = new Vector3().fromBufferAttribute(
			particles.getAttribute("faceNormal"),
			i,
		);
		const ray = new Raycaster(
			target.clone().add(normal),
			normal.clone().negate(),
		);
		const hit = ray.intersectObject(book)[0];
		assert.ok(hit?.uv && hit.face);
		const face = particles.getAttribute("faceId").getX(i);
		assert.equal(face, hit.face.materialIndex);
		assert.ok(hit.point.distanceTo(target) < 1e-6);
		near(particles.getAttribute("uv").getX(i), hit.uv.x);
		near(particles.getAttribute("uv").getY(i), hit.uv.y);
		// Ray intersections use Float32 vertices; stabilize exact texel boundaries.
		const x = Math.min(3, Math.floor(hit.uv.x * 4 + 1e-6));
		const y = Math.min(5, Math.floor((1 - hit.uv.y) * 6 + 1e-6));
		const colors = particles.getAttribute("color");
		near(colors.getX(i), linear(20 + face * 35));
		near(colors.getY(i), linear(10 + x * 60));
		near(colors.getZ(i), linear(15 + y * 40));
		counts[face]++;
	}
	assert.ok(counts.every((count) => count > 0));
	particles.dispose();
	book.geometry.dispose();
	for (const material of materials) material.dispose();
});

test("texture flipY, repeat and offset affect pixels without moving the surface", () => {
	const { textures, readPixels } = fixture();
	for (const texture of textures) {
		texture.flipY = false;
		texture.wrapS = RepeatWrapping;
		texture.repeat.x = 2;
		texture.offset.x = 0.17;
	}
	const particles = createBookParticleGeometry(
		textures,
		[0.7, 1, 0.1],
		96,
		readPixels,
	);
	const uv = particles.getAttribute("uv");
	const colors = particles.getAttribute("color");
	for (let i = 0; i < uv.count; i++) {
		const x = Math.floor(((uv.getX(i) * 2 + 0.17) % 1) * 4);
		const y = Math.min(5, Math.floor(uv.getY(i) * 6));
		near(colors.getY(i), linear(10 + x * 60));
		near(colors.getZ(i), linear(15 + y * 40));
	}
	particles.dispose();
});

test("transparent borders preserve full UV bounds and source opacity", () => {
	const { textures, readPixels } = fixture();
	const opaque = createBookParticleGeometry(
		textures,
		[0.7, 1, 0.1],
		96,
		readPixels,
	);
	const transparent = createBookParticleGeometry(
		textures,
		[0.7, 1, 0.1],
		96,
		(texture) => {
			const pixels = readPixels(texture);
			for (let i = 3; i < pixels.data.length; i += 4) {
				const x = ((i - 3) / 4) % pixels.width;
				pixels.data[i] = x === 0 || x === pixels.width - 1 ? 0 : 128;
			}
			return pixels;
		},
	);
	assert.deepEqual(
		transparent.getAttribute("targetPosition").array,
		opaque.getAttribute("targetPosition").array,
	);
	assert.deepEqual(
		transparent.getAttribute("color").array,
		opaque.getAttribute("color").array,
	);
	const alpha = transparent.getAttribute("opacity");
	assert.ok(Array.from(alpha.array).some((value) => value === 0));
	assert.ok(
		Array.from(alpha.array).some((value) => Math.abs(value - 128 / 255) < 1e-6),
	);
	opaque.dispose();
	transparent.dispose();
});

test("book cover inputs resolve to the same six slots used by particles and the mesh", () => {
	assert.deepEqual(
		getBookTextureUrls({
			front: "front",
			back: "back",
			spine: "spine",
			foreEdge: "foreEdge",
			top: "top",
			bottom: "bottom",
		}),
		["foreEdge", "spine", "top", "bottom", "front", "back"],
	);
	assert.equal(getBookTextureUrls("custom-front")[4], "custom-front");
	assert.equal(getBookTextureUrls(undefined, "thumbnail")[4], "thumbnail");
	assert.throws(
		() => createBookParticleGeometry([], [0.7, 1, 0.1]),
		/six face maps/,
	);
});
