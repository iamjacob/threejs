import { type ReactNode, useEffect, useRef } from "react";
import type { ScanPhoto } from "./scanDrafts";
import "./pages-roll.css";

/** A red line marks every this many pages (a chapter-sized step). */
export const PAGES_PER_MARK = 25;

export type RollCover = "front" | "spine" | "back";
const COVERS: { id: RollCover; label: string }[] = [
	{ id: "front", label: "Front cover" },
	{ id: "spine", label: "Spine" },
	{ id: "back", label: "Back cover" },
];

/** What is highlighted: a cover, a 0-based page, or nothing. */
export type RollCurrent = RollCover | number | null;

/**
 * The whole book as one scrollable roll: front, spine and back first, then
 * every page, with a red line after the covers and after every 25 pages.
 * Scanned tiles show their picture; empty ones are just an outline. It always
 * ends on one empty page, so you can keep scanning without limit.
 */
export default function PagesRoll({
	faces,
	pages,
	total,
	current,
	busy,
	onCover,
	onPage,
}: {
	faces: Partial<Record<RollCover, { image: string }>>;
	/** Scanned page photos by 0-based page index. */
	pages: Map<number, ScanPhoto>;
	total: number;
	current: RollCurrent;
	busy: boolean;
	onCover: (cover: RollCover) => void;
	onPage: (index: number) => void;
}) {
	const list = useRef<HTMLOListElement>(null);
	const last = Math.max(-1, ...pages.keys());
	// Always one empty page after the last scanned one.
	const count = Math.max(total, last + 2);
	const key = current === null ? "" : String(current);
	useEffect(() => {
		const row = list.current;
		const tile = key
			? row?.querySelector<HTMLElement>(`[data-key="${key}"]`)
			: null;
		if (!row || !tile) return;
		// Centre the highlighted tile without scrolling anything else.
		row.scrollTo({
			left: tile.offsetLeft - row.clientWidth / 2 + tile.clientWidth / 2,
			behavior: "smooth",
		});
	}, [key]);
	const tiles: ReactNode[] = [];
	for (const { id, label } of COVERS) {
		const image = faces[id]?.image;
		tiles.push(
			<li key={id} data-key={id}>
				<button
					type="button"
					className={`pages-roll-tile is-${id}${image ? " has-scan" : ""}${current === id ? " is-current" : ""}`}
					title={label}
					aria-label={`${label}${image ? ", scanned" : ", not scanned"}`}
					aria-current={current === id ? "true" : undefined}
					disabled={busy}
					style={image ? { backgroundImage: `url(${image})` } : undefined}
					onClick={() => onCover(id)}
				/>
			</li>,
		);
	}
	for (let index = 0; index < count; index++) {
		if (index % PAGES_PER_MARK === 0)
			tiles.push(
				<li
					key={`mark-${index}`}
					className="pages-roll-mark"
					aria-hidden="true"
				>
					{index > 0 && <span>{index}</span>}
				</li>,
			);
		const photo = pages.get(index);
		const image = photo?.crop?.image ?? photo?.image;
		tiles.push(
			<li key={`page-${index}`} data-key={index}>
				<button
					type="button"
					className={`pages-roll-tile${image ? " has-scan" : ""}${current === index ? " is-current" : ""}`}
					title={`Page ${index + 1}${image ? " · scanned" : ""}`}
					aria-label={`Page ${index + 1}${image ? ", scanned" : ", not scanned"}`}
					aria-current={current === index ? "true" : undefined}
					disabled={busy}
					style={image ? { backgroundImage: `url(${image})` } : undefined}
					onClick={() => onPage(index)}
				/>
			</li>,
		);
	}
	return (
		<nav className="pages-roll" aria-label="Pages roll">
			<ol
				ref={list}
				onWheel={(event) => {
					// A mouse wheel scrolls the roll sideways.
					if (list.current && Math.abs(event.deltaY) > Math.abs(event.deltaX))
						list.current.scrollLeft += event.deltaY;
				}}
			>
				{tiles}
			</ol>
		</nav>
	);
}
