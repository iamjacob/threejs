import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { Point } from "./perspective";

export const cornerNames = [
	"Top left",
	"Top right",
	"Bottom right",
	"Bottom left",
];
/** Loupe size (CSS px) and how much it magnifies the on-screen photo. */
const LENS_SIZE = 132;
const LENS_ZOOM = 3;
type View = {
	width: number;
	height: number;
	scale: number;
	x: number;
	y: number;
};

export default function CropCanvas({
	source,
	points,
	onChange,
	onInteractionChange,
	disabled = false,
}: {
	source: HTMLCanvasElement;
	points: Point[];
	onChange: (points: Point[]) => void;
	onInteractionChange?: (dragging: boolean) => void;
	disabled?: boolean;
}) {
	const host = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const lens = useRef<HTMLCanvasElement>(null);
	const active = useRef<{ index: number; pointer: number } | null>(null);
	/** The corner being dragged: the loupe follows it. */
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [view, setView] = useState<View>({
		width: 1,
		height: 1,
		scale: 1,
		x: 0,
		y: 0,
	});
	useEffect(() => {
		const element = host.current;
		if (!element) return;
		const resize = () => {
			const { width, height } = element.getBoundingClientRect();
			const scale = Math.min(
				Math.max(1, width - 40) / source.width,
				Math.max(1, height - 40) / source.height,
			);
			setView({
				width,
				height,
				scale,
				x: (width - source.width * scale) / 2,
				y: (height - source.height * scale) / 2,
			});
		};
		const observer = new ResizeObserver(resize);
		observer.observe(element);
		resize();
		return () => observer.disconnect();
	}, [source]);
	useEffect(() => {
		const target = canvas.current;
		if (!target) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		target.width = Math.round(view.width * dpr);
		target.height = Math.round(view.height * dpr);
		const ctx = target.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, view.width, view.height);
		ctx.drawImage(
			source,
			view.x,
			view.y,
			source.width * view.scale,
			source.height * view.scale,
		);
		const screen = points.map((p) => ({
			x: view.x + p.x * view.scale,
			y: view.y + p.y * view.scale,
		}));
		if (screen.length === 4) {
			ctx.beginPath();
			// Shade only the unused photo area, leaving the shelf clear around it.
			ctx.rect(
				view.x,
				view.y,
				source.width * view.scale,
				source.height * view.scale,
			);
			ctx.moveTo(screen[0].x, screen[0].y);
			for (const p of screen.slice(1)) ctx.lineTo(p.x, p.y);
			ctx.closePath();
			ctx.fillStyle = "#070a1388";
			ctx.fill("evenodd");
		}
		if (screen.length > 1) {
			ctx.beginPath();
			ctx.moveTo(screen[0].x, screen[0].y);
			for (const p of screen.slice(1)) ctx.lineTo(p.x, p.y);
			if (screen.length === 4) ctx.closePath();
			ctx.strokeStyle = "#f5f3e9";
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}
	}, [source, points, view]);
	// Magnifier: while a corner is held, show the photo around it at 3× (what a
	// fingertip hides), with the crop outline and a small sight in the middle.
	const dragged = dragIndex === null ? undefined : points[dragIndex];
	const onRight = dragged
		? view.x + dragged.x * view.scale < view.width / 2
		: true;
	useEffect(() => {
		const target = lens.current;
		if (!target || !dragged) return;
		const css = LENS_SIZE;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		target.width = Math.round(css * dpr);
		target.height = Math.round(css * dpr);
		const ctx = target.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = "#0b0f1a";
		ctx.fillRect(0, 0, css, css);
		// The lens shows `css / LENS_ZOOM` screen pixels around the corner.
		const span = css / LENS_ZOOM / view.scale;
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(
			source,
			dragged.x - span / 2,
			dragged.y - span / 2,
			span,
			span,
			0,
			0,
			css,
			css,
		);
		// Crop outline, in lens coordinates.
		const toLens = (p: Point) => ({
			x: css / 2 + ((p.x - dragged.x) / span) * css,
			y: css / 2 + ((p.y - dragged.y) / span) * css,
		});
		if (points.length > 1) {
			ctx.beginPath();
			points.forEach((p, i) => {
				const l = toLens(p);
				if (i === 0) ctx.moveTo(l.x, l.y);
				else ctx.lineTo(l.x, l.y);
			});
			if (points.length === 4) ctx.closePath();
			ctx.strokeStyle = "#f5f3e9";
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}
		// Sight: a small ring with a gap, so the exact pixel stays visible.
		ctx.strokeStyle = "#ef3d48";
		ctx.lineWidth = 1.5;
		const c = css / 2;
		ctx.beginPath();
		ctx.arc(c, c, 9, 0, Math.PI * 2);
		ctx.moveTo(c - 16, c);
		ctx.lineTo(c - 5, c);
		ctx.moveTo(c + 5, c);
		ctx.lineTo(c + 16, c);
		ctx.moveTo(c, c - 16);
		ctx.lineTo(c, c - 5);
		ctx.moveTo(c, c + 5);
		ctx.lineTo(c, c + 16);
		ctx.stroke();
	}, [dragged, points, source, view.scale]);
	const position = (event: PointerEvent) => {
		const rect = event.currentTarget.getBoundingClientRect();
		return {
			x: (event.clientX - rect.left - view.x) / view.scale,
			y: (event.clientY - rect.top - view.y) / view.scale,
		};
	};
	const clamp = (p: Point) => ({
		x: Math.max(0, Math.min(source.width, p.x)),
		y: Math.max(0, Math.min(source.height, p.y)),
	});
	const end = (event: PointerEvent) => {
		if (active.current?.pointer !== event.pointerId) return;
		active.current = null;
		setDragIndex(null);
		onInteractionChange?.(false);
		if (host.current?.hasPointerCapture(event.pointerId))
			host.current.releasePointerCapture(event.pointerId);
	};
	return (
		<div
			ref={host}
			className="scan-crop-canvas"
			onPointerDown={(event) => {
				if (
					disabled ||
					!event.isPrimary ||
					event.button !== 0 ||
					active.current
				)
					return;
				const p = position(event);
				const corner = (event.target as HTMLElement).closest<HTMLElement>(
					"[data-corner]",
				);
				let index = corner
					? Number(corner.dataset.corner)
					: points.findIndex(
							(point) =>
								Math.hypot(point.x - p.x, point.y - p.y) * view.scale < 28,
						);
				if (index < 0) {
					if (
						points.length >= 4 ||
						p.x < 0 ||
						p.y < 0 ||
						p.x > source.width ||
						p.y > source.height
					)
						return;
					index = points.length;
					onChange([...points, p]);
				}
				active.current = { index, pointer: event.pointerId };
				setDragIndex(index);
				onInteractionChange?.(true);
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				if (disabled || active.current?.pointer !== event.pointerId) return;
				const index = active.current.index;
				onChange(
					points.map((p, i) => (i === index ? clamp(position(event)) : p)),
				);
			}}
			onPointerUp={end}
			onPointerCancel={end}
			onLostPointerCapture={() => {
				active.current = null;
				setDragIndex(null);
				onInteractionChange?.(false);
			}}
		>
			{dragged && (
				// A purely visual aid: hidden from screen readers via its wrapper.
				<div
					className="scan-loupe"
					data-side={onRight ? "right" : "left"}
					aria-hidden="true"
				>
					<canvas ref={lens} />
				</div>
			)}
			<canvas
				ref={canvas}
				aria-label="Book photo. Place corners clockwise, starting at the top left."
			/>
			{points.map((point, index) => (
				<button
					key={cornerNames[index]}
					type="button"
					disabled={disabled}
					data-corner={index}
					className="scan-corner"
					aria-label={`${cornerNames[index]} corner. Use arrow keys to adjust.`}
					style={{
						left: view.x + point.x * view.scale,
						top: view.y + point.y * view.scale,
					}}
					onKeyDown={(event) => {
						const moves: Record<string, Point> = {
							ArrowLeft: { x: -1, y: 0 },
							ArrowRight: { x: 1, y: 0 },
							ArrowUp: { x: 0, y: -1 },
							ArrowDown: { x: 0, y: 1 },
						};
						const move = moves[event.key];
						if (!move) return;
						event.preventDefault();
						const step = event.shiftKey ? 10 : 1;
						onChange(
							points.map((p, i) =>
								i === index
									? clamp({ x: p.x + move.x * step, y: p.y + move.y * step })
									: p,
							),
						);
					}}
				>
					{index + 1}
				</button>
			))}
		</div>
	);
}
