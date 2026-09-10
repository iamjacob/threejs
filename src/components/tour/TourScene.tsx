import { useFrame } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { type Group, MathUtils, type Mesh, Quaternion, Vector3 } from "three";
import { books } from "../../lib/bookCatalog";
import { useSelectedBook } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import Book from "../book/book";
import Dissolve from "../dissolve/Dissolve";
import OpenBook from "../openbook/OpenBook";
import Bookshelves, { shelfBookPose } from "../shelves/Bookshelves";
import Shelves from "../shelves/Shelves";
import ShelfArrival from "./ShelfArrival";
import { BOOK_TILT, focusBookPosition } from "./tourBookPose";

function ShelfBackdrop({ children }: { children: ReactNode }) {
	const ref = useRef<Group>(null);
	useFrame(() => {
		const { stage, elapsed } = useTourStore.getState();
		const opacity =
			stage === "read"
				? 0.35
				: stage === "return"
					? 0.35 + 0.65 * MathUtils.smoothstep(elapsed / 1.8, 0, 1)
					: stage === "pull"
						? 1 - 0.65 * MathUtils.smoothstep((elapsed - 0.6) / 1.4, 0, 1)
						: 1;
		ref.current?.traverse((object) => {
			const mesh = object as Mesh;
			if (!mesh.isMesh) return;
			const materials = Array.isArray(mesh.material)
				? mesh.material
				: [mesh.material];
			for (const material of materials) {
				if (!material.transparent) {
					material.transparent = true;
					material.needsUpdate = true;
				}
				material.opacity = opacity;
				material.depthWrite = opacity > 0.5;
			}
		});
	});
	return <group ref={ref}>{children}</group>;
}

function FlyingBook() {
	const book = useSelectedBook();
	const origin =
		useTourStore((state) => state.origin) ?? shelfBookPose(book.id);
	const ref = useRef<Group>(null);
	const start = useMemo(
		() => new Vector3(...origin.position),
		[origin.position],
	);
	const rotation = useMemo(
		() => new Quaternion(...origin.quaternion),
		[origin.quaternion],
	);
	const end = useMemo(
		() => new Vector3(...focusBookPosition(book.id)),
		[book.id],
	);
	const endRotation = useMemo(
		() => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), BOOK_TILT),
		[],
	);
	useFrame(() => {
		if (!ref.current) return;
		const progress = MathUtils.smoothstep(
			useTourStore.getState().elapsed / 2,
			0,
			1,
		);
		ref.current.position.lerpVectors(start, end, progress);
		ref.current.position.y += Math.sin(progress * Math.PI) * 0.35;
		ref.current.quaternion.slerpQuaternions(rotation, endRotation, progress);
	});
	return (
		<group
			ref={ref}
			name="flying-book"
			position={origin.position}
			quaternion={origin.quaternion}
		>
			<Book />
		</group>
	);
}

function Ready() {
	const stage = useTourStore((state) => state.stage);
	const runId = useTourStore((state) => state.runId);
	useEffect(() => {
		const current = useTourStore.getState();
		if (current.stage === stage && current.runId === runId)
			useTourStore.setState({ ready: true });
	}, [stage, runId]);
	return null;
}

function ReturningBook({ id }: { id: string }) {
	const book = books.find((item) => item.id === id) ?? books[0];
	const ref = useRef<Group>(null);
	const flight = useMemo(() => {
		const pose = shelfBookPose(id);
		return {
			start: new Vector3(...focusBookPosition(id)),
			end: new Vector3(...pose.position),
			startRotation: new Quaternion().setFromAxisAngle(
				new Vector3(0, 0, 1),
				BOOK_TILT,
			),
			endRotation: new Quaternion(...pose.quaternion),
		};
	}, [id]);
	useFrame(() => {
		if (!ref.current) return;
		const t = MathUtils.smoothstep(useTourStore.getState().elapsed / 2, 0, 1);
		ref.current.position.lerpVectors(flight.start, flight.end, t);
		ref.current.quaternion.slerpQuaternions(
			flight.startRotation,
			flight.endRotation,
			t,
		);
	});
	return (
		<group ref={ref} name="returning-book" userData={{ bookId: id }}>
			<Book book={book} />
		</group>
	);
}

function ReadingBook({ closing }: { closing: boolean }) {
	const book = useSelectedBook();
	const ref = useRef<Group>(null);
	const flight = useMemo(() => {
		const pose = shelfBookPose(book.id);
		const tilt = new Quaternion().setFromAxisAngle(
			new Vector3(0, 0, 1),
			BOOK_TILT,
		);
		return {
			start: new Vector3(...focusBookPosition(book.id)),
			end: new Vector3(...pose.position),
			startRotation: new Quaternion(),
			// OpenBook already supplies the reading tilt, so remove it from the outer rotation.
			endRotation: new Quaternion(...pose.quaternion).multiply(tilt.invert()),
		};
	}, [book.id]);
	useFrame(() => {
		if (!ref.current) return;
		const t = closing
			? MathUtils.smoothstep(
					(useTourStore.getState().elapsed - 0.35) / 1.45,
					0,
					1,
				)
			: 0;
		ref.current.position.lerpVectors(flight.start, flight.end, t);
		ref.current.position.y += Math.sin(t * Math.PI) * 0.2;
		ref.current.quaternion.slerpQuaternions(
			flight.startRotation,
			flight.endRotation,
			t,
		);
	});
	return (
		<group ref={ref} name="reading-book" position={flight.start}>
			<OpenBook presentation="tour" closing={closing} />
		</group>
	);
}

export default function TourScene() {
	const stage = useTourStore((state) => state.stage);
	const runId = useTourStore((state) => state.runId);
	const paused = useTourStore((state) => state.paused);
	const openBook = useTourStore((state) => state.openBook);
	const blurredBookIds = useTourStore((state) => state.blurredBookIds);
	const toggleBookBlur = useTourStore((state) => state.toggleBookBlur);
	const returningBookId = useTourStore((state) => state.returningBookId);
	const book = useSelectedBook();
	return (
		<>
			{(stage === "library" ||
				stage === "end" ||
				stage === "pull" ||
				stage === "read" ||
				stage === "return") && (
				<ShelfBackdrop>
					<Bookshelves
						onBookSelect={
							stage === "library" || stage === "end" || stage === "read"
								? openBook
								: undefined
						}
						hiddenBookId={
							stage === "pull" || stage === "read" || stage === "return"
								? book.id
								: undefined
						}
						returningBookId={returningBookId}
					/>
				</ShelfBackdrop>
			)}
			{stage === "pull" && <FlyingBook />}
			{stage === "pull" && returningBookId && (
				<ReturningBook key={returningBookId} id={returningBookId} />
			)}
			{(stage === "read" || stage === "return") && (
				<ReadingBook key={book.id} closing={stage === "return"} />
			)}
			{stage === "grow" && <Shelves />}
			{stage === "privacy" && (
				<Bookshelves
					onBookSelect={toggleBookBlur}
					blurredBookIds={blurredBookIds}
				/>
			)}
			{stage === "delete" && <Dissolve key={runId} paused={paused} />}
			{stage === "add" && (
				<>
					<Bookshelves hiddenBookId={book.id} />
					<ShelfArrival key={runId} paused={paused} />
				</>
			)}
			<Ready />
		</>
	);
}
