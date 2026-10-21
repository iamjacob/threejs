// @ts-nocheck
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { setControllerJoystick } from "../tour/controllerJoystick";
import {
	arcPath,
	type BoooksControllerProps,
	type ControllerActionItem,
	DEFAULT_ACTIONS,
	DRAG_PX,
	defaultHome,
	EDGE,
	HALF,
	HOLD_MS,
	JR,
	LOGO_D,
	MENU_R,
	mod,
	SPREAD,
	STEP,
	VIS,
	WH,
	wrap,
} from "./boooksControllerActions";
import { CONTROLLER_CSS } from "./boooksControllerStyles";

export {
	type BoooksControllerProps,
	type ControllerActionItem,
	DEFAULT_ACTIONS,
};
export default function BoooksController({
	actions = DEFAULT_ACTIONS,
	onJoystick = setControllerJoystick,
	onAction,
	activeToggles,
	storageKey = "boooks-dock",
	home = defaultHome,
	haptics = true,
}: BoooksControllerProps) {
	const dockRef = useRef(null);
	const btnRef = useRef(null);
	const baseRef = useRef(null);
	const wheelRef = useRef(null);

	const [open, setOpenState] = useState(false);
	const [active, setActiveState] = useState(null); // slot number (not action index)
	const [internalToggles, setToggles] = useState(() =>
		Object.fromEntries(actions.map((a) => [a.id, !!a.on])),
	);
	const toggles = activeToggles
		? { ...internalToggles, ...activeToggles }
		: internalToggles;
	const [center, setCenter] = useState(-Math.PI / 2);
	const [scroll, setScrollState] = useState(0); // dial position, in buttons

	const n = actions.length;
	const live = useRef({});
	live.current = {
		onJoystick,
		onAction,
		haptics,
		actions,
		open,
		active,
		toggles,
		home,
	};
	const g = useRef({
		mode: "idle",
		pid: null,
		sx: 0,
		sy: 0,
		offX: 0,
		offY: 0,
		armT: 0,
		liftT: 0,
		atEdge: false,
		pos: { x: 0, y: 0 },
		center: -Math.PI / 2,
		scroll: 0,
		selRel: null,
	}).current;

	/* ---------- feedback (sound removed; haptics only) ---------- */
	const tick = useCallback(() => {}, []);
	const buzz = useCallback((p) => {
		if (!live.current.haptics) return;
		try {
			navigator.vibrate?.(p);
		} catch {}
	}, []);

	/* ---------- knob spring ---------- */
	const sp = useRef({
		s: 1,
		vs: 0,
		ts: 1,
		x: 0,
		vx: 0,
		tx: 0,
		y: 0,
		vy: 0,
		ty: 0,
	}).current;
	const raf = useRef(0);
	const step = useCallback(() => {
		const k = 560,
			d = 26,
			dt = 1 / 60;
		for (const [p, v, t] of [
			["s", "vs", "ts"],
			["x", "vx", "tx"],
			["y", "vy", "ty"],
		]) {
			sp[v] += (-k * (sp[p] - sp[t]) - d * sp[v]) * dt;
			sp[p] += sp[v] * dt;
		}
		const B = btnRef.current?.style;
		if (B) {
			const nx = sp.x / JR,
				ny = sp.y / JR;
			B.setProperty("--s", sp.s.toFixed(4));
			B.setProperty("--kx", `${sp.x.toFixed(2)}px`);
			B.setProperty("--ky", `${sp.y.toFixed(2)}px`);
			B.setProperty("--rx", `${(-ny * 18).toFixed(2)}deg`);
			B.setProperty("--ry", `${(nx * 18).toFixed(2)}deg`);
			B.setProperty("--hx", `${(35 - nx * 20).toFixed(1)}%`);
			B.setProperty("--hy", `${(28 - ny * 20).toFixed(1)}%`);
			B.setProperty("--gx", `${(16 - nx * 12).toFixed(1)}%`);
			B.setProperty("--gy", `${(9 - ny * 12).toFixed(1)}%`);
			B.setProperty("--shx", `${(-sp.x * 0.35).toFixed(2)}px`);
			B.setProperty("--shy", `${(9 - sp.y * 0.35).toFixed(2)}px`);
		}
		const rest =
			Math.abs(sp.s - sp.ts) +
				Math.abs(sp.vs) +
				Math.abs(sp.x - sp.tx) +
				Math.abs(sp.vx) +
				Math.abs(sp.y - sp.ty) +
				Math.abs(sp.vy) <
			0.001;
		raf.current = rest ? 0 : requestAnimationFrame(step);
	}, [sp]);
	const kick = () => {
		if (!raf.current) raf.current = requestAnimationFrame(step);
	};
	const scaleTo = (s) => {
		sp.ts = s;
		kick();
	};
	const knobSet = (x, y) => {
		sp.x = sp.tx = x;
		sp.y = sp.ty = y;
		sp.vx = sp.vy = 0;
		kick();
	};
	const knobHome = () => {
		sp.tx = 0;
		sp.ty = 0;
		kick();
	};

	/* ---------- dock position ---------- */
	const cls = (add, ...c) =>
		dockRef.current?.classList[add ? "add" : "remove"](...c);
	const clampPos = (p) => ({
		x: Math.min(window.innerWidth - EDGE, Math.max(EDGE, p.x)),
		y: Math.min(window.innerHeight - EDGE, Math.max(EDGE + 40, p.y)),
	});
	const place = (glide) => {
		const el = dockRef.current;
		if (!el) return;
		el.classList.toggle("bc-glide", !!glide);
		el.style.transform = `translate(${g.pos.x}px,${g.pos.y}px)`;
	};
	const savePos = () => {
		try {
			localStorage.setItem(storageKey, JSON.stringify(g.pos));
		} catch {}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: Initial placement only re-reads when storageKey changes.
	useLayoutEffect(() => {
		let p = null;
		try {
			p = JSON.parse(localStorage.getItem(storageKey));
		} catch {}
		if (!p || typeof p.x !== "number") p = live.current.home();
		g.pos = clampPos(p);
		place(false);
		const onResize = () => {
			g.pos = clampPos(g.pos);
			place(true);
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [storageKey]);

	/* ---------- infinite dial ---------- */
	const sc = useRef({
		v: 0,
		raf: 0,
		last: 0,
		lastRound: 0,
		edgeDir: 0,
		target: null,
		wheelT: 0,
	}).current;

	const setActive = (s) => {
		if (s === live.current.active) return;
		live.current.active = s;
		setActiveState(s);
		if (s !== null) {
			tick(700 + mod(s, live.current.actions.length) * 40, 0.03, 0.05);
			buzz(6);
		}
	};
	const updateSelect = () => {
		if (g.mode !== "select" || g.selRel === null) return;
		setActive(
			Math.abs(g.selRel) < HALF + 0.2
				? Math.round(g.scroll + g.selRel / STEP)
				: null,
		);
	};
	const setScroll = (v) => {
		g.scroll = v;
		setScrollState(v);
		const r = Math.round(v);
		if (r !== sc.lastRound) {
			// detent click every time a button passes the focus point
			sc.lastRound = r;
			if (live.current.open) {
				tick(560 + mod(r, live.current.actions.length) * 24, 0.018, 0.03);
				buzz(3);
			}
		}
		updateSelect();
	};
	const scrollLoop = (t) => {
		const dt = sc.last ? Math.min(0.05, (t - sc.last) / 1000) : 1 / 60;
		sc.last = t;
		let s = g.scroll;
		if (sc.edgeDir) {
			s += sc.edgeDir * dt * 4.5;
			sc.v = 0;
		} // auto-spin at arc ends
		else if (Math.abs(sc.v) > 1.2 && sc.target === null) {
			s += sc.v * dt;
			sc.v *= 0.03 ** dt;
		} // momentum
		else {
			// snap to detent
			sc.v = 0;
			const tgt = sc.target ?? Math.round(s);
			s += (tgt - s) * Math.min(1, dt * 16);
			if (Math.abs(tgt - s) < 0.002) {
				sc.target = null;
				sc.raf = 0;
				sc.last = 0;
				setScroll(tgt);
				cls(false, "bc-scrolling");
				return;
			}
		}
		setScroll(s);
		sc.raf = requestAnimationFrame(scrollLoop);
	};
	const animateScroll = () => {
		cls(true, "bc-scrolling");
		if (!sc.raf) {
			sc.last = 0;
			sc.raf = requestAnimationFrame(scrollLoop);
		}
	};
	const stopScroll = () => {
		cancelAnimationFrame(sc.raf);
		sc.raf = 0;
		sc.last = 0;
		sc.v = 0;
		sc.target = null;
	};
	const nudge = (dir) => {
		sc.v = 0;
		sc.target = Math.round(sc.target ?? g.scroll) + dir;
		animateScroll();
	};
	const wheelBy = (delta) => {
		stopScroll();
		cls(true, "bc-scrolling");
		setScroll(g.scroll + delta / 90);
		clearTimeout(sc.wheelT);
		sc.wheelT = setTimeout(animateScroll, 110);
	};

	useEffect(
		() => () => {
			cancelAnimationFrame(raf.current);
			cancelAnimationFrame(sc.raf);
			clearTimeout(sc.wheelT);
		},
		[sc],
	);

	/* ---------- menu ---------- */
	const setOpen = (v) => {
		if (live.current.open === v) return;
		live.current.open = v;
		if (v) {
			const { innerWidth: w, innerHeight: h } = window;
			let c = Math.atan2(h / 2 - g.pos.y, w / 2 - g.pos.x); // fan opens toward screen center
			if (Math.hypot(w / 2 - g.pos.x, h / 2 - g.pos.y) < 80) c = -Math.PI / 2;
			g.center = c;
			setCenter(c);
		} else {
			sc.edgeDir = 0;
		}
		setOpenState(v);
		if (v) {
			tick(380, 0.06, 0.05);
			buzz(10);
		} else {
			setActive(null);
			tick(240, 0.05, 0.035);
		}
	};

	const fire = (i) => {
		const a = live.current.actions[i];
		const dock = dockRef.current;
		if (dock) {
			const r = document.createElement("div");
			r.className = "bc-ripple";
			dock.appendChild(r);
			setTimeout(() => r.remove(), 600);
		}
		let on: boolean | undefined;
		if (a.toggle) {
			on = !live.current.toggles[a.id];
			setToggles((t) => ({ ...t, [a.id]: on }));
		}
		tick(880, 0.05, 0.07);
		setTimeout(() => tick(1320, 0.06, 0.05), 55);
		buzz([8, 30, 14]);
		setOpen(false);
		scaleTo(1.12);
		setTimeout(() => scaleTo(1), 90);
		if (a.id === "home") {
			g.pos = clampPos(live.current.home());
			place(true);
			savePos();
		}
		live.current.onAction?.(a.id, on);
	};

	/* ---------- joystick output ---------- */
	const emitJoy = (x, y) =>
		live.current.onJoystick?.({ x, y: -y, mag: Math.min(1, Math.hypot(x, y)) });

	/* ---------- logo gestures ----------
     press → move > DRAG_PX → joystick (or radial select if menu open)
     press → still for HOLD_MS → pick up & move
     press → quick release → toggle menu                                */
	const onPointerDown = (e) => {
		if (g.pid !== null) return;
		g.pid = e.pointerId;
		btnRef.current.setPointerCapture(g.pid);
		g.mode = "press";
		g.sx = e.clientX;
		g.sy = e.clientY;
		g.offX = e.clientX - g.pos.x;
		g.offY = e.clientY - g.pos.y;
		cls(true, "bc-down");
		scaleTo(0.96);
		tick(300, 0.03, 0.035);
		g.armT = setTimeout(() => cls(true, "bc-arming"), 140);
		g.liftT = setTimeout(() => {
			if (g.mode !== "press") return;
			g.mode = "move";
			cls(false, "bc-arming", "bc-down");
			cls(true, "bc-lifted");
			if (live.current.open) setOpen(false);
			scaleTo(1.14);
			buzz(18);
			tick(200, 0.08, 0.06);
		}, HOLD_MS);
	};

	const onPointerMove = (e) => {
		if (e.pointerId !== g.pid) return;
		const dx = e.clientX - g.sx,
			dy = e.clientY - g.sy,
			d = Math.hypot(dx, dy);
		if (g.mode === "press" && d > DRAG_PX) {
			clearTimeout(g.armT);
			clearTimeout(g.liftT);
			cls(false, "bc-arming");
			if (live.current.open) {
				g.mode = "select";
				stopScroll();
			} else {
				g.mode = "joy";
				cls(true, "bc-joy");
				scaleTo(1);
				buzz(5);
			}
		}
		if (g.mode === "joy") {
			const k = d > JR ? JR / d : 1,
				kx = dx * k,
				ky = dy * k;
			knobSet(kx, ky);
			emitJoy(kx / JR, ky / JR);
			const b = baseRef.current?.style;
			if (b) {
				b.setProperty("--ang", `${(Math.atan2(dx, -dy) * 180) / Math.PI}deg`);
				b.setProperty("--mag", Math.min(1, d / JR).toFixed(3));
			}
			const edge = d >= JR;
			if (edge && !g.atEdge) {
				buzz(4);
				tick(460, 0.025, 0.03);
			}
			g.atEdge = edge;
		} else if (g.mode === "move") {
			g.pos = { x: e.clientX - g.offX, y: e.clientY - g.offY };
			place(false);
		} else if (g.mode === "select") {
			knobSet(
				Math.max(-14, Math.min(14, dx * 0.2)),
				Math.max(-14, Math.min(14, dy * 0.2)),
			);
			if (d < 36) {
				g.selRel = null;
				sc.edgeDir = 0;
				setActive(null);
				return;
			}
			const rel = wrap(Math.atan2(dy, dx) - g.center);
			g.selRel = rel;
			const atEnd = Math.abs(rel) > HALF - 0.14 && Math.abs(rel) < HALF + 0.6;
			const dir = atEnd ? Math.sign(rel) : 0;
			if (dir !== sc.edgeDir) {
				sc.edgeDir = dir;
				if (dir) animateScroll();
				else animateScroll();
			}
			updateSelect();
		}
	};

	const onRelease = (e) => {
		if (e.pointerId !== g.pid) return;
		g.pid = null;
		clearTimeout(g.armT);
		clearTimeout(g.liftT);
		cls(false, "bc-arming");
		if (g.mode === "press") setOpen(!live.current.open);
		else if (g.mode === "joy") {
			cls(false, "bc-joy");
			emitJoy(0, 0);
			g.atEdge = false;
		} else if (g.mode === "move") {
			cls(false, "bc-lifted");
			g.pos = clampPos(g.pos);
			place(true);
			savePos();
			buzz(10);
			tick(320, 0.05, 0.05);
		} else if (g.mode === "select") {
			sc.edgeDir = 0;
			g.selRel = null;
			const s = live.current.active;
			if (s !== null) fire(mod(s, live.current.actions.length));
			else setOpen(false);
			animateScroll();
		}
		g.mode = "idle";
		cls(false, "bc-down");
		knobHome();
		scaleTo(1);
	};

	/* ---------- dial gestures (swipe along the ring, tap a button) ---------- */
	const wd = useRef({ pid: null }).current;
	const polar = (e) => {
		const dx = e.clientX - g.pos.x,
			dy = e.clientY - g.pos.y;
		return { ang: Math.atan2(dy, dx), d: Math.hypot(dx, dy) };
	};
	const onWheelDown = (e) => {
		if (!live.current.open || wd.pid !== null) return;
		wd.pid = e.pointerId;
		e.currentTarget.setPointerCapture(e.pointerId);
		const p = polar(e);
		Object.assign(wd, {
			prev: p.ang,
			acc: 0,
			s0: g.scroll,
			x0: e.clientX,
			y0: e.clientY,
			drag: false,
			d0: p.d,
			t: performance.now(),
			v: 0,
			slot: e.target.closest?.("[data-slot]")?.dataset.slot ?? null,
		});
		stopScroll();
	};
	const onWheelMove = (e) => {
		if (e.pointerId !== wd.pid) return;
		if (!wd.drag && Math.hypot(e.clientX - wd.x0, e.clientY - wd.y0) > 6) {
			wd.drag = true;
			cls(true, "bc-scrolling");
		}
		if (!wd.drag) return;
		const p = polar(e),
			now = performance.now();
		const da = wrap(p.ang - wd.prev);
		wd.prev = p.ang;
		wd.acc += da;
		const dt = Math.max(1, now - wd.t) / 1000;
		wd.t = now;
		wd.v = 0.75 * (-(da / STEP) / dt) + 0.25 * wd.v;
		setScroll(wd.s0 - wd.acc / STEP);
	};
	const onWheelUp = (e) => {
		if (e.pointerId !== wd.pid) return;
		wd.pid = null;
		if (!wd.drag) {
			if (wd.slot !== null) fire(mod(+wd.slot, live.current.actions.length));
			else if (wd.d0 > MENU_R + 40 || wd.d0 < 40) setOpen(false);
			return;
		}
		const idle = performance.now() - wd.t > 80; // finger stopped before lifting → no fling
		sc.v = idle ? 0 : Math.max(-22, Math.min(22, wd.v));
		animateScroll();
	};

	// mouse wheel / trackpad over the controller spins the dial (non-passive so the page doesn't scroll)
	// biome-ignore lint/correctness/useExhaustiveDependencies: Listener attaches once on mount and reads live ref state.
	useEffect(() => {
		const el = dockRef.current;
		if (!el) return;
		const onWheel = (e) => {
			if (!live.current.open) return;
			e.preventDefault();
			wheelBy(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Global keyboard handler attaches once on mount.
	useEffect(() => {
		const onKey = (e) => {
			if (e.key === "Escape") setOpen(false);
			if (!live.current.open) return;
			if (e.key === "ArrowRight" || e.key === "ArrowDown") {
				e.preventDefault();
				nudge(1);
			}
			if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
				e.preventDefault();
				nudge(-1);
			}
			if (e.key === "Enter" && document.activeElement === btnRef.current) {
				e.preventDefault();
				fire(mod(Math.round(g.scroll), live.current.actions.length));
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* ---------- render ---------- */
	const focusSlot = Math.round(scroll);
	const slots = [];
	for (let s = focusSlot - VIS; s <= focusSlot + VIS; s++) slots.push(s);
	const trackPad = STEP * 0.55;
	const thumbAng = center - HALF + (mod(scroll, n) / n) * SPREAD;

	return (
		<div
			className={`bc-root${open ? " bc-open" : ""}${active !== null ? " bc-picking" : ""}`}
		>
			<style>{CONTROLLER_CSS}</style>
			<div className="bc-scrim" onPointerDown={() => setOpen(false)} />
			<div className="bc-dock" ref={dockRef}>
				<div className="bc-base" ref={baseRef}>
					<div className="bc-ticks" />
					<div className="bc-arc" />
				</div>

				<div
					className="bc-wheel"
					ref={wheelRef}
					onPointerDown={onWheelDown}
					onPointerMove={onWheelMove}
					onPointerUp={onWheelUp}
					onPointerCancel={onWheelUp}
				>
					<svg
						className="bc-track"
						viewBox={`0 0 ${WH * 2} ${WH * 2}`}
						aria-hidden="true"
					>
						<path
							className="bc-band"
							d={arcPath(
								MENU_R,
								center - HALF - trackPad,
								center + HALF + trackPad,
							)}
						/>
						<path
							className="bc-rail"
							d={arcPath(MENU_R + 38, center - HALF, center + HALF)}
						/>
						<circle
							className="bc-thumb"
							cx={WH + (MENU_R + 38) * Math.cos(thumbAng)}
							cy={WH + (MENU_R + 38) * Math.sin(thumbAng)}
							r="2.5"
						/>
					</svg>

					{slots.map((s) => {
						const i = mod(s, n),
							a = actions[i];
						const off = (s - scroll) * STEP;
						const ang = center + off,
							cx = Math.cos(ang),
							sy = Math.sin(ang);
						const ad = Math.abs(off);
						const o =
							ad <= HALF ? 1 : Math.max(0, 1 - (ad - HALF) / (STEP * 0.8));
						const k = 1 - Math.min(1, ad / (HALF + STEP)) * 0.3;
						const isOn = !!(a.toggle && toggles[a.id]);
						const itemLabel = isOn && a.activeLabel ? a.activeLabel : a.label;
						const itemIcon = isOn && a.activeIcon ? a.activeIcon : a.icon;
						return (
							<button
								type="button"
								key={s}
								data-slot={s}
								className={`bc-item${active === s ? " bc-active" : ""}${s === focusSlot ? " bc-focus" : ""}${isOn ? " bc-on" : ""}`}
								aria-label={itemLabel}
								tabIndex={open && o > 0.5 ? 0 : -1}
								onClick={(e) => {
									if (e.detail === 0) fire(i);
								}} // keyboard only; pointer taps go through the wheel
								style={{
									"--x": `${(cx * MENU_R).toFixed(1)}px`,
									"--y": `${(sy * MENU_R).toFixed(1)}px`,
									"--lx": `${(cx * 44).toFixed(1)}px`,
									"--ly": `${(sy * 44).toFixed(1)}px`,
									"--o": o.toFixed(3),
									"--k": k.toFixed(3),
									pointerEvents: open && o > 0.3 ? "auto" : "none",
									transitionDelay: open
										? `${Math.abs(s - focusSlot) * 26}ms`
										: "0ms",
								}}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true">
									{itemIcon}
								</svg>
								<span className="bc-label">{itemLabel}</span>
							</button>
						);
					})}
				</div>

				<button
					type="button"
					ref={btnRef}
					className="bc-btn"
					aria-label="Controller: drag to steer, tap for menu, hold to move"
					aria-expanded={open}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onRelease}
					onPointerCancel={onRelease}
					onContextMenu={(e) => e.preventDefault()}
					onClick={(e) => {
						if (e.detail === 0) setOpen(!live.current.open);
					}}
				>
					<span className="bc-cshadow" />
					<span className="bc-glow" />
					<span className="bc-cap" />
					<svg className="bc-ring" viewBox="0 0 84 84" aria-hidden="true">
						<circle cx="42" cy="42" r="41" />
					</svg>
					<svg className="bc-logo" viewBox="0 0 153 170" aria-hidden="true">
						<defs>
							<linearGradient
								id="bc-logo-g"
								x1="0"
								y1="85"
								x2="152"
								y2="85"
								gradientUnits="userSpaceOnUse"
							>
								<stop stopColor="#7C1414" />
								<stop offset="1" stopColor="#E22424" />
							</linearGradient>
						</defs>
						<path fill="url(#bc-logo-g)" d={LOGO_D} />
					</svg>
				</button>
			</div>
		</div>
	);
}
