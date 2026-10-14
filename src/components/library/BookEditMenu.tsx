import { Move3d, SquarePen, X } from "lucide-react";
import { useEffect, useRef } from "react";
import "./book-edit-menu.css";

type MenuPosition = { x: number; y: number };

export default function BookEditMenu({
	position,
	onArrange,
	onEditDetails,
	onClose,
}: {
	position: MenuPosition;
	onArrange: () => void;
	onEditDetails: () => void;
	onClose: () => void;
}) {
	const menu = useRef<HTMLDivElement>(null);
	const left = Math.min(
		Math.max(position.x, 92),
		window.innerWidth - 92,
	);
	const top = Math.min(
		Math.max(position.y, 54),
		window.innerHeight - 54,
	);

	useEffect(() => {
		const closeOnOutside = (event: PointerEvent) => {
			if (event.target instanceof Node && !menu.current?.contains(event.target))
				onClose();
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("pointerdown", closeOnOutside);
		window.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("pointerdown", closeOnOutside);
			window.removeEventListener("keydown", closeOnEscape);
		};
	}, [onClose]);

	return (
		<div
			ref={menu}
			className="book-edit-menu"
			style={{ left, top }}
			role="menu"
			aria-label="Book editing actions"
		>
			<button type="button" role="menuitem" onClick={onArrange}>
				<Move3d size={19} aria-hidden="true" />
				<span>Arrange</span>
			</button>
			<button type="button" role="menuitem" onClick={onEditDetails}>
				<SquarePen size={19} aria-hidden="true" />
				<span>Edit details</span>
			</button>
			<button
				type="button"
				className="book-edit-menu-close"
				aria-label="Close book actions"
				title="Close"
				onClick={onClose}
			>
				<X size={18} aria-hidden="true" />
			</button>
		</div>
	);
}
