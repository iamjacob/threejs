import { FileText, Menu, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { BookSizeCm } from "../../stores/useBookSizeStore";
import ScannerBook3D, { type PreviewSide } from "./ScannerBook3D";
import { type PhotoTag, photoTags, type ScanPhoto } from "./scanDrafts";
import type { CroppedFace } from "./scannedBook";

type Props = {
	title: string;
	onTitle: (title: string) => void;
	photos: ScanPhoto[];
	faces: Partial<Record<"front" | "spine" | "back", CroppedFace>>;
	activePhoto: string | null;
	busy: boolean;
	onPart: (tag: PhotoTag) => void;
	children?: ReactNode;
	preview?: { tag: PhotoTag; crop: CroppedFace } | null;
	size: BookSizeCm;
	unit: "cm" | "in";
	onSize: (axis: keyof BookSizeCm, value: number) => void;
	setUnit: (unit: "cm" | "in") => void;
	sizeSource: string;
	sizeOverridden: boolean;
	sizeConfident: boolean;
	onConfirmSize: () => void;
	/** Bump to open the size tools from outside (controller "Size"). */
	sizeToolsRequest?: number;
	onResetSize: () => void;
};
export default function ScannerBookForm({
	title,
	onTitle,
	photos,
	faces,
	activePhoto,
	busy,
	onPart,
	children,
	preview,
	size,
	unit,
	onSize,
	setUnit,
	sizeSource,
	sizeOverridden,
	sizeConfident,
	onConfirmSize,
	sizeToolsRequest,
	onResetSize,
}: Props) {
	const [side, setSide] = useState<PreviewSide>("front");
	const [open, setOpen] = useState(false);
	const menuId = useId();
	const menuButton = useRef<HTMLButtonElement>(null);
	const selected = photos.find((p) => p.id === activePhoto);
	const previewTag = preview?.tag ?? selected?.tag;
	useEffect(() => {
		if (previewTag)
			setSide(
				previewTag === "front" ||
					previewTag === "spine" ||
					previewTag === "back"
					? previewTag
					: "page",
			);
	}, [previewTag]);
	return (
		<section className="scan-live-book" aria-label="Live book preview">
			<div className="scan-live-toolbar">
				<button
					type="button"
					className="scan-live-title"
					onClick={() => setOpen(true)}
				>
					{title || "Name your book"}
					<small>
						{photos.length} photos · {Object.keys(faces).length}/3 covers
						cropped
					</small>
				</button>
				<button
					ref={menuButton}
					type="button"
					className="scan-icon"
					aria-label={
						open ? "Close book details" : "Book details, photos and history"
					}
					aria-expanded={open}
					aria-controls={menuId}
					onClick={() => setOpen((v) => !v)}
				>
					{open ? <X size={19} /> : <Menu size={19} />}
				</button>
			</div>
			<ScannerBook3D
				faces={
					preview &&
					(preview.tag === "front" ||
						preview.tag === "spine" ||
						preview.tag === "back")
						? { ...faces, [preview.tag]: preview.crop }
						: faces
				}
				side={side}
				onPart={(tag) => {
					if (!busy) onPart(tag);
				}}
				size={size}
				unit={unit}
				onSize={onSize}
				setUnit={setUnit}
				source={sizeSource}
				overridden={sizeOverridden}
				confident={sizeConfident}
				onConfirm={onConfirmSize}
				toolsRequest={sizeToolsRequest}
				reset={onResetSize}
			/>

			<nav className="scan-book-side-picker" aria-label="Preview book side">
				{(["front", "spine", "back", "page"] as const).map((tag) => (
					<button
						type="button"
						key={tag}
						aria-pressed={side === tag}
						onClick={() => setSide(tag)}
					>
						{photoTags[tag]}
					</button>
				))}
				<button
					type="button"
					className="scan-preview-assign"
					disabled={busy}
					title={
						selected
							? "Place the selected photo on this side"
							: "Add a photo for this side"
					}
					onClick={() => onPart(side)}
				>
					{selected ? "Assign" : "Add"} · {photoTags[side]}
				</button>
			</nav>
			{open && (
				<section
					id={menuId}
					className="scan-book-drawer"
					aria-label="Book details"
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.stopPropagation();
							setOpen(false);
							menuButton.current?.focus();
						}
					}}
				>
					<label className="scan-book-name">
						Book title
						<input
							value={title}
							maxLength={160}
							disabled={busy}
							onChange={(e) => onTitle(e.target.value)}
							placeholder="Give your book a title"
							autoComplete="off"
						/>
					</label>
					<div className="scan-extra-parts">
						{(
							[
								"page",
								"dustjacket",
								"contents",
								"index",
								"copyright",
								"other",
							] as const
						).map((tag) => (
							<button
								key={tag}
								type="button"
								disabled={busy}
								aria-pressed={selected?.tag === tag}
								onClick={() => {
									onPart(tag);
									setOpen(false);
								}}
							>
								<FileText size={15} />
								<span>
									{photoTags[tag]}
									<small>
										{photos.filter((p) => p.tag === tag).length || "+"}
									</small>
								</span>
							</button>
						))}
					</div>
					{children}
				</section>
			)}
		</section>
	);
}
