import { ChevronDown, ChevronLeft, ChevronRight, List, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type TocItem = {
	id: string;
	label: string;
	shortLabel?: string;
	children?: TocItem[];
	disabled?: boolean;
	opensDialog?: boolean;
};

type NodeProps = {
	item: TocItem;
	depth: number;
	activeId: string;
	onSelect: (id: string) => void;
	compact?: boolean;
};

type TocSidebarProps = {
	items?: TocItem[];
	title?: string;
	defaultActiveId?: string;
	activeId?: string;
	onSelect?: (id: string) => void;
};

const DEFAULT_ITEMS: TocItem[] = [
	{ id: "Boooks", label: "Boooks R3F!", opensDialog: true },
	{ id: "mobile-books", label: "Shelves with books" },
	{
		id: "3DBook",
		label: "3D Book",
	},
	{
		id: "OpenBook",
		label: "Open Book",
		children: [
			{ id: "page-folding", label: "Page folding" },
			{ id: "page-zoom-in", label: "Page zoom in" },
			{ id: "book-reader", label: "Book reader (coming soon)", disabled: true },
		],
	},
	{
		id: "Shelflevels",
		label: "Shelf + levels",
		children: [
			{
				id: "level-based-shelf",
				label: "Shelves growing with levels",
				shortLabel: "Growing shelves",
			},
			{ id: "level-four-shelves", label: "Level 4 Shelves" },
			{
				id: "level-top-shelves",
				label: "Top level is 360degrees",
				shortLabel: "360° shelves",
			},
		],
	},
	{
		id: "Particles",
		label: "Add book - Particles",
		shortLabel: "Book particles",
	},
	{
		id: "PerlinNoise",
		label: "Delete book - Dissolve - Perlin Noise",
		shortLabel: "Book dissolve",
	},
	{
		id: "Blur",
		label: "Blur",
	},
];

function Node({ item, depth, activeId, onSelect, compact = false }: NodeProps) {
	const isActive = item.id === activeId;
	const hasChildren = Boolean(item.children?.length);

	return (
		<div>
			<button
				type="button"
				onClick={() => onSelect(item.id)}
				disabled={item.disabled}
				aria-current={isActive ? "true" : undefined}
				aria-haspopup={item.opensDialog ? "dialog" : undefined}
				className={`group relative flex min-h-11 w-full cursor-pointer items-center pr-3 text-left transition-colors disabled:cursor-default disabled:opacity-40 md:min-h-0 md:items-start md:py-1 ${compact ? "rounded-lg py-1 hover:bg-white/5 aria-current:bg-white/10" : "my-1 py-2"}`}
				style={{ paddingLeft: compact ? 12 + depth * 12 : 16 + depth * 16 }}
			>
				{isActive && (
					<span
						aria-hidden="true"
						className="absolute bottom-1 left-0 top-1 w-[2px] bg-[#d91b24]"
					/>
				)}

				<span
					className={`${compact ? "text-sm" : "text-[15px]"} leading-snug transition-colors ${
						isActive
							? "font-medium text-stone-100"
							: "text-stone-300 group-hover:text-stone-100 md:text-stone-500 md:group-hover:text-stone-300"
					}`}
				>
					{compact ? (item.shortLabel ?? item.label) : item.label}
				</span>
			</button>

			{hasChildren && (
				<div>
					{item.children?.map((child) => (
						<Node
							key={child.id}
							item={child}
							depth={depth + 1}
							activeId={activeId}
							onSelect={onSelect}
							compact={compact}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function flattenItems(items: TocItem[]): TocItem[] {
	return items.flatMap((item) => [
		...(item.disabled ? [] : [item]),
		...flattenItems(item.children ?? []),
	]);
}

function MobileToc({
	items,
	title,
	activeId,
	onSelect,
}: {
	items: TocItem[];
	title: string;
	activeId: string;
	onSelect: (id: string) => void;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const dialogId = useId();
	const headingId = useId();
	const entries = flattenItems(items);
	const currentIndex = entries.findIndex((item) => item.id === activeId);
	const current = entries[currentIndex];
	const previous = entries[currentIndex - 1];
	const next = entries[currentIndex + 1];

	useEffect(() => {
		const desktop = window.matchMedia("(min-width: 768px)");
		const closeOnDesktop = () => {
			if (desktop.matches) dialogRef.current?.close();
		};
		desktop.addEventListener("change", closeOnDesktop);
		return () => desktop.removeEventListener("change", closeOnDesktop);
	}, []);

	return (
		<>
			<nav
				aria-label="Demo navigation"
				className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[1100] mx-auto flex max-w-[420px] items-center gap-1 rounded-2xl border border-white/10 bg-black/15 p-1 text-white shadow-sm backdrop-blur-sm md:hidden"
			>
				<button
					type="button"
					aria-label="Previous demo"
					title={previous?.label}
					disabled={!previous}
					onClick={() => previous && onSelect(previous.id)}
					className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl bg-white/5 active:bg-white/15 disabled:opacity-30"
				>
					<ChevronLeft size={24} aria-hidden="true" />
				</button>
				<button
					type="button"
					aria-label={`Choose demo: ${current?.label ?? title}`}
					aria-haspopup="dialog"
					aria-controls={dialogId}
					onClick={() => {
						const dialog = dialogRef.current;
						dialog?.showModal();
						const selected = dialog?.querySelector<HTMLButtonElement>(
							'[aria-current="true"]',
						);
						selected?.focus({ preventScroll: true });
						selected?.scrollIntoView({ block: "nearest" });
					}}
					className="flex min-h-11 min-w-0 flex-1 touch-manipulation items-center justify-center gap-2 rounded-xl px-1 text-left active:bg-white/10"
				>
					<div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
						<p className="sr-only">
							{title} · {Math.max(0, currentIndex + 1)} / {entries.length}
						</p>
						<p className="truncate text-xs font-medium">
							{current?.shortLabel ?? current?.label ?? "Choose a demo"}
						</p>
					</div>
					<List
						size={18}
						className="shrink-0 text-white/60"
						aria-hidden="true"
					/>
				</button>
				<button
					type="button"
					aria-label="Next demo"
					title={next?.label}
					disabled={!next}
					onClick={() => next && onSelect(next.id)}
					className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl bg-white/5 active:bg-white/15 disabled:opacity-30"
				>
					<ChevronRight size={24} aria-hidden="true" />
				</button>
			</nav>
			<dialog
				ref={dialogRef}
				id={dialogId}
				closedby="any"
				aria-labelledby={headingId}
				className="fixed inset-x-3 top-auto bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mx-auto my-0 max-h-[min(26rem,calc(100dvh-9rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-[calc(100%-1.5rem)] max-w-[420px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0c1424]/90 p-0 text-white shadow-xl backdrop-blur-sm backdrop:bg-black/10 open:flex md:hidden"
			>
				<div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-1">
					<h2 id={headingId} className="text-sm font-medium">
						{title}
					</h2>
					<button
						type="button"
						aria-label="Close demo menu"
						onClick={() => dialogRef.current?.close()}
						className="flex h-11 w-11 items-center justify-center rounded-lg text-white/65 hover:bg-white/10 hover:text-white"
					>
						<X size={20} aria-hidden="true" />
					</button>
				</div>
				<nav
					aria-label={`${title} menu`}
					className="min-h-0 overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin]"
				>
					{items.map((item) => (
						<Node
							key={item.id}
							item={item}
							depth={0}
							activeId={activeId}
							compact
							onSelect={(id) => {
								dialogRef.current?.close();
								onSelect(id);
							}}
						/>
					))}
				</nav>
			</dialog>
		</>
	);
}

export default function TocSidebar({
	items = DEFAULT_ITEMS,
	title = "Components",
	defaultActiveId = "Boooks",
	activeId: controlledActiveId,
	onSelect,
}: TocSidebarProps) {
	const [localActiveId, setLocalActiveId] = useState<string>(defaultActiveId);
	const activeId = controlledActiveId ?? localActiveId;
	const [collapsed, setCollapsed] = useState<boolean>(true);

	const selectItem = (id: string) => {
		setLocalActiveId(id);
		onSelect?.(id);
	};

	return (
		<>
			<MobileToc
				items={items}
				title={title}
				activeId={activeId}
				onSelect={selectItem}
			/>
			<div className="fixed right-0 top-20 z-[1100] hidden items-start md:flex">
				<button
					type="button"
					onClick={() => setCollapsed((current) => !current)}
					aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
					aria-expanded={!collapsed}
					className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-l-md border-r-0 bg-white/[0.08] backdrop-blur-xl text-stone-500 shadow-lg transition-colors hover:text-stone-900"
				>
					<ChevronDown
						size={16}
						aria-hidden="true"
						className={`transition-transform duration-200 size-6 text-[#d91b24] ${
							collapsed ? "rotate-90" : "-rotate-90"
						}`}
					/>
				</button>

				<div
					inert={collapsed}
					className={`overflow-hidden rounded-bl-lg bg-white/[0.08] backdrop-blur-xl transition-[width,opacity] duration-200 ${
						collapsed ? "w-0 opacity-0" : "w-[280px] opacity-100"
					}`}
				>
					<div className="max-h-[calc(100dvh-6rem)] w-[280px] overflow-y-auto pl-6 pt-1 pb-4">
						<h2 className="mb-1 text-[22px] pt-2 leading-tight text-stone-100">
							{title}
						</h2>

						<nav aria-label={title}>
							{items.map((item) => (
								<Node
									key={item.id}
									item={item}
									depth={0}
									activeId={activeId}
									onSelect={selectItem}
								/>
							))}
						</nav>
					</div>
				</div>
			</div>
		</>
	);
}
