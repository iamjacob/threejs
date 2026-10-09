import { ChevronDown, Eye, LampDesk, Layers3 } from "lucide-react";
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
	const [menu, setMenu] = useState<"scene" | null>(null);
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

			{bookBarOpen && <BookBar id={bookBarId} onClose={closeBookBar} />}
		</fieldset>
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
