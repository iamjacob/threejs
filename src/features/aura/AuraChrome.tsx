import { type ReactNode, useEffect, useState } from "react";
import { useAuraFocus } from "./focusStore";
import {
	AURA_EXAMPLE_NOTE,
	type AuraBook,
	alignWord,
	labelFor,
	likeWord,
	type ReadState,
	type ShareScope,
} from "./mockData";
import { AURA_STYLES, type AuraStyleName } from "./styles";

const READS: { value: ReadState; label: string }[] = [
	{ value: 0, label: "Unread" },
	{ value: 1, label: "Reading" },
	{ value: 2, label: "Finished" },
	{ value: 3, label: "Not shared" },
];

function likedCaption(value: number) {
	return `${likeWord(value) ?? "No rating"} · ${value.toFixed(2)}`;
}

export default function AuraChrome({
	items,
	reduced,
	devDefault,
	children,
}: {
	items: AuraBook[];
	reduced: boolean;
	devDefault: boolean;
	children: ReactNode;
}) {
	const shelf = useAuraFocus((state) => state.shelf);
	const share = useAuraFocus((state) => state.share);
	const style = useAuraFocus((state) => state.style);
	const focusedId = useAuraFocus((state) => state.focusedId);
	const cursor = useAuraFocus((state) => state.cursor);
	const setShelf = useAuraFocus((state) => state.setShelf);
	const setShare = useAuraFocus((state) => state.setShare);
	const setStyle = useAuraFocus((state) => state.setStyle);
	const patchFocused = useAuraFocus((state) => state.patchFocused);
	const step = useAuraFocus((state) => state.step);
	const focused = items.find((item) => item.bookId === focusedId) ?? null;
	const [shownId, setShownId] = useState(focusedId);
	const [hidden, setHidden] = useState(false);
	const [devOpen, setDevOpen] = useState(devDefault);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				target.closest("input, textarea, select, [contenteditable='true']")
			)
				return;
			if (event.key === "ArrowRight") {
				event.preventDefault();
				useAuraFocus.getState().step(1);
			} else if (event.key === "ArrowLeft") {
				event.preventDefault();
				useAuraFocus.getState().step(-1);
			} else if (event.key === "Home") {
				event.preventDefault();
				useAuraFocus.getState().focusIndex(0);
			} else if (event.key === "End") {
				event.preventDefault();
				useAuraFocus.getState().focusIndex(items.length - 1);
			} else if (event.key === "Escape") {
				useAuraFocus.getState().clear();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [items.length]);

	useEffect(() => {
		if (shownId === focusedId) return;
		if (reduced) {
			setShownId(focusedId);
			setHidden(false);
			return;
		}
		setHidden(true);
		const timer = window.setTimeout(() => {
			setShownId(focusedId);
			setHidden(false);
		}, 140);
		return () => window.clearTimeout(timer);
	}, [focusedId, reduced, shownId]);

	const shown = items.find((item) => item.bookId === shownId) ?? null;
	const label = shown ? labelFor(shown, share) : null;

	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-[#080b18] text-[#eef3ff]">
			<header className="flex items-baseline justify-between gap-3 px-4 pt-[max(0.7rem,env(safe-area-inset-top))] pb-1 sm:px-8">
				<h1 className="m-0 text-sm font-semibold tracking-[0.16em]">
					<a
						href={import.meta.env.BASE_URL}
						className="text-inherit no-underline"
					>
						BOOOKS
					</a>
					<span className="ml-2 text-xs font-normal tracking-normal text-[#a8b3cd]">
						Focused aura · example
					</span>
				</h1>
			</header>
			<div className="flex flex-wrap items-center justify-center gap-2 px-3 pt-1">
				<div className="inline-flex overflow-hidden rounded-full border border-[#323d5a]">
					<button
						type="button"
						data-testid="shelf-me"
						className={segmentClass(shelf === "me")}
						onClick={() => setShelf("me")}
					>
						My shelf
					</button>
					<button
						type="button"
						data-testid="shelf-freja"
						className={segmentClass(shelf === "freja")}
						onClick={() => setShelf("freja")}
					>
						Freja's shelf{" "}
						<small className="font-normal opacity-75">· example</small>
					</button>
				</div>
				{shelf === "freja" && (
					<select
						aria-label="What Freja shares with you"
						className="max-w-full rounded-full border border-[#323d5a] bg-[#111a31] px-3 py-1.5 text-xs"
						value={share}
						onChange={(event) => setShare(event.target.value as ShareScope)}
					>
						<option value="owned">Freja shares: owned & availability</option>
						<option value="reading">Freja shares: + read status</option>
						<option value="likes">Freja shares: + likes</option>
					</select>
				)}
			</div>
			<section
				className="relative min-h-[300px] flex-1 touch-none outline-none"
				data-testid="aura-stage"
				aria-roledescription="carousel"
				aria-label="Example books. Arrow keys, swipe, scroll or tap a book to focus it. Tap the focused book or empty space to clear it."
			>
				{children}
				<button
					type="button"
					className="absolute top-1/2 left-4 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-[#323d5a] bg-[#0e1428]/70 text-xl min-[700px]:grid"
					aria-label="Previous book"
					onClick={() => step(-1)}
				>
					‹
				</button>
				<button
					type="button"
					className="absolute top-1/2 right-4 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-[#323d5a] bg-[#0e1428]/70 text-xl min-[700px]:grid"
					aria-label="Next book"
					onClick={() => step(1)}
				>
					›
				</button>
			</section>
			<div
				data-testid="aura-label"
				aria-live="polite"
				className={`px-6 text-center motion-reduce:transition-none ${
					reduced ? "" : "transition-opacity duration-150"
				} ${hidden ? "opacity-0" : "opacity-100"}`}
				style={{ minHeight: 118 }}
			>
				{label ? (
					<>
						<div
							data-testid="aura-title"
							className="text-lg font-semibold sm:text-xl"
						>
							{label.title}
						</div>
						<div className="text-[13px] text-[#a8b3cd]">{label.author}</div>
						<div
							data-testid="aura-status"
							className="mt-2.5 text-sm text-[#dfe6f6]"
						>
							{label.status}
						</div>
						<div
							data-testid="aura-friends"
							className="mt-1 text-[12.5px] text-[#a8b3cd]"
						>
							{label.dots.map((dot) => (
								<span
									key={dot.who}
									style={{ color: dot.color }}
									aria-hidden="true"
								>
									{dot.lit ? "●" : "○"}
								</span>
							))}
							{label.dots.length ? " " : ""}
							{label.friends}
						</div>
						{label.note ? (
							<div className="mt-1 text-[11px] text-[#a8b3cd] opacity-75">
								{label.note}
							</div>
						) : null}
					</>
				) : (
					<p className="m-0 pt-6 text-sm text-[#a8b3cd]">
						Tap a book to bring its aura forward.
					</p>
				)}
			</div>
			<div className="mb-1 text-center text-[11px] tracking-[0.14em] text-[#a8b3cd] opacity-70">
				{items.length ? `${cursor + 1} / ${items.length}` : ""}
			</div>
			<details
				className="mx-auto mb-[max(0.75rem,env(safe-area-inset-bottom))] w-full max-w-[440px] rounded-[14px] border border-[#26304a] bg-[#0e1428] px-4"
				open={devOpen}
				onToggle={(event) => setDevOpen(event.currentTarget.open)}
			>
				<summary className="cursor-pointer py-3 text-xs tracking-[0.08em] text-[#a8b3cd] uppercase">
					Dev · signals for the focused book
				</summary>
				<p className="mt-0 mb-3 text-[11px] text-[#a8b3cd]">
					{AURA_EXAMPLE_NOTE}
				</p>
				<fieldset
					disabled={!focused}
					className="min-w-0 border-0 p-0 disabled:opacity-50"
				>
					<Slider
						label="Alignment (to you)"
						valueLabel={focused ? alignWord(focused.alignment) : "—"}
						min={0}
						max={1}
						step={0.01}
						value={focused?.alignment ?? 0}
						onChange={(value) => patchFocused({ alignment: value })}
					/>
					<Slider
						label="Liked"
						valueLabel={focused ? likedCaption(focused.liked) : "—"}
						min={-1}
						max={1}
						step={0.01}
						value={focused?.liked ?? 0}
						onChange={(value) => patchFocused({ liked: value })}
					/>
					<div className="mb-3.5">
						<div className="mb-1.5 text-[11px] tracking-[0.06em] text-[#a8b3cd] uppercase">
							Read
						</div>
						<div className="flex overflow-hidden rounded-full border border-[#323d5a]">
							{READS.map((option) => (
								<button
									key={option.value}
									type="button"
									className={segmentClass(focused?.read === option.value)}
									onClick={() => patchFocused({ read: option.value })}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>
					<Slider
						label="Progress"
						valueLabel={
							focused ? `${Math.round(focused.progress * 100)}%` : "—"
						}
						min={0}
						max={1}
						step={0.01}
						value={focused?.progress ?? 0}
						onChange={(value) => patchFocused({ progress: value })}
					/>
					<div className="mb-3.5">
						<div className="mb-1.5 text-[11px] tracking-[0.06em] text-[#a8b3cd] uppercase">
							Owned (anchoring)
						</div>
						<div className="flex overflow-hidden rounded-full border border-[#323d5a]">
							<button
								type="button"
								className={segmentClass((focused?.owned ?? 1) >= 0.5)}
								onClick={() => patchFocused({ owned: 1 })}
							>
								Owned
							</button>
							<button
								type="button"
								className={segmentClass((focused?.owned ?? 1) < 0.5)}
								onClick={() => patchFocused({ owned: 0 })}
							>
								Not owned
							</button>
						</div>
					</div>
					<label className="mb-4 block text-[11px] tracking-[0.06em] text-[#a8b3cd] uppercase">
						Aura style
						<select
							aria-label="Aura style"
							className="mt-1.5 w-full rounded-lg border border-[#323d5a] bg-[#111a31] px-2 py-1.5 text-sm tracking-normal text-[#eef3ff] normal-case"
							value={style}
							onChange={(event) =>
								setStyle(event.target.value as AuraStyleName)
							}
						>
							{(Object.keys(AURA_STYLES) as AuraStyleName[]).map((name) => (
								<option key={name} value={name}>
									{name[0].toUpperCase()}
									{name.slice(1)}
								</option>
							))}
						</select>
					</label>
				</fieldset>
			</details>
		</div>
	);
}

function segmentClass(on: boolean) {
	return `flex-1 cursor-pointer border-0 px-3 py-1.5 text-xs whitespace-nowrap ${
		on
			? "bg-[#73f4e9] font-semibold text-[#06121a]"
			: "bg-transparent text-[#a8b3cd]"
	}`;
}

function Slider({
	label,
	valueLabel,
	min,
	max,
	step,
	value,
	onChange,
}: {
	label: string;
	valueLabel: string;
	min: number;
	max: number;
	step: number;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<label className="mb-3.5 block">
			<span className="mb-1.5 flex justify-between text-[11px] tracking-[0.06em] text-[#a8b3cd] uppercase">
				{label}
				<b className="font-medium tracking-normal text-[#eef3ff] normal-case">
					{valueLabel}
				</b>
			</span>
			<input
				type="range"
				className="w-full accent-[#73f4e9]"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
			/>
		</label>
	);
}
