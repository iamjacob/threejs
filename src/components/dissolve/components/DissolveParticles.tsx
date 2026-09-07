import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { perlinNoise } from "./shaders";

interface DissolveParticlesProps {
	dissolveProgress: number;
	bookGeometry: THREE.BufferGeometry;
}

const particleVertexShader = `
  ${perlinNoise}

  uniform float uTime;
  uniform float uProgress;
  uniform float uEdge;
  uniform float uFreq;
  uniform float uAmp;
  uniform float uBaseSize;

  attribute vec3 originalPosition;
  attribute vec3 velocity;
  attribute float maxOffset;
  attribute float angle;

  varying float vNoise;
  varying float vAngle;
  varying float vDistance;

  void main() {
    vNoise = snoise(originalPosition * uFreq + uTime * 0.1) * uAmp;
    vAngle = angle + uTime;

    vec3 currentPos = originalPosition + velocity * uTime * 0.5;
    vDistance = length(currentPos - originalPosition);

    if (vDistance > maxOffset) {
      currentPos = originalPosition;
    }

    vec4 viewPosition = modelViewMatrix * vec4(currentPos, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float size = uBaseSize / (vDistance + 1.0);
    gl_PointSize = size / -viewPosition.z;
  }
`;

const particleFragmentShader = `
  uniform vec3 uColor;
  uniform float uProgress;
  uniform float uEdge;
  uniform sampler2D uTexture;

  varying float vNoise;
  varying float vAngle;
  varying float vDistance;

  void main() {
    if (vNoise < uProgress) discard;
    if (vNoise > uProgress + uEdge) discard;

    vec2 coord = gl_PointCoord;
    coord = coord - 0.5;
    coord = coord * mat2(cos(vAngle), sin(vAngle), -sin(vAngle), cos(vAngle));
    coord = coord + 0.5;

    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.5) discard;

    float alpha = (1.0 - dist * 2.0) * (1.0 / (vDistance + 1.0));
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const DissolveParticles = ({
	dissolveProgress,
	bookGeometry,
}: DissolveParticlesProps) => {
	const { geometry, material } = useMemo(() => {
		const positionAttribute = bookGeometry.getAttribute(
			"position",
		) as THREE.BufferAttribute;
		const particleCount = positionAttribute.count;
		const sourcePositions = positionAttribute.array;
		const particleGeometry = new THREE.BufferGeometry();
		const particlePositions = new Float32Array(particleCount * 3);
		const originalPositions = new Float32Array(particleCount * 3);
		const velocities = new Float32Array(particleCount * 3);
		const maxOffsets = new Float32Array(particleCount);
		const angles = new Float32Array(particleCount);

		for (let index = 0; index < particleCount; index += 1) {
			const positionIndex = index * 3;

			particlePositions[positionIndex] = sourcePositions[positionIndex];
			particlePositions[positionIndex + 1] = sourcePositions[positionIndex + 1];
			particlePositions[positionIndex + 2] = sourcePositions[positionIndex + 2];
			originalPositions[positionIndex] = sourcePositions[positionIndex];
			originalPositions[positionIndex + 1] = sourcePositions[positionIndex + 1];
			originalPositions[positionIndex + 2] = sourcePositions[positionIndex + 2];
			velocities[positionIndex] = (Math.random() - 0.5) * 0.1;
			velocities[positionIndex + 1] = Math.random() * 0.2 + 0.05;
			velocities[positionIndex + 2] = (Math.random() - 0.5) * 0.1;
			maxOffsets[index] = Math.random() * 1.5 + 0.5;
			angles[index] = Math.random() * Math.PI * 2;
		}

		particleGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(particlePositions, 3),
		);
		particleGeometry.setAttribute(
			"originalPosition",
			new THREE.BufferAttribute(originalPositions, 3),
		);
		particleGeometry.setAttribute(
			"velocity",
			new THREE.BufferAttribute(velocities, 3),
		);
		particleGeometry.setAttribute(
			"maxOffset",
			new THREE.BufferAttribute(maxOffsets, 1),
		);
		particleGeometry.setAttribute(
			"angle",
			new THREE.BufferAttribute(angles, 1),
		);

		const particleMaterial = new THREE.ShaderMaterial({
			vertexShader: particleVertexShader,
			fragmentShader: particleFragmentShader,
			uniforms: {
				uTime: { value: 0 },
				uProgress: { value: -1.2 },
				uEdge: { value: 0.2 },
				uFreq: { value: 2 },
				uAmp: { value: 1 },
				uColor: { value: new THREE.Color("#ff6600") },
				uBaseSize: { value: 8 },
			},
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		});

		return { geometry: particleGeometry, material: particleMaterial };
	}, [bookGeometry]);

	useEffect(() => {
		material.uniforms.uProgress.value = THREE.MathUtils.lerp(
			-1.2,
			1.2,
			dissolveProgress,
		);
	}, [dissolveProgress, material]);

	useEffect(
		() => () => {
			geometry.dispose();
			material.dispose();
		},
		[geometry, material],
	);

	useFrame((state) => {
		material.uniforms.uTime.value = state.clock.elapsedTime;
	});

	return <points geometry={geometry} material={material} />;
};

export default DissolveParticles;
