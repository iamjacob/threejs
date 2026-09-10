import { shaderMaterial } from "@react-three/drei";
import { extend } from "@react-three/fiber";
import * as THREE from "three";

export const SceneGlassMaterial = shaderMaterial(
	{
		uWinResolution: new THREE.Vector2(),
		uSceneDiffuse: null as THREE.Texture | null,
		uBlockSize: 20,
		uColorLevels: 5,
		uAlpha: 1,
	},
	/* glsl */ `
    varying vec4 vUv;

    void main() {
      vec4 modelViewPosition =
        modelViewMatrix * vec4(position, 1.0);

      vUv = projectionMatrix * modelViewPosition;
      gl_Position = vUv;
    }
  `,
	/* glsl */ `
    precision highp float;

    uniform sampler2D uSceneDiffuse;
    uniform vec2 uWinResolution;
    uniform float uBlockSize;
    uniform float uColorLevels;
    uniform float uAlpha;

    varying vec4 vUv;

    void main() {
      // Convert clip space to screen-space UVs
      vec2 screenUV =
        (vUv.xy / vUv.w) * 0.5 + 0.5;

      // Pixelate the screen coordinates
      vec2 blocks = uWinResolution / uBlockSize;
      vec2 pixelatedUv =
        floor(screenUV * blocks) / blocks;

      // Sample the scene behind the mesh
      vec3 sceneColor =
        texture2D(uSceneDiffuse, pixelatedUv).rgb;

      gl_FragColor = vec4(sceneColor, uAlpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>

      // Step brightness while keeping channel ratios, so warm covers retain
      // their hues instead of collapsing to the same gray or yellow RGB bins.
      if (uColorLevels > 1.0) {
        float intervals = uColorLevels - 1.0;
        float peak = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b));
        float steppedPeak = floor(peak * intervals + 0.5) / intervals;
        gl_FragColor.rgb *= steppedPeak / max(peak, 0.00001);
      }
    }
  `,
);

export const GlassMaterial = extend(SceneGlassMaterial);
