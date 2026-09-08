"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useReadingStore } from "../../../stores/useReadingStore";

const TOTAL = 120;
const ITEM_HEIGHT = 26;
const MENU_HEIGHT = 144;
const PAGES = Array.from({ length: TOTAL }, (_, index) => index);

const lerp = (start: number, end: number, amount: number): number =>
	start * (1 - amount) + end * amount;

interface SwiperAnimationState {
	current: number;
	smooth: number;
	last: number;
	dragging: boolean;
	startY: number;
	scrollTimeout: ReturnType<typeof setTimeout> | null;
	lastHighlight: HTMLDivElement | null;
	animationFrameId: number | null;
}

interface ThrottleState {
	last: number;
	timer: ReturnType<typeof setTimeout> | null;
}

export default function BookPageSwiper() {
	const menuRef = useRef<HTMLDivElement>(null);
	const itemsRef = useRef<Array<HTMLDivElement | null>>([]);
	const stateRef = useRef<SwiperAnimationState>({
		current: 0,
		smooth: 0,
		last: 0,
		dragging: false,
		startY: 0,
		scrollTimeout: null,
		lastHighlight: null,
		animationFrameId: null,
	});

	const throttleRef = useRef<ThrottleState>({
		last: 0,
		timer: null,
	});

	const [selectedPage, setSelectedPage] = useState<number>(0);
	const setReadingSelected = useReadingStore((state) => state.setSelectedPage);

	const snap = useCallback((): void => {
		const state = stateRef.current;
		const middle = state.smooth + MENU_HEIGHT / 2;
		const index = Math.round(middle / ITEM_HEIGHT);

		state.current = index * ITEM_HEIGHT - MENU_HEIGHT / 2;
	}, []);

	const highlight = useCallback((): void => {
		const menu = menuRef.current;
		if (!menu) return;

		const menuTop = menu.getBoundingClientRect().top;
		const menuMiddle = menuTop + MENU_HEIGHT / 2;
		const state = stateRef.current;
		let found: HTMLDivElement | null = null;

		itemsRef.current.forEach((element) => {
			if (!element) return;

			const bounds = element.getBoundingClientRect();
			const itemMiddle = bounds.top + bounds.height / 2;

			if (Math.abs(itemMiddle - menuMiddle) < bounds.height / 2) {
				element.style.opacity = "1";
				found = element;
			} else {
				element.style.opacity = "0.35";
			}
		});

		if (!found || found === state.lastHighlight) return;

		const highlighted = found as HTMLDivElement;
		const pageValue = highlighted.dataset.page;
		if (pageValue === undefined) return;

		const pageNumber = Number.parseInt(pageValue, 10);
		if (!Number.isFinite(pageNumber)) return;

		setSelectedPage(pageNumber);

		// Throttle reading-store updates to roughly once every 100 ms.
		const now = Date.now();
		const throttle = throttleRef.current;

		if (now - throttle.last > 100) {
			setReadingSelected(pageNumber);
			throttle.last = now;

			if (throttle.timer) {
				clearTimeout(throttle.timer);
				throttle.timer = null;
			}
		} else {
			if (throttle.timer) clearTimeout(throttle.timer);

			throttle.timer = setTimeout(() => {
				setReadingSelected(pageNumber);
				throttle.last = Date.now();
				throttle.timer = null;
			}, 120);
		}

		state.lastHighlight = found;
	}, [setReadingSelected]);

	useEffect(() => {
		const state = stateRef.current;
		const totalHeight = TOTAL * ITEM_HEIGHT;
		const lowerBound = -ITEM_HEIGHT;
		const upperBound = totalHeight - ITEM_HEIGHT;
		const range = upperBound - lowerBound;

		const animate = (): void => {
			state.smooth = lerp(state.smooth, state.current, 0.12);

			const speed = state.smooth - state.last;
			state.last = state.smooth;

			const scale = 1 - Math.min(80, Math.abs(speed)) * 0.005;
			const rotation = speed * 0.3;

			itemsRef.current.forEach((element, index) => {
				if (!element) return;

				const rawPosition = index * ITEM_HEIGHT + state.smooth;
				const wrappedPosition =
					((((rawPosition - lowerBound) % range) + range) % range) + lowerBound;

				element.style.transform =
					`translateY(${wrappedPosition}px) ` +
					`scaleX(${scale}) rotate(${rotation}deg)`;
			});

			highlight();
			state.animationFrameId = requestAnimationFrame(animate);
		};

		state.animationFrameId = requestAnimationFrame(animate);

		return () => {
			if (state.animationFrameId !== null) {
				cancelAnimationFrame(state.animationFrameId);
			}
		};
	}, [highlight]);

	useEffect(() => {
		const menu = menuRef.current;
		if (!menu) return;

		const state = stateRef.current;

		const onWheel = (event: WheelEvent): void => {
			event.preventDefault();
			state.current -= event.deltaY * 0.7;

			if (state.scrollTimeout) clearTimeout(state.scrollTimeout);
			state.scrollTimeout = setTimeout(snap, 100);
		};

		const onMouseDown = (event: MouseEvent): void => {
			state.dragging = true;
			state.startY = event.clientY;
			menu.style.cursor = "grabbing";
		};

		const onMouseMove = (event: MouseEvent): void => {
			if (!state.dragging) return;

			state.current += (event.clientY - state.startY) * 2.8;
			state.startY = event.clientY;
		};

		const onMouseUp = (): void => {
			if (!state.dragging) return;

			state.dragging = false;
			menu.style.cursor = "grab";
			snap();
		};

		const onTouchStart = (event: TouchEvent): void => {
			const touch = event.touches[0];
			if (!touch) return;

			state.startY = touch.clientY;
			state.dragging = true;
		};

		const onTouchMove = (event: TouchEvent): void => {
			const touch = event.touches[0];
			if (!state.dragging || !touch) return;

			state.current += (touch.clientY - state.startY) * 2.8;
			state.startY = touch.clientY;
		};

		const onTouchEnd = (): void => {
			state.dragging = false;
			snap();
		};

		menu.addEventListener("wheel", onWheel, { passive: false });
		menu.addEventListener("mousedown", onMouseDown);
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
		menu.addEventListener("touchstart", onTouchStart, { passive: true });
		menu.addEventListener("touchmove", onTouchMove, { passive: true });
		menu.addEventListener("touchend", onTouchEnd);

		return () => {
			menu.removeEventListener("wheel", onWheel);
			menu.removeEventListener("mousedown", onMouseDown);
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			menu.removeEventListener("touchstart", onTouchStart);
			menu.removeEventListener("touchmove", onTouchMove);
			menu.removeEventListener("touchend", onTouchEnd);

			if (state.scrollTimeout) clearTimeout(state.scrollTimeout);
			if (throttleRef.current.timer) {
				clearTimeout(throttleRef.current.timer);
			}
		};
	}, [snap]);

	return (
		<aside
			aria-label={`Selected page ${selectedPage}`}
			className="absolute top-1/2 left-4 z-10 flex -translate-y-1/2 flex-col items-center justify-center overflow-hidden select-none"
		>
			<div
				ref={menuRef}
				className="relative z-10 mr-4 flex items-center justify-center overflow-hidden rounded-full border border-white/[0.18] bg-white/[0.08] text-[15px] font-medium tracking-wide text-white/90 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:border-white/[0.28] hover:bg-white/[0.14] active:scale-[0.98] active:bg-white/[0.06]"
				style={{
					cursor: "grab",
					height: MENU_HEIGHT,
					width: 42,
				}}
			>
				{PAGES.map((page, index) => (
					<div
						key={page}
						ref={(element) => {
							itemsRef.current[index] = element;
						}}
						data-page={page}
						className="absolute top-0 right-0 left-0 flex w-full flex-row items-center justify-between text-center"
						style={{ height: ITEM_HEIGHT, opacity: 0.35 }}
					>
						<span className="w-full text-center text-stone-400">{page}</span>
					</div>
				))}
			</div>
		</aside>
	);
}
