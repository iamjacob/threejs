import type { ButtonHTMLAttributes, ReactNode } from "react";
import type {
	ShelfFace,
	ShelfLayout,
} from "../../../stores/useShelfControlsStore";

export function ShelfButton({
	label,
	children,
	active,
	className = "",
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	label: string;
	active?: boolean;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className={`shelf-icon-button ${className}`}
			aria-label={label}
			title={label}
			aria-pressed={active}
			{...props}
		>
			{children}
		</button>
	);
}

export function LayoutIcon({ layout }: { layout: ShelfLayout }) {
	const paths: Record<ShelfLayout, ReactNode> = {
		upright: (
			<>
				<rect x="4" y="4" width="3" height="16" rx=".7" />
				<rect x="10" y="5" width="3" height="15" rx=".7" />
				<path d="m16 5 3-.5L22 19l-3 .5Z" />
			</>
		),
		lean: (
			<>
				<rect x="5" y="4" width="4" height="16" rx=".7" />
				<path d="m14 4 4 1-4 15-4-1Z" />
			</>
		),
		flat: (
			<>
				<path d="M5 9h15v7H5a3.5 3.5 0 0 1 0-7Z" />
				<path d="M5 13h14M6 13v3" />
			</>
		),
		stack: (
			<>
				<rect x="5" y="3" width="14" height="4" rx=".7" />
				<rect x="3" y="10" width="17" height="4" rx=".7" />
				<rect x="4" y="17" width="16" height="4" rx=".7" />
			</>
		),
		fan: (
			<>
				<rect x="10" y="3" width="4" height="17" rx="1" />
				<rect
					x="10"
					y="3"
					width="4"
					height="17"
					rx="1"
					transform="rotate(-25 12 20)"
				/>
				<rect
					x="10"
					y="3"
					width="4"
					height="17"
					rx="1"
					transform="rotate(25 12 20)"
				/>
			</>
		),
	};
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{paths[layout]}
		</svg>
	);
}

export function ShelfRange({
	label,
	value,
	min,
	max,
	step = 1,
	onChange,
	onStart,
	onEnd,
	disabled = false,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	disabled?: boolean;
	onChange: (value: number) => void;
	onStart: () => void;
	onEnd: () => void;
}) {
	return (
		<input
			className="shelf-range"
			aria-label={label}
			type="range"
			disabled={disabled}
			value={value}
			min={min}
			max={max}
			step={step}
			onPointerDown={onStart}
			onPointerUp={onEnd}
			onPointerCancel={onEnd}
			onKeyDown={(event) => {
				if (
					[
						"ArrowLeft",
						"ArrowRight",
						"ArrowUp",
						"ArrowDown",
						"Home",
						"End",
					].includes(event.key)
				)
					onStart();
			}}
			onKeyUp={onEnd}
			onBlur={onEnd}
			onChange={(event) => onChange(Number(event.target.value))}
		/>
	);
}

export function BookFaceIcon({ face }: { face: ShelfFace }) {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{face === "spine" ? (
				<>
					<rect x="9" y="3" width="6" height="18" rx="1.5" />
					<path d="M9 7h6M9 17h6" />
				</>
			) : (
				<>
					<rect x="5" y="3" width="14" height="18" rx="1.5" />
					<path d="M8 3v18" />
					{face === "cover" ? (
						<path d="M11 8h5m-5 3h3" />
					) : (
						<path d="M12 16v2m2-2v2m2-2v2" />
					)}
				</>
			)}
		</svg>
	);
}

export function BookGroupIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M7 3H3v4m14-4h4v4M3 17v4h4m14-4v4h-4" />
			<rect x="6" y="7" width="3" height="10" rx=".5" />
			<rect x="11" y="7" width="3" height="10" rx=".5" />
			<path d="m16 8 2-.5 2 9-2 .5Z" />
		</svg>
	);
}
