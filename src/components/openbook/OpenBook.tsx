"use client";

import { useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { gsap } from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { useReadingStore } from "../../../stores/useReadingStore.ts";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import { BOOK_MATERIAL } from "../book/bookAppearance";
import usePDFToImage from "./usePDFToImage";

type BookDimensions = readonly [
	width: number,
	height: number,
	thickness: number,
];

interface BookCover {
	front: string;
	spine: string;
	back: string;
}

interface BookData {
	id: string;
	bookID?: string;
	title: string;
	author: string;
	pages: number;
	dimensions: BookDimensions;
	cover: BookCover;
	pdf?: string;
	position?: {
		x: number;
		y: number;
		z: number;
	};
}

interface OpenBookProps {
	presentation?: "default" | "tour";
	closing?: boolean;
	coverImg?: string | false;
	orbit?: boolean;
	book?: BookData;
	onToggle?: () => void;
	pdfUrl?: string;
}

const OpenBook = ({
	presentation = "default",
	closing = false,
	coverImg = false,
	orbit = true,
	book: providedBook,
	onToggle = () => undefined,
	pdfUrl,
}: OpenBookProps) => {
	const selectedBook = useSelectedBook();
	const book = providedBook ?? selectedBook;
	const [currentPage, setCurrentPage] = useState<number>(0);
	const [bookRead, setBookRead] = useState<boolean>(false);
	const [pagesToFlip] = useState<number>(1);

	const lastTap = useRef<number>(0);
	const leftPageRef = useRef<THREE.Group>(null);
	const rightPageRef = useRef<THREE.Group>(null);
	const spinePageRef = useRef<THREE.Mesh>(null);
	const pagesGroupRef = useRef<THREE.Group>(null);
	const pageRefs = useRef<Array<THREE.Group | null>>([]);
	const isAnimatingRef = useRef<boolean>(false);
	const flipQueueRef = useRef<number[]>([]);
	const flipToRef = useRef<(targetPage: number) => void>(() => undefined);
	const flipTimelineRef = useRef<gsap.core.Timeline | null>(null);
	const pageMaterialsRef = useRef(
		new Map<THREE.Mesh, THREE.MeshStandardMaterial>(),
	);

	useEffect(() => {
		const rotations = [
			rightPageRef.current,
			leftPageRef.current,
			...pageRefs.current,
		].flatMap((page) => (page ? [page.rotation] : []));
		const materials = pageMaterialsRef.current;
		return () => {
			flipTimelineRef.current?.kill();
			gsap.killTweensOf(rotations);
			for (const material of materials.values()) {
				material.map?.dispose();
				material.dispose();
			}
			materials.clear();
		};
	}, []);

	const [width, height, thickness] = book.dimensions;
	const pages = Math.max(1, Math.min(120, book.pages));
	const pageThickness = thickness / pages;
	const openDegrees = 1;

	const frontUrl = coverImg || book.cover.front;
	const spineUrl = coverImg || book.cover.spine;
	const backUrl = coverImg || book.cover.back;

	const [frontTex, spineTex, backTex] = useTexture([
		publicAssetUrl(frontUrl),
		publicAssetUrl(spineUrl),
		publicAssetUrl(backUrl),
	]) as [THREE.Texture, THREE.Texture, THREE.Texture];

	const activePdfUrl = pdfUrl ?? book.pdf ?? null;

	useEffect(() => {
		for (const texture of [frontTex, spineTex, backTex]) {
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.needsUpdate = true;
		}
	}, [frontTex, spineTex, backTex]);
	const { getPageImage } = usePDFToImage(
		activePdfUrl ? publicAssetUrl(activePdfUrl) : null,
	);

	const open = useCallback((): void => {
		const rightCover = rightPageRef.current;
		const leftCover = leftPageRef.current;

		if (rightCover) {
			gsap.to(rightCover.rotation, {
				y: -openDegrees,
				duration: 0.4,
			});
		}

		if (leftCover) {
			gsap.to(leftCover.rotation, {
				y: openDegrees,
				duration: 0.4,
			});
		}

		for (let index = 0; index < pages; index += 1) {
			const page = pageRefs.current[index];

			if (page) {
				gsap.to(page.rotation, {
					y: index >= currentPage ? openDegrees : -openDegrees,
					duration: Math.max(0.05, 0.5 - 0.001 * index),
				});
			}
		}
	}, [currentPage, pages]);

	const flippin = useCallback(
		(foldTo: number, onComplete: () => void): void => {
			const pagesDelta = Math.abs(foldTo - currentPage);
			const baseDuration = Math.max(0.06, 0.6 - 0.04 * pagesDelta);
			const timeline = gsap.timeline({ onComplete });
			flipTimelineRef.current = timeline;

			const rightCover = rightPageRef.current;
			const leftCover = leftPageRef.current;

			if (rightCover) {
				timeline.to(
					rightCover.rotation,
					{
						y: -openDegrees,
						duration: Math.max(0.12, baseDuration * 0.6),
						ease: "power2.inOut",
					},
					0,
				);
			}

			if (leftCover) {
				timeline.to(
					leftCover.rotation,
					{
						y: openDegrees,
						duration: Math.max(0.12, baseDuration * 0.6),
						ease: "power2.inOut",
					},
					0,
				);
			}

			for (let index = 0; index < pages; index += 1) {
				const page = pageRefs.current[index];
				if (!page) continue;

				const targetY = index >= foldTo ? openDegrees : -openDegrees;
				const distance = Math.abs(index - foldTo);
				const delay = Math.min(0.25, distance * 0.015);
				const duration = Math.max(0.04, baseDuration - distance * 0.01);

				timeline.to(
					page.rotation,
					{
						y: targetY,
						duration,
						ease: "power2.inOut",
					},
					delay,
				);
			}
		},
		[currentPage, pages],
	);

	const flipTo = useCallback(
		(targetPage: number): void => {
			if (!Number.isFinite(targetPage)) return;

			const safeTargetPage = Math.min(
				Math.max(Math.trunc(targetPage), 0),
				pages - 1,
			);

			if (safeTargetPage === currentPage) return;

			if (isAnimatingRef.current) {
				flipQueueRef.current.push(safeTargetPage);
				return;
			}

			isAnimatingRef.current = true;
			open();

			flippin(safeTargetPage, () => {
				setCurrentPage(safeTargetPage);

				const readingStore = useReadingStore.getState();
				readingStore.setCurrentPage?.(safeTargetPage);

				isAnimatingRef.current = false;
				const nextPage = flipQueueRef.current.shift();

				if (nextPage !== undefined) flipToRef.current(nextPage);
			});
		},
		[currentPage, flippin, open, pages],
	);

	flipToRef.current = flipTo;

	const flipForward = useCallback((): void => {
		if (currentPage >= pages - pagesToFlip) return;

		flipTo(Math.min(currentPage + pagesToFlip, pages - 1));
	}, [currentPage, pages, pagesToFlip, flipTo]);

	const flipBackward = useCallback((): void => {
		if (currentPage <= 0) return;

		flipTo(Math.max(currentPage - pagesToFlip, 0));
	}, [currentPage, pagesToFlip, flipTo]);

	const handleTap = (event: ThreeEvent<MouseEvent>): void => {
		event.stopPropagation();
		if (closing) return;
		const now = Date.now();

		if (now - lastTap.current < 300) {
			onToggle();
			lastTap.current = 0;
			return;
		}

		lastTap.current = now;
	};

	const handlePageClick = (
		index: number,
		event: ThreeEvent<MouseEvent>,
	): void => {
		event.stopPropagation();
		if (closing) return;

		if (index >= currentPage) {
			flipTo(Math.min(index + pagesToFlip - 1, pages - 1));
		} else {
			flipTo(Math.max(index - pagesToFlip + 1, 0));
		}
	};

	useEffect(() => {
		const handleKeyPress = (event: KeyboardEvent): void => {
			if (closing || document.querySelector("dialog[open]")) return;
			if (event.key === "ArrowRight") {
				flipForward();
			} else if (event.key === "ArrowLeft") {
				flipBackward();
			}
		};

		window.addEventListener("keydown", handleKeyPress);
		return () => window.removeEventListener("keydown", handleKeyPress);
	}, [closing, flipBackward, flipForward]);

	useEffect(() => {
		if (!closing) {
			open();
			return;
		}
		flipTimelineRef.current?.kill();
		flipQueueRef.current = [];
		isAnimatingRef.current = false;
		const rotations = [
			rightPageRef.current,
			leftPageRef.current,
			...pageRefs.current,
		].flatMap((page) => (page ? [page.rotation] : []));
		gsap.killTweensOf(rotations);
		const closingTween = gsap.to(rotations, {
			y: 0,
			duration: 0.35,
			ease: "power2.inOut",
		});
		return () => {
			closingTween.kill();
		};
	}, [closing, open]);

	useEffect(() => {
		let isActive = true;

		const fetchAndUpdatePageImage = async (): Promise<void> => {
			try {
				const imageUrl = await getPageImage(currentPage);
				if (!isActive || !imageUrl) return;

				const loader = new THREE.TextureLoader();
				loader.load(
					imageUrl,
					(texture) => {
						if (!isActive) {
							texture.dispose();
							return;
						}

						const page = pageRefs.current[currentPage];
						const pageMesh = page?.children[0];

						if (pageMesh instanceof THREE.Mesh) {
							const previous = pageMaterialsRef.current.get(pageMesh);
							previous?.map?.dispose();
							previous?.dispose();
							texture.colorSpace = THREE.SRGBColorSpace;
							pageMesh.material = new THREE.MeshStandardMaterial({
								...BOOK_MATERIAL,
								roughness: 0.9,
								map: texture,
							});
							pageMaterialsRef.current.set(pageMesh, pageMesh.material);
						}
					},
					undefined,
					(error: unknown) => {
						console.error("Error loading page texture:", error);
					},
				);
			} catch (error: unknown) {
				console.error("Error loading page image:", error);
			}
		};

		void fetchAndUpdatePageImage();

		return () => {
			isActive = false;
		};
	}, [currentPage, getPageImage]);

	const selectedPage = useReadingStore((state) => state.selectedPage);

	useEffect(() => {
		if (
			!closing &&
			typeof selectedPage === "number" &&
			selectedPage !== currentPage
		) {
			flipTo(selectedPage);
		}
	}, [closing, currentPage, flipTo, selectedPage]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: This is a Three.js group, with page controls also available outside the canvas.
		<group
			rotation={
				presentation === "tour" ? [0, 0, Math.PI / 4] : [0, Math.PI / 2, 0]
			}
			onPointerDown={() => setBookRead((isReading) => !isReading)}
			onClick={handleTap}
			userData={{ bookRead, orbit }}
		>
			<mesh
				rotation={presentation === "tour" ? [0, 0, 0] : [0, Math.PI, 0.45]}
				position={[0, 0, 0]}
				name="open-book"
				userData={{ bookID: book.id, pdf: activePdfUrl }}
			>
				<group ref={pagesGroupRef} position={[0.02, 1, 0]}>
					{Array.from({ length: pages }, (_, index) => (
						<group
							// biome-ignore lint/suspicious/noArrayIndexKey: The index is the permanent page number.
							key={`page-${index}`}
							ref={(element) => {
								pageRefs.current[index] = element;
							}}
							position={[
								-width / 2,
								-1,
								index * -pageThickness + thickness * 0.5,
							]}
							rotation={[0, 0, 0]}
						>
							{/* biome-ignore lint/a11y/noStaticElementInteractions: Three.js mesh; page controls are also available outside the canvas. */}
							<mesh
								castShadow
								receiveShadow
								onClick={(event) => handlePageClick(index, event)}
								position={[width / 2, 0, 0]}
							>
								<boxGeometry args={[width, height, pageThickness]} />
								<meshStandardMaterial
									roughness={0.9}
									color={index % 2 === 0 ? "white" : "lightgray"}
								/>
							</mesh>
						</group>
					))}
				</group>

				<group
					ref={rightPageRef}
					position={[-width * 0.501, 0, thickness * 0.5]}
					rotation={[0, 0, 0]}
				>
					<mesh
						name="open-book-front"
						position={[width / 2, 0, 0]}
						castShadow
						receiveShadow
					>
						<boxGeometry args={[width, height, 0.001]} />
						<meshStandardMaterial {...BOOK_MATERIAL} map={frontTex} />
					</mesh>
				</group>

				<group
					ref={leftPageRef}
					position={[-width * 0.5, 0, -thickness * 0.5]}
					rotation={[0, 0, 0]}
				>
					<mesh position={[width / 2, 0, 0]} castShadow receiveShadow>
						<boxGeometry args={[width, height, 0.001]} />
						<meshStandardMaterial {...BOOK_MATERIAL} map={backTex} />
					</mesh>
				</group>

				<mesh
					ref={spinePageRef}
					position={[-width * 0.501, 0, 0]}
					rotation={[0, 0, 0]}
					castShadow
					receiveShadow
				>
					<boxGeometry args={[0.001, height, thickness]} />
					<meshStandardMaterial {...BOOK_MATERIAL} map={spineTex} />
				</mesh>
			</mesh>
		</group>
	);
};

export type { BookData, OpenBookProps };
export default OpenBook;
