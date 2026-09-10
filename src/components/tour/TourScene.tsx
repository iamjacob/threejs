import { useFrame } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { type Group, MathUtils, type Mesh, Quaternion, Vector3 } from "three";
import { books } from "../../lib/bookCatalog";
import { useSelectedBook } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import OpenBook from "../openbook/OpenBook";
import Bookshelves, { shelfBookPose } from "../shelves/Bookshelves";
import Shelves from "../shelves/Shelves";
import ShelfArrival from "./ShelfArrival";
import { BOOK_ROTATION, focusBookPosition } from "./tourBookPose";

function ShelfBackdrop({ children }: { children: ReactNode }) {
	const ref = useRef<Group>(null);
	useFrame(() => {
		const { stage, elapsed } = useTourStore.getState();
		const opacity =
			stage === "read" || stage === "end"
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

function TourBook({
	id,
	returning = false,
}: {
	id: string;
	returning?: boolean;
}) {
	const book = books.find((item) => item.id === id) ?? books[0];
	const stage = useTourStore((state) => state.stage);
	const origin = useTourStore((state) => state.origin);
	const ref = useRef<Group>(null);
	const arriving = stage === "pull" && !returning;
	const closing = stage === "return" || returning;
	const flight = useMemo(() => {
		const shelf = shelfBookPose(id);
		const source = origin ?? shelf;
		const inverseReading = new Quaternion()
			.setFromEuler(BOOK_ROTATION)
			.invert();
		return {
			origin: new Vector3(...source.position),
			focus: new Vector3(...focusBookPosition(id)),
			shelf: new Vector3(...shelf.position),
			originRotation: new Quaternion(...source.quaternion).multiply(
				inverseReading,
			),
			shelfRotation: new Quaternion(...shelf.quaternion).multiply(
				inverseReading,
			),
			readingRotation: new Quaternion(),
		};
	}, [id, origin]);
	useFrame(() => {
		if (!ref.current) return;
		const { elapsed } = useTourStore.getState();
		if (arriving) {
			const t = MathUtils.smootherstep(elapsed / 2, 0, 1);
			ref.current.position.lerpVectors(flight.origin, flight.focus, t);
			ref.current.position.y += Math.sin(t * Math.PI) ** 2 * 0.35;
			ref.current.quaternion.slerpQuaternions(
				flight.originRotation,
				flight.readingRotation,
				t,
			);
		} else if (closing) {
			// Fold the pages first, then return this same model to its shelf slot.
			const duration = returning ? 2 : 1.8;
			const t = MathUtils.smootherstep(
				(elapsed - 0.35) / (duration - 0.35),
				0,
				1,
			);
			ref.current.position.lerpVectors(flight.focus, flight.shelf, t);
			ref.current.position.y += Math.sin(t * Math.PI) ** 2 * 0.2;
			ref.current.quaternion.slerpQuaternions(
				flight.readingRotation,
				flight.shelfRotation,
				t,
			);
		} else {
			ref.current.position.copy(flight.focus);
			ref.current.quaternion.copy(flight.readingRotation);
		}
	});
	return (
		<group
			ref={ref}
			name={
				arriving ? "flying-book" : returning ? "returning-book" : "reading-book"
			}
			userData={{ bookId: id }}
			position={arriving ? flight.origin : flight.focus}
			quaternion={arriving ? flight.originRotation : flight.readingRotation}
		>
			<OpenBook book={book} presentation="tour" closing={arriving || closing} />
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
	const deletingBooks = useTourStore((state) => state.deletingBooks);
	const deletedBookIds = useTourStore((state) => state.deletedBookIds);
	const deleteBook = useTourStore((state) => state.deleteBook);
	const finishDelete = useTourStore((state) => state.finishDelete);
	const book = useSelectedBook();
	return (
		<>
			{(stage === "library" ||
				stage === "pick" ||
				stage === "end" ||
				stage === "pull" ||
				stage === "read" ||
				stage === "return") && (
				<ShelfBackdrop>
					<Bookshelves
						onBookSelect={
							stage === "library" ||
							stage === "pick" ||
							stage === "end" ||
							stage === "read"
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
			{(stage === "pull" || stage === "read" || stage === "return") &&
				[book.id, ...(returningBookId ? [returningBookId] : [])].map((id) => (
					<TourBook key={id} id={id} returning={id === returningBookId} />
				))}
			{stage === "grow" && <Shelves />}
			{stage === "privacy" && (
				<Bookshelves
					onBookSelect={toggleBookBlur}
					blurredBookIds={blurredBookIds}
				/>
			)}
			{stage === "delete" && (
				<Bookshelves
					onBookSelect={deleteBook}
					deletingBooks={deletingBooks}
					hiddenBookIds={deletedBookIds}
					onDeleteComplete={finishDelete}
				/>
			)}
			{stage === "add" && (
				<>
					<Bookshelves hiddenBookId={book.id} hiddenBookIds={deletedBookIds} />
					<ShelfArrival key={runId} paused={paused} />
				</>
			)}
			<Ready />
		</>
	);
}
