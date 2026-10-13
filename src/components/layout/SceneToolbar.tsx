import { ChevronDown, Eye, LampDesk, Layers3, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { bookImagePath } from "../../lib/bookImages";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import {
	type EnvironmentMode,
	usePresentationStore,
} from "../../stores/usePresentationStore";
import BookBar from "./BookBar";

export default function SceneToolbar({
	showBlur,
	onChangeBook,
	vertical = false,
	showBook = true,
	showLighting = true,
}: {
	showBlur: boolean;
	onChangeBook?: () => void;
	vertical?: boolean;
	showBook?: boolean;
	showLighting?: boolean;
}) {
	const book = useSelectedBook();
	const [bookBarOpen, setBookBarOpen] = useState(false);
	const [menu, setMenu] = useState<"scene" | "lights" | null>(null);
	const toolbarRef = useRef<HTMLFieldSetElement>(null);
	const bookButtonRef = useRef<HTMLButtonElement>(null);
	const bookBarId = useId();
	const closeBookBar = () => {
		setBookBarOpen(false);
		bookButtonRef.current?.focus();
	};
	useEffect(() => {
		if (!bookBarOpen) return;
		const closeOutside = (event: PointerEvent) => {
			if (!toolbarRef.current?.contains(event.target as Node))
				setBookBarOpen(false);
		};
		document.addEventListener("pointerdown", closeOutside);
		return () => document.removeEventListener("pointerdown", closeOutside);
	}, [bookBarOpen]);
	useEffect(() => {
		if (!menu) return;
		const closeOutside = (event: PointerEvent) => {
			if (!toolbarRef.current?.contains(event.target as Node)) setMenu(null);
		};
		document.addEventListener("pointerdown", closeOutside);
		return () => document.removeEventListener("pointerdown", closeOutside);
	}, [menu]);
	const lighting = usePresentationStore((state) => state.movingLight);
	const blur = usePresentationStore((state) => state.blurEnabled);
	const environment = usePresentationStore((state) => state.environment);
	const toggleLighting = usePresentationStore((state) => state.toggleLighting);
	const toggleBlur = usePresentationStore((state) => state.toggleBlur);
	const setEnvironment = usePresentationStore((state) => state.setEnvironment);
	const lightShowDuration = usePresentationStore((state) => state.lightShowDuration);
	const lightShowCycles = usePresentationStore((state) => state.lightShowCycles);
	const lightPulse = usePresentationStore((state) => state.lightPulse);
	const lightFlareSize = usePresentationStore((state) => state.lightFlareSize);
	const fireIntensity = usePresentationStore((state) => state.fireIntensity);
	const fireReflection = usePresentationStore((state) => state.fireReflection);
	const fireReach = usePresentationStore((state) => state.fireReach);
	const setLightShowDuration = usePresentationStore((state) => state.setLightShowDuration);
	const setLightShowCycles = usePresentationStore((state) => state.setLightShowCycles);
	const setLightPulse = usePresentationStore((state) => state.setLightPulse);
	const setLightFlareSize = usePresentationStore((state) => state.setLightFlareSize);
	const setFireIntensity = usePresentationStore((state) => state.setFireIntensity);
	const setFireReflection = usePresentationStore((state) => state.setFireReflection);
	const setFireReach = usePresentationStore((state) => state.setFireReach);
	const replayLightShow = usePresentationStore((state) => state.replayLightShow);
	const toggleClass =
		"flex h-11 w-10 shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white aria-pressed:bg-white/20 aria-pressed:text-white sm:w-11";

	return (
		<fieldset
			ref={toolbarRef}
			className={`m-0 flex min-w-0 items-center border-0 p-0 sm:gap-1 ${vertical ? "flex-col" : ""}`}
			aria-label="Scene options"
		>
			{showBook && <button
				ref={bookButtonRef}
				type="button"
				onClick={() =>
					onChangeBook ? onChangeBook() : setBookBarOpen((open) => !open)
				}
				aria-label={`Change book: ${book.title}`}
				aria-haspopup={onChangeBook ? undefined : "dialog"}
				aria-expanded={onChangeBook ? undefined : bookBarOpen}
				aria-controls={onChangeBook ? undefined : bookBarId}
				title={`Change book: ${book.title}`}
				className={toggleClass}
			>
				<img
					src={publicAssetUrl(bookImagePath(book.cover.front, "low"))}
					alt=""
					className="h-7 w-5 rounded-sm object-cover"
				/>
			</button>}
			{showLighting && <button
				type="button"
				aria-label="Moving spotlight"
				title={
					lighting ? "Turn off moving spotlight" : "Turn on moving spotlight"
				}
				aria-pressed={lighting}
				onClick={toggleLighting}
				className={toggleClass}
			>
				<LampDesk size={20} strokeWidth={1.6} aria-hidden="true" />
			</button>}
			{showBlur && (
				<button
					type="button"
					aria-label="Blur book"
					title={blur ? "Reveal book" : "Blur book"}
					aria-pressed={blur}
					onClick={toggleBlur}
					className={toggleClass}
				>
					<Eye size={20} strokeWidth={1.6} aria-hidden="true" />
				</button>
			)}
			<MenuButton
				label="Scene"
				icon={<Layers3 size={18} aria-hidden="true" />}
				open={menu === "scene"}
				onClick={() => setMenu(menu === "scene" ? null : "scene")}
			>
				{[
					["library", "Library"],
					["castle", "Castle"],
					["forest", "Forest"],
					["zen", "Zen"],
				].map(([value, itemLabel]) => (
					<MenuItem
						key={value}
						label={itemLabel}
						active={environment === value}
						onClick={() => {
							setEnvironment(value as EnvironmentMode);
							setMenu(null);
						}}
					/>
				))}
			</MenuButton>
			<MenuButton
				label="Light show"
				icon={<Sparkles size={18} aria-hidden="true" />}
				open={menu === "lights"}
				onClick={() => setMenu(menu === "lights" ? null : "lights")}
			>
				<LightControl label="Time" value={lightShowDuration} min={0.4} max={5} step={0.1} suffix="s" onChange={setLightShowDuration} />
				<LightControl label="Sweep math" value={lightShowCycles} min={1} max={10} step={0.5} suffix="x" onChange={setLightShowCycles} />
				<LightControl label="Pulse" value={lightPulse} min={0} max={2} step={0.1} suffix="x" onChange={setLightPulse} />
				<LightControl label="Flare size" value={lightFlareSize} min={0.4} max={2} step={0.1} suffix="x" onChange={setLightFlareSize} />
				<LightControl label="Fire brightness" value={fireIntensity} min={0} max={5} step={0.1} suffix="x" onChange={setFireIntensity} />
				<LightControl label="Book reflection" value={fireReflection} min={0} max={5} step={0.1} suffix="x" onChange={setFireReflection} />
				<LightControl label="Fire reach" value={fireReach} min={5} max={25} step={1} suffix="u" onChange={setFireReach} />
				<button type="button" onClick={replayLightShow} className="mt-1 flex w-full items-center justify-center rounded-lg bg-white/15 px-3 py-2 text-sm text-white hover:bg-white/25">Replay light show</button>
			</MenuButton>

			{bookBarOpen && <BookBar id={bookBarId} onClose={closeBookBar} />}
		</fieldset>
	);
}

function LightControl({
	label,
	value,
	min,
	max,
	step,
	suffix,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	suffix: string;
	onChange: (value: number) => void;
}) {
	return (
		<label className="block w-56 px-2 py-2 text-xs text-white/75">
			<span className="mb-1 flex items-center justify-between gap-3">
				<span>{label}</span>
				<strong className="font-medium text-white">{value.toFixed(1)}{suffix}</strong>
			</span>
			<input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-white" />
		</label>
	);
}

function MenuButton({
	label,
	icon,
	open,
	onClick,
	children,
}: {
	label: string;
	icon: ReactNode;
	open: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<div className="relative">
			<button
				type="button"
				aria-label={label}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={onClick}
				className="flex h-11 shrink-0 cursor-pointer items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white sm:text-sm"
			>
				{icon}
				<span>{label}</span>
				<ChevronDown size={14} aria-hidden="true" />
			</button>
			{open && (
				<div
					role="menu"
					className="absolute right-0 top-[calc(100%+0.5rem)] z-40 min-w-36 rounded-xl border border-white/15 bg-[#111a2b]/95 p-1 shadow-xl backdrop-blur-xl"
				>
					{children}
				</div>
			)}
		</div>
	);
}

function MenuItem({
	label,
	active = false,
	onClick,
}: {
	label: string;
	active?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			role="menuitem"
			aria-pressed={active}
			onClick={onClick}
			className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 hover:text-white aria-pressed:bg-white/15 aria-pressed:text-white"
		>
			{label}
		</button>
	);
}
