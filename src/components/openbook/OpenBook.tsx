"use client";

import { useTexture } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { gsap } from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { useReadingStore } from "../../../stores/useReadingStore.ts";
import { bookImagePath } from "../../lib/bookImages";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import { BOOK_MATERIAL } from "../book/bookAppearance";
import { BOOK_ROTATION } from "../tour/tourBookPose";
import usePDFToImage from "./usePDFToImage";
import { useTourStore } from "../../stores/useTourStore";
import { useReaderPreferences } from "../../stores/useReaderPreferences";
import { CurlPage } from "./CurlPage";
import { curlPagePoint, releasedPageTurn } from "./pageCurl";

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
	const { camera, size, controls } = useThree();
	const cancelDragRef = useRef<(() => void) | null>(null);
	const readerState = useTourStore((state) => state.reader);
	const selectedBook = useSelectedBook();
	const book = providedBook ?? selectedBook;
	const [currentPage, setCurrentPage] = useState<number>(0);
	const [bookRead, setBookRead] = useState<boolean>(false);
	const [pagesToFlip] = useState<number>(1);
	const currentPageRef = useRef(currentPage);
	currentPageRef.current = currentPage;

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
			cancelDragRef.current?.();
			flipTimelineRef.current?.kill();
			gsap.killTweensOf(rotations);
			for (const page of pageRefs.current)
				if (page) gsap.killTweensOf(page.userData);
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
		publicAssetUrl(bookImagePath(frontUrl)),
		publicAssetUrl(bookImagePath(spineUrl)),
		publicAssetUrl(bookImagePath(backUrl)),
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
		const duration = presentation === "tour" ? 1.05 : 0.4;

		if (rightCover) {
			gsap.to(rightCover.rotation, {
				y: -openDegrees,
				duration,
				ease: "power2.inOut",
			});
		}

		if (leftCover) {
			gsap.to(leftCover.rotation, {
				y: openDegrees,
				duration,
				ease: "power2.inOut",
			});
		}

		for (let index = 0; index < pages; index += 1) {
			const page = pageRefs.current[index];

			if (page) {
				gsap.to(page.rotation, {
					y: index >= currentPageRef.current ? openDegrees : -openDegrees,
					duration: duration + 0.1 - 0.001 * index,
					ease: "power2.inOut",
				});
			}
		}
	}, [pages, presentation]);

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
			if (closing || !Number.isFinite(targetPage)) return;

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

			flippin(safeTargetPage, () => {
				setCurrentPage(safeTargetPage);

				const readingStore = useReadingStore.getState();
				readingStore.setCurrentPage?.(safeTargetPage);
				if (!flipQueueRef.current.length)
					readingStore.setSelectedPage(safeTargetPage);

				isAnimatingRef.current = false;
				const nextPage = flipQueueRef.current.shift();

				if (nextPage !== undefined) flipToRef.current(nextPage);
			});
		},
		[closing, currentPage, flippin, pages],
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

	const handlePagePointerDown = (
		index: number,
		event: ThreeEvent<PointerEvent>,
	): void => {
		event.stopPropagation();
		if (
			closing ||
			isAnimatingRef.current ||
			cancelDragRef.current ||
			event.button !== 0 ||
			!event.isPrimary
		)
			return;
		const forward = index >= currentPage;
		const target = currentPage + (forward ? 1 : -1);
		if (target < 0 || target >= pages) return;
		const page = pageRefs.current[forward ? currentPage : currentPage - 1];
		if (!page?.parent) return;
		const startAngle = forward ? openDegrees : -openDegrees;
		const endAngle = -startAngle;
		const projectEdge = (angle: number) => {
			const point = new THREE.Vector3(
				width * Math.cos(angle),
				0,
				-width * Math.sin(angle),
			).add(page.position);
			page.parent!.localToWorld(point);
			point.project(camera);
			return new THREE.Vector2(
				(point.x * size.width) / 2,
				(-point.y * size.height) / 2,
			);
		};
		const axis = projectEdge(endAngle).sub(projectEdge(startAngle));
		if (axis.lengthSq() < 100) return;
		const local = page.worldToLocal(event.point.clone());
		page.userData.curlCorner = THREE.MathUtils.clamp(
			local.y / (height / 2),
			-1,
			1,
		);
		const corner = page.userData.curlCorner;
		const grabX = THREE.MathUtils.clamp(local.x, width * 0.08, width);
		const grabY = THREE.MathUtils.clamp(local.y, -height / 2, height / 2);
		const projectGrab = (angle: number, bend: number) => {
			const p = curlPagePoint(grabX, grabY, width, height, bend, corner);
			const point = new THREE.Vector3(p.x, p.y, p.z)
				.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
				.add(page.position);
			page.parent!.localToWorld(point);
			point.project(camera);
			return new THREE.Vector2(
				(point.x * size.width) / 2,
				(-point.y * size.height) / 2,
			);
		};
		const grabStart = projectGrab(startAngle, 0);
		let dragAngle = startAngle,
			dragBend = 0;
		gsap.killTweensOf(page.userData);
		page.userData.curlDragWeight = 1;
		page.userData.curlDragBend = 0;
		gsap.killTweensOf(page.rotation);
		const orbitControls = controls as unknown as { enabled: boolean } | null;
		const wasEnabled = orbitControls?.enabled;
		if (orbitControls) orbitControls.enabled = false;
		isAnimatingRef.current = true;
		const pointerId = event.pointerId;
		const element = event.nativeEvent.target as HTMLElement;
		element.setPointerCapture?.(pointerId);
		const startX = event.clientX,
			startY = event.clientY;
		let progress = 0,
			maximumProgress = 0,
			velocity = 0,
			moved = 0,
			lastTime = performance.now();
		const move = (pointer: PointerEvent) => {
			if (pointer.pointerId !== pointerId) return;
			pointer.preventDefault();
			const dx = pointer.clientX - startX,
				dy = pointer.clientY - startY;
			moved = Math.max(moved, Math.hypot(dx, dy));
			const curlEnabled = useReaderPreferences.getState().pageCurl;
			if (curlEnabled) {
				// Fit the grabbed surface point to the pointer, including vertical
				// pulls. Damped finite-difference solve, as in the reference.
				const targetPoint = grabStart.clone().add(new THREE.Vector2(dx, dy));
				for (let iteration = 0; iteration < 8; iteration++) {
					const point = projectGrab(dragAngle, dragBend);
					const error = targetPoint.clone().sub(point);
					const da = projectGrab(dragAngle + 0.001, dragBend)
						.sub(point)
						.multiplyScalar(1000);
					const db = projectGrab(dragAngle, dragBend + 0.001)
						.sub(point)
						.multiplyScalar(1000);
					const aa = da.dot(da) + 2,
						ab = da.dot(db),
						bb = db.dot(db) + 2;
					const ea = da.dot(error),
						eb = db.dot(error),
						determinant = aa * bb - ab * ab;
					dragAngle = THREE.MathUtils.clamp(
						dragAngle +
							THREE.MathUtils.clamp(
								(bb * ea - ab * eb) / determinant,
								-0.15,
								0.15,
							),
						-openDegrees,
						openDegrees,
					);
					dragBend = THREE.MathUtils.clamp(
						dragBend +
							THREE.MathUtils.clamp(
								(aa * eb - ab * ea) / determinant,
								-0.3,
								0.3,
							),
						-3.2 * 1.33,
						3.2 * 1.33,
					);
				}
			} else {
				dragAngle =
					startAngle +
					(endAngle - startAngle) *
						THREE.MathUtils.clamp(
							(dx * axis.x + dy * axis.y) / axis.lengthSq(),
							0,
							1,
						);
			}
			const next = THREE.MathUtils.clamp(
				(dragAngle - startAngle) / (endAngle - startAngle),
				0,
				1,
			);
			gsap.to(page.userData, {
				curlDragBend: dragBend,
				duration: 0.06,
				overwrite: true,
				ease: "power1.out",
			});
			const now = performance.now();
			velocity =
				velocity * 0.35 +
				((next - progress) / Math.max(0.008, (now - lastTime) / 1000)) * 0.65;
			progress = next;
			maximumProgress = Math.max(maximumProgress, progress);
			lastTime = now;
			gsap.to(page.rotation, {
				y: startAngle + (endAngle - startAngle) * progress,
				duration: 0.09,
				overwrite: true,
				ease: "power1.out",
			});
		};
		const finish = (cancelled: boolean) => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", cancel);
			window.removeEventListener("blur", abort);
			element.removeEventListener("lostpointercapture", cancel);
			cancelDragRef.current = null;
			if (element.hasPointerCapture?.(pointerId))
				element.releasePointerCapture(pointerId);
			if (orbitControls && wasEnabled !== undefined)
				orbitControls.enabled = wasEnabled;
			isAnimatingRef.current = false;
			if (performance.now() - lastTime > 120) velocity = 0;
			gsap.killTweensOf(page.rotation);
			gsap.to(page.userData, {
				curlDragWeight: 0,
				duration: 0.35,
				overwrite: true,
				ease: "power2.out",
			});
			if (releasedPageTurn(maximumProgress, velocity, cancelled, moved < 6)) {
				flipTo(target);
			} else {
				gsap.to(page.rotation, {
					y: startAngle,
					duration: 0.35,
					overwrite: true,
					ease: "power2.out",
				});
			}
		};
		const up = (pointer: PointerEvent) => {
			if (pointer.pointerId === pointerId) finish(false);
		};
		const cancel = (pointer: PointerEvent) => {
			if (pointer.pointerId === pointerId) finish(true);
		};
		const abort = () => finish(true);
		cancelDragRef.current = abort;
		window.addEventListener("pointermove", move, { passive: false });
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", cancel);
		window.addEventListener("blur", abort);
		element.addEventListener("lostpointercapture", cancel);
	};

	useEffect(() => {
		const handleKeyPress = (event: KeyboardEvent): void => {
			if (
				closing ||
				cancelDragRef.current ||
				document.querySelector("dialog[open]")
			)
				return;
			if (
				event.target instanceof HTMLElement &&
				(event.target.isContentEditable ||
					/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))
			)
				return;
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
		cancelDragRef.current?.();
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
		if (readerState !== "closed") return;
		let isActive = true;

		const fetchAndUpdatePageImage = async (
			pageIndex: number,
		): Promise<void> => {
			try {
				const imageUrl = await getPageImage(pageIndex);
				if (!isActive || !imageUrl) return;

				const existing = pageRefs.current[pageIndex]?.children[0];
				if (
					existing instanceof THREE.Mesh &&
					pageMaterialsRef.current.get(existing)?.map?.userData.pageImage ===
						imageUrl
				)
					return;
				const loader = new THREE.TextureLoader();
				loader.load(
					imageUrl,
					(texture) => {
						if (!isActive) {
							texture.dispose();
							return;
						}

						const page = pageRefs.current[pageIndex];
						const pageMesh = page?.children[0];

						if (pageMesh instanceof THREE.Mesh) {
							const previous = pageMaterialsRef.current.get(pageMesh);
							previous?.map?.dispose();
							previous?.dispose();
							texture.colorSpace = THREE.SRGBColorSpace;
							texture.userData.pageImage = imageUrl;
							pageMesh.material = new THREE.MeshStandardMaterial({
								...BOOK_MATERIAL,
								roughness: 0.9,
								map: texture,
							});
							pageMaterialsRef.current.set(pageMesh, pageMesh.material);
						} else {
							texture.dispose();
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

		// Prepare textures as well as PDF images so the next turns are already ready.
		for (
			let pageIndex = currentPage;
			pageIndex <= Math.min(currentPage + 2, pages - 1);
			pageIndex++
		) {
			void fetchAndUpdatePageImage(pageIndex);
		}

		return () => {
			isActive = false;
		};
	}, [currentPage, getPageImage, pages, readerState]);

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
			rotation={presentation === "tour" ? BOOK_ROTATION : [0, Math.PI / 2, 0]}
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
				<group ref={pagesGroupRef}>
					{Array.from({ length: pages }, (_, index) => (
						<group
							// biome-ignore lint/suspicious/noArrayIndexKey: The index is the permanent page number.
							key={`page-${index}`}
							ref={(element) => {
								pageRefs.current[index] = element;
							}}
							position={[
								-width / 2,
								0,
								thickness * 0.5 - (index + 0.5) * pageThickness,
							]}
							rotation={[0, 0, 0]}
						>
							<CurlPage
								width={width}
								height={height}
								thickness={pageThickness}
								index={index}
								onPointerDown={(event) => handlePagePointerDown(index, event)}
							/>
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
