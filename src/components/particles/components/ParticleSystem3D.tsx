import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { BookData, ParticleColors, RgbColor } from "../types";
import { extractBookColorsAndPixels, getBookCoverUrl } from "./colorExtractor";
import { particleFragmentShader, particleVertexShader } from "./shaders";

interface ParticleSystem3DProps {
	bookData: BookData;
	isParticleMode?: boolean;
	particleProgress?: number;
	resolution?: number;
}

type Vector3Tuple = [number, number, number];
type TextureType = "cover" | "back" | "spine" | "side" | "edge";

interface BookFace {
	name: string;
	position: Vector3Tuple;
	width: number;
	height: number;
	uDirection: Vector3Tuple;
	vDirection: Vector3Tuple;
	priority: number;
	textureType: TextureType;
}

const defaultPalette: RgbColor[] = [
	[1, 0.4, 0.1],
	[0.2, 0.6, 1],
	[1, 0.9, 0.3],
];

const defaultBookColors = (): ParticleColors => ({
	palette: defaultPalette,
	percentages: [0.4, 0.3, 0.3],
	pixelData: null,
});

const ParticleSystem3D = ({
	bookData,
	isParticleMode = false,
	particleProgress = 0,
	resolution = 3000,
}: ParticleSystem3DProps) => {
	const pointsRef = useRef<THREE.Points>(null);
	const materialRef = useRef<THREE.ShaderMaterial>(null);
	const [bookColors, setBookColors] = useState<ParticleColors | null>(null);

	useEffect(() => {
		let isActive = true;
		const coverUrl = getBookCoverUrl(bookData);

		setBookColors(null);

		if (!coverUrl) {
			setBookColors(defaultBookColors());
			return () => {
				isActive = false;
			};
		}

		extractBookColorsAndPixels(coverUrl, 8)
			.then((result) => {
				if (!isActive) return;

				setBookColors({
					palette: result.palette,
					percentages: result.colors.map((color) => color.percentage),
					pixelData: result.pixelData,
				});
			})
			.catch((error: unknown) => {
				console.warn("Color extraction failed:", error);
				if (isActive) setBookColors(defaultBookColors());
			});

		return () => {
			isActive = false;
		};
	}, [bookData]);

	const geometry = useMemo(() => {
		if (!bookColors) return null;

		const positions: number[] = [];
		const targetPositions: number[] = [];
		const colors: number[] = [];
		const sizes: number[] = [];
		const velocities: number[] = [];
		const faceIds: number[] = [];
		const bookWidth = bookData.scale?.width ?? 2;
		const bookHeight = bookData.scale?.height ?? 3;
		const bookThickness = bookData.scale?.thickness ?? 0.3;
		const { palette } = bookColors;
		const coverPixels = bookColors.pixelData ?? [];
		const coverBounds = coverPixels.reduce(
			(bounds, pixel) => ({
				minimumX: Math.min(bounds.minimumX, pixel.x),
				maximumX: Math.max(bounds.maximumX, pixel.x),
				minimumY: Math.min(bounds.minimumY, pixel.y),
				maximumY: Math.max(bounds.maximumY, pixel.y),
			}),
			{
				minimumX: Number.POSITIVE_INFINITY,
				maximumX: Number.NEGATIVE_INFINITY,
				minimumY: Number.POSITIVE_INFINITY,
				maximumY: Number.NEGATIVE_INFINITY,
			},
		);

		const faces: BookFace[] = [
			{
				name: "Front Cover",
				position: [0, 0, bookThickness / 2],
				width: bookWidth,
				height: bookHeight,
				uDirection: [1, 0, 0],
				vDirection: [0, 1, 0],
				priority: 3,
				textureType: "cover",
			},
			{
				name: "Back Cover",
				position: [0, 0, -bookThickness / 2],
				width: bookWidth,
				height: bookHeight,
				uDirection: [-1, 0, 0],
				vDirection: [0, 1, 0],
				priority: 2,
				textureType: "back",
			},
			{
				name: "Spine",
				position: [-bookWidth / 2, 0, 0],
				width: bookThickness,
				height: bookHeight,
				uDirection: [0, 0, 1],
				vDirection: [0, 1, 0],
				priority: 2,
				textureType: "spine",
			},
			{
				name: "Right Side",
				position: [bookWidth / 2, 0, 0],
				width: bookThickness,
				height: bookHeight,
				uDirection: [0, 0, -1],
				vDirection: [0, 1, 0],
				priority: 1,
				textureType: "side",
			},
			{
				name: "Top Edge",
				position: [0, bookHeight / 2, 0],
				width: bookWidth,
				height: bookThickness,
				uDirection: [1, 0, 0],
				vDirection: [0, 0, -1],
				priority: 1,
				textureType: "edge",
			},
			{
				name: "Bottom Edge",
				position: [0, -bookHeight / 2, 0],
				width: bookWidth,
				height: bookThickness,
				uDirection: [1, 0, 0],
				vDirection: [0, 0, 1],
				priority: 1,
				textureType: "edge",
			},
		];

		faces.forEach((face, faceIndex) => {
			if (face.textureType === "cover" && coverPixels.length > 0) {
				const pixelWidth = coverBounds.maximumX - coverBounds.minimumX || 1;
				const pixelHeight = coverBounds.maximumY - coverBounds.minimumY || 1;

				for (const pixel of coverPixels) {
					const uCoordinate =
						((pixel.x - coverBounds.minimumX) / pixelWidth - 0.5) * face.width;
					const vCoordinate =
						((pixel.y - coverBounds.minimumY) / pixelHeight - 0.5) *
						face.height;

					targetPositions.push(
						face.position[0] +
							uCoordinate * face.uDirection[0] +
							vCoordinate * face.vDirection[0],
						face.position[1] +
							uCoordinate * face.uDirection[1] +
							vCoordinate * face.vDirection[1],
						face.position[2] +
							uCoordinate * face.uDirection[2] +
							vCoordinate * face.vDirection[2],
					);

					const radius = 0.75 + Math.random() * 1.5;
					const theta = Math.random() * Math.PI * 2;
					const phi = Math.random() * Math.PI;
					positions.push(
						radius * Math.sin(phi) * Math.cos(theta),
						radius * Math.sin(phi) * Math.sin(theta),
						radius * Math.cos(phi),
					);

					colors.push(pixel.color[0], pixel.color[1], pixel.color[2]);
					velocities.push(
						(Math.random() - 0.5) * 0.008,
						(Math.random() - 0.5) * 0.008,
						(Math.random() - 0.5) * 0.008,
					);
					sizes.push(1.4 + Math.random() * 0.3);
					faceIds.push(faceIndex);
				}

				return;
			}

			const faceArea = face.width * face.height;
			const baseDensity = resolution * face.priority;
			const particlesForFace = Math.max(
				face.priority * 30,
				Math.floor((baseDensity * faceArea) / (bookWidth * bookHeight)),
			);
			const actualParticles =
				face.textureType === "spine"
					? Math.max(particlesForFace, resolution * 0.3)
					: particlesForFace;
			const aspectRatio = face.width / face.height;
			const resolutionU = Math.ceil(Math.sqrt(actualParticles * aspectRatio));
			const resolutionV = Math.ceil(actualParticles / resolutionU);

			console.log(
				`${face.name}: ${resolutionU}x${resolutionV} = ${resolutionU * resolutionV} particles (priority: ${face.priority})`,
			);

			for (let u = 0; u < resolutionU; u += 1) {
				for (let v = 0; v < resolutionV; v += 1) {
					const uCoordinate =
						(u / Math.max(1, resolutionU - 1) - 0.5) * face.width +
						(Math.random() - 0.5) * (face.width / resolutionU) * 0.3;
					const vCoordinate =
						(v / Math.max(1, resolutionV - 1) - 0.5) * face.height +
						(Math.random() - 0.5) * (face.height / resolutionV) * 0.3;

					targetPositions.push(
						face.position[0] +
							uCoordinate * face.uDirection[0] +
							vCoordinate * face.vDirection[0],
						face.position[1] +
							uCoordinate * face.uDirection[1] +
							vCoordinate * face.vDirection[1],
						face.position[2] +
							uCoordinate * face.uDirection[2] +
							vCoordinate * face.vDirection[2],
					);

					const radius = 0.75 + Math.random() * 1.5;
					const theta = Math.random() * Math.PI * 2;
					const phi = Math.random() * Math.PI;
					positions.push(
						radius * Math.sin(phi) * Math.cos(theta),
						radius * Math.sin(phi) * Math.sin(theta),
						radius * Math.cos(phi),
					);

					let colorIndex: number;
					if (face.textureType === "cover") {
						colorIndex = Math.floor(
							Math.random() * Math.min(3, palette.length),
						);
					} else if (face.textureType === "back") {
						colorIndex = Math.floor(Math.random() * palette.length);
					} else if (face.textureType === "spine") {
						const spineColors =
							palette.length > 3
								? [
										Math.floor(palette.length * 0.6),
										Math.floor(palette.length * 0.8),
									]
								: [0, 1];
						colorIndex =
							spineColors[Math.floor(Math.random() * spineColors.length)] ?? 0;
					} else {
						colorIndex = Math.floor(
							Math.random() * Math.min(2, palette.length),
						);
					}

					const color = palette[colorIndex] ?? palette[0] ?? defaultPalette[0];
					colors.push(color[0], color[1], color[2]);
					velocities.push(
						(Math.random() - 0.5) * 0.008,
						(Math.random() - 0.5) * 0.008,
						(Math.random() - 0.5) * 0.008,
					);

					let baseSize = 0.8;
					if (face.textureType === "cover") baseSize = 1.4;
					else if (face.textureType === "spine") baseSize = 1.1;
					else if (face.textureType === "back") baseSize = 1.2;

					sizes.push(baseSize + Math.random() * 0.3);
					faceIds.push(faceIndex);
				}
			}
		});

		console.log(
			`Generated ${positions.length / 3} particles for ${faces.length} faces`,
		);

		const bufferGeometry = new THREE.BufferGeometry();
		bufferGeometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(positions, 3),
		);
		bufferGeometry.setAttribute(
			"targetPosition",
			new THREE.Float32BufferAttribute(targetPositions, 3),
		);
		bufferGeometry.setAttribute(
			"color",
			new THREE.Float32BufferAttribute(colors, 3),
		);
		bufferGeometry.setAttribute(
			"size",
			new THREE.Float32BufferAttribute(sizes, 1),
		);
		bufferGeometry.setAttribute(
			"velocity",
			new THREE.Float32BufferAttribute(velocities, 3),
		);
		bufferGeometry.setAttribute(
			"faceId",
			new THREE.Float32BufferAttribute(faceIds, 1),
		);

		return bufferGeometry;
	}, [bookColors, resolution, bookData]);

	const material = useMemo(() => {
		if (!bookColors) return null;

		return new THREE.ShaderMaterial({
			vertexShader: particleVertexShader,
			fragmentShader: particleFragmentShader,
			uniforms: {
				uProgress: { value: 0 },
				uTime: { value: 0 },
				uSize: { value: 12 },
			},
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		});
	}, [bookColors]);

	useEffect(() => {
		if (materialRef.current) {
			materialRef.current.uniforms.uProgress.value = particleProgress;
		}
	}, [particleProgress]);

	useEffect(
		() => () => {
			geometry?.dispose();
		},
		[geometry],
	);

	useEffect(
		() => () => {
			material?.dispose();
		},
		[material],
	);

	useFrame((state) => {
		if (materialRef.current) {
			materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
		}

		if (pointsRef.current) {
			pointsRef.current.rotation.y =
				Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
		}
	});

	if (!geometry || !material || !isParticleMode) return null;

	return (
		<points ref={pointsRef} geometry={geometry}>
			<primitive ref={materialRef} object={material} attach="material" />
		</points>
	);
};

export default ParticleSystem3D;
