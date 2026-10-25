import { shaderMaterial } from "@react-three/drei";
import {
	AddEquation,
	AdditiveBlending,
	CustomBlending,
	OneFactor,
	OneMinusSrcAlphaFactor,
	ShaderMaterial,
	Uniform,
	Vector2,
	Vector3,
} from "three";
import { AURA_FRAG, AURA_VERT, EMBER_FRAG, EMBER_VERT } from "./shaders";

/**
 * One compiled aura program. Each mesh gets its own material instance so a
 * crossfade can carry two sets of uniforms; three.js caches the program by source.
 */
export const AuraMaterial = shaderMaterial(
	{
		uTime: 0,
		uSeed: 0,
		uMotion: 1,
		uPlaneSize: new Vector2(1, 1),
		uCoverSize: new Vector2(1, 1),
		uCornerRadius: 1,
		uAlignment: 0,
		uLiked: 0,
		uReadState: 0,
		uProgress: 0,
		uOwned: 1,
		uInvite: 0,
		uBloom: 0,
		uFriendColor: new Vector3(1, 0.62, 0.43),
		uColors: [new Vector3(), new Vector3(), new Vector3(), new Vector3()],
		uWaveA: 3,
		uWaveB: 7,
		uRings: 3,
		uShape: 0,
		uInnerGlow: 1,
	},
	AURA_VERT,
	AURA_FRAG,
	(material) => {
		if (!material) return;
		// UniformsUtils clones arrays shallowly; give this instance its own colours.
		material.uColors = [
			new Vector3(),
			new Vector3(),
			new Vector3(),
			new Vector3(),
		];
		material.transparent = false;
		material.depthTest = false;
		material.depthWrite = false;
		material.blending = AdditiveBlending;
		material.toneMapped = true;
	},
);

export function createEmberMaterial() {
	const material = new ShaderMaterial({
		vertexShader: EMBER_VERT,
		fragmentShader: EMBER_FRAG,
		uniforms: {
			uTime: new Uniform(0),
			uMotion: new Uniform(1),
			uPR: new Uniform(1),
			uFade: new Uniform(1),
		},
		transparent: false,
		depthTest: false,
		depthWrite: false,
		blending: CustomBlending,
		blendSrc: OneFactor,
		blendDst: OneMinusSrcAlphaFactor,
		blendEquation: AddEquation,
	});
	material.toneMapped = true;
	return material;
}
