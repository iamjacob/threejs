import { MeshStandardMaterial, type Texture } from "three";
import { BOOK_MATERIAL } from "../../book/bookAppearance";
import { perlinNoise } from "./shaders";

export type DissolveUniforms = {
	uDissolveProgress: { value: number };
	uDissolveTime: { value: number };
};

export function createDissolveMaterial(
	map: Texture,
	uniforms: DissolveUniforms,
) {
	const material = new MeshStandardMaterial({ ...BOOK_MATERIAL, map });
	material.name = "Book cover with dissolve";
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace(
				"#include <common>",
				"#include <common>\nvarying vec3 vDissolvePosition;",
			)
			.replace(
				"#include <begin_vertex>",
				"#include <begin_vertex>\nvDissolvePosition = position;",
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <common>",
				`#include <common>
uniform float uDissolveProgress;
uniform float uDissolveTime;
varying vec3 vDissolvePosition;
${perlinNoise}`,
			)
			.replace(
				"#include <clipping_planes_fragment>",
				`#include <clipping_planes_fragment>
float dissolveEdge = 0.0;
if (uDissolveProgress > 0.0) {
  if (uDissolveProgress >= 1.0) discard;
  float threshold = mix(-1.2, 1.2, uDissolveProgress);
  float noise = snoise(vDissolvePosition * 2.0 + uDissolveTime * 0.1);
  if (noise < threshold) discard;
  dissolveEdge = 1.0 - smoothstep(threshold, threshold + 0.2, noise);
}`,
			)
			.replace(
				"#include <emissivemap_fragment>",
				`#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.12, 0.015) * dissolveEdge * 3.0;`,
			);
	};
	// Keep the regular Three.js lighting, reflections, tone mapping and color conversion.
	material.customProgramCacheKey = () => "boooks-standard-dissolve-v1";
	return material;
}
