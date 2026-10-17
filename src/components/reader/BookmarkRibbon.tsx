import { Canvas, useThree } from "@react-three/fiber";
import { Bookmark } from "lucide-react";
import { useState } from "react";
import {
	useReadingStore,
	type RibbonBookmark,
} from "../../../stores/useReadingStore";
import SilkRibbon from "./SilkRibbon";
import "./bookmark.css";
function ReaderRibbon({ bookmark }: { bookmark: RibbonBookmark }) {
	const { size } = useThree();
	return (
		<group position={[size.width / 2 - 92, size.height / 2 - 8, 0]}>
			<SilkRibbon
				length={116}
				width={13}
				color={bookmark.color}
				insertedAt={bookmark.insertedAt}
				launch={bookmark.launch}
				throughBook
			/>
		</group>
	);
}
export default function BookmarkRibbon({
	embedded = false,
}: {
	embedded?: boolean;
}) {
	const bookmarks = useReadingStore((s) => s.bookmarks);
	const page = useReadingStore((s) => s.selectedPage);
	const bookmark = bookmarks.find((b) => b.index === page);
	const [expanded, setExpanded] = useState(false);
	return (
		<>
			<div
				className={`bookmark-control${embedded ? " bookmark-embedded" : ""}`}
			>
				<button
					type="button"
					className="bookmark-ribbon"
					aria-pressed={Boolean(bookmark)}
					aria-label={
						bookmark ? "Remove ribbon bookmark" : "Place ribbon on this page"
					}
					title={bookmark ? "Remove ribbon bookmark" : "Bookmark this page"}
					data-tooltip="Bookmark"
					onClick={(event) => {
						const rect = event.currentTarget.getBoundingClientRect();
						useReadingStore
							.getState()
							.toggleBookmark({
								x: rect.left + rect.width / 2,
								y: rect.top + rect.height / 2,
							});
					}}
				>
					<Bookmark
						size={17}
						fill={bookmark?.color ?? "none"}
						color={bookmark?.color ?? "currentColor"}
					/>
				</button>
				{bookmarks.length > 0 && (
					<button
						type="button"
						className="bookmark-count"
						aria-label="Show saved ribbons"
						aria-expanded={expanded}
						onClick={() => setExpanded((value) => !value)}
					>
						{bookmarks.length}
					</button>
				)}
				{expanded && (
					<div className="bookmark-list">
						{bookmarks.map((saved) => (
							<button
								key={saved.id}
								type="button"
								className="bookmark-return"
								onClick={() => {
									useReadingStore.getState().visitBookmark(saved.id);
									setExpanded(false);
								}}
							>
								<Bookmark size={14} fill={saved.color} color={saved.color} />{" "}
								Page {saved.index + 1}
							</button>
						))}
					</div>
				)}
			</div>
			{!embedded && bookmark && (
				<div className="reader-ribbon-surface" aria-hidden="true">
					<Canvas
						orthographic
						camera={{ position: [0, 0, 1000], zoom: 1, near: 0.1, far: 2000 }}
						dpr={[1, 1.5]}
					>
						<ambientLight intensity={1.5} />
						<directionalLight position={[200, 200, 400]} intensity={4} />
						<ReaderRibbon key={bookmark.id} bookmark={bookmark} />
					</Canvas>
				</div>
			)}
		</>
	);
}
