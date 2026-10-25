import { Canvas } from "@react-three/fiber";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import Book from "../components/book/book";
import Lightning from "../components/lightning/Lightning";
import {
	type AuraBook,
	AuraCarousel,
	AuraChrome,
	type AuraSearch,
	auraMotion,
	bootAura,
	installAuraDebug,
	parseAuraSearch,
	SHELF_Z,
	useAuraFocus,
	useAuraItems,
	usePrefersReducedMotion,
} from "../features/aura";
import { books } from "../lib/bookCatalog";
import { currentRenderQuality } from "../lib/renderQuality";

/**
 * Opt-in book-aura demo. The library route is unchanged.
 * Open /aura. Example signals only — see src/features/aura/INTEGRATION.md.
 */
export const Route = createFileRoute("/aura")({
	validateSearch: (search) => parseAuraSearch(search),
	component: AuraPage,
});

const libraryById = new Map(books.map((book) => [book.id, book]));

function authorName(author: unknown) {
	if (Array.isArray(author)) return author.filter(Boolean).join(" & ");
	return typeof author === "string" ? author : "";
}

/** Keep the aura's box the same size as the real <Book> mesh. */
function withLibrarySize(item: AuraBook): AuraBook {
	const library = libraryById.get(item.bookId);
	if (!library) return item;
	const author = authorName(library.author);
	return {
		...item,
		title: library.title,
		author: author || item.author,
		dimensions: library.dimensions,
	};
}

function AuraPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	useState(() => {
		bootAura(search);
		return true;
	});
	const prefersReduced = usePrefersReducedMotion();
	const reduced = prefersReduced || search.rm === true;
	auraMotion.reduced = reduced;
	auraMotion.frozenTime = search.t;
	const source = useAuraItems();
	const items = useMemo(() => source.map(withLibrarySize), [source]);
	const shelf = useAuraFocus((state) => state.shelf);
	const share = useAuraFocus((state) => state.share);
	const style = useAuraFocus((state) => state.style);
	const quality = currentRenderQuality();

	useEffect(() => {
		installAuraDebug();
		const previous = document.title;
		document.title = "BOOOKS · Focused aura";
		return () => {
			document.title = previous;
		};
	}, []);

	useEffect(() => {
		const next: AuraSearch = { ...search };
		if (shelf === "freja") next.shelf = "freja";
		else delete next.shelf;
		if (share === "owned" || share === "reading") next.share = share;
		else delete next.share;
		if (style === "chakra" || style === "arcane") next.style = style;
		else delete next.style;
		if (
			next.shelf === search.shelf &&
			next.share === search.share &&
			next.style === search.style
		)
			return;
		void navigate({ to: "/aura", search: next, replace: true });
	}, [navigate, search, share, shelf, style]);

	return (
		<AuraChrome
			items={items}
			reduced={reduced}
			devDefault={search.dev === true}
		>
			<Canvas
				className="h-full w-full touch-none"
				dpr={quality.dpr}
				shadows={quality.shadows ? "percentage" : false}
				camera={{
					position: [0, 0.14, SHELF_Z + 3.55],
					fov: 32,
					near: 0.08,
					far: 40,
				}}
				gl={{
					alpha: false,
					antialias: true,
					powerPreference: "high-performance",
				}}
				onCreated={({ gl }) => gl.setClearColor("#080b18")}
			>
				<AuraCarousel
					items={items}
					lighting={<Lightning />}
					renderBook={(item) => {
						const library = libraryById.get(item.bookId);
						return library ? <Book book={library} /> : null;
					}}
				/>
			</Canvas>
		</AuraChrome>
	);
}
