// @ts-nocheck
// BoooksController.jsx
// One floating logo control: drag = joystick, tap = radial menu, hold = pick up & move.
// The radial menu is an infinite dial: spin it to reveal more buttons.
//
// <BoooksController
//   onJoystick={({ x, y, mag }) => {}}   // x right+, y up+, both -1..1, fires every move + 0,0 on release
//   onAction={(id, on) => {}}            // menu pick; `on` is the new state for toggle actions
//   actions={[...]}                      // optional, defaults below (any length, loops forever)
// />
//
// Menu gestures (once open):
//   swipe along the ring     → spin the dial (momentum + snap)
//   mouse wheel / trackpad   → spin
//   tap a button             → fire it
//   press logo, slide out    → pick in one move; hold at either end of the arc to auto-spin
//   ← → / ↑ ↓ keys           → step one button
//
// Built-in action ids: "home" re-docks the controller, "sound" toggles the click sounds.
// Position is remembered in localStorage under `storageKey`.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { setControllerJoystick } from "../tour/controllerJoystick";

const LOGO_D =
  "M129.636 69.2931C116.863 60.7237 102.441 57.3581 87.7081 59.4667C90.952 52.1272 92.5335 44.5985 92.3037 37.4754C91.8847 24.3509 85.3427 13.3215 73.8943 6.42809C59.3506 -2.33057 37.1837 -2.11431 21.1937 6.92819C7.63677 14.592 0.1757 27.311 0.1757 42.7603C0.1757 52.6949 0.0540583 134.361 0.013509 155.339L0 160.232C0 164.53 3.48723 168.112 7.78545 168.193L88.1947 169.815C88.7894 169.828 89.3841 169.828 89.9788 169.828C120.58 169.828 142.382 156.271 149.803 132.645C157.061 109.559 148.194 81.7417 129.636 69.2931ZM59.4993 70.442C58.8235 70.9151 58.4315 71.2124 58.3369 71.28C54.8902 73.9292 54.1874 78.7546 56.7555 82.2689C59.3236 85.7832 64.1355 86.5942 67.7038 84.1206C68.0552 83.8773 68.4066 83.6205 68.704 83.4043C73.1374 80.3901 96.4803 66.1978 120.783 82.4987C133.583 91.0816 139.8 111.437 134.651 127.873C129.379 144.674 113.552 153.92 90.0735 153.92C89.5598 153.92 89.0327 153.92 88.5326 153.906L15.9494 152.446V150.811C15.9899 124.562 16.0981 52.0866 16.0981 42.7468C16.0981 30.6225 23.1401 24.0941 29.0333 20.7555C40.1573 14.4704 55.931 14.1595 65.7034 20.0392C72.5697 24.1617 76.1651 30.2035 76.4219 37.9755C76.7868 49.3158 69.6502 62.9674 59.4993 70.442Z";

export const DEFAULT_ACTIONS = [
  { id: "jump", label: "Jump", icon: <path d="M12 19V7M7 11l5-5 5 5M6 21h12" /> },
  { id: "cam", label: "Overview", toggle: true, icon: <><path d="M3 8h3l2-3h8l2 3h3v11H3z" /><circle cx="12" cy="13" r="3.5" /></> },
  { id: "lamp", label: "Lamplight", toggle: true, icon: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /> },
  { id: "home", label: "Re-dock", icon: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></> },
  { id: "sound", label: "Sound", toggle: true, on: true, icon: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></> },
  { id: "scan", label: "Scan book", icon: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" /> },
  { id: "timer", label: "Timer", icon: <><circle cx="12" cy="13" r="7" /><path d="M12 9v4l2.5 2M10 3h4" /></> },
  { id: "shelf", label: "Shelf", icon: <path d="M4 20h16M6 20V6M10 20V4M14 20l3-14 3 .7-3 13.3" /> },
  { id: "quote", label: "Quotes", icon: <path d="M7 11h3v6H5v-4c0-3 1-5 4-6M16 11h3v6h-5v-4c0-3 1-5 4-6" /> },
  { id: "map", label: "Map", icon: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /> },
];

const JR = 44;                         // joystick travel radius (px)
const MENU_R = 96;                     // radial menu radius
const SPREAD = (150 * Math.PI) / 180;  // visible arc
const HALF = SPREAD / 2;
const STEP = SPREAD / 4;               // angle between buttons (5 fully visible)
const VIS = 3;                         // slots rendered each side of focus
const WH = MENU_R + 60;                // wheel layer half-size
const EDGE = 56;                       // min distance from viewport edge
const HOLD_MS = 420;                   // long-press to pick up
const DRAG_PX = 7;                     // movement before joystick engages

const mod = (a, n) => ((a % n) + n) % n;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const arcPath = (r, a0, a1) => {
  const x0 = WH + r * Math.cos(a0), y0 = WH + r * Math.sin(a0);
  const x1 = WH + r * Math.cos(a1), y1 = WH + r * Math.sin(a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

const defaultHome = () => ({
  x: Math.max(EDGE + 20, Math.min(110, window.innerWidth * 0.22)),
  y: window.innerHeight - 120,
});

export default function BoooksController({
  actions = DEFAULT_ACTIONS,
  onJoystick = setControllerJoystick,
  onAction,
  storageKey = "boooks-dock",
  home = defaultHome,
  haptics = true,
}) {
  const dockRef = useRef(null);
  const btnRef = useRef(null);
  const baseRef = useRef(null);
  const wheelRef = useRef(null);

  const [open, setOpenState] = useState(false);
  const [active, setActiveState] = useState(null);      // slot number (not action index)
  const [toggles, setToggles] = useState(() => Object.fromEntries(actions.map((a) => [a.id, !!a.on])));
  const [center, setCenter] = useState(-Math.PI / 2);
  const [scroll, setScrollState] = useState(0);         // dial position, in buttons

  const n = actions.length;
  const live = useRef({});
  live.current = { onJoystick, onAction, haptics, actions, open, active, toggles, home };
  const g = useRef({
    mode: "idle", pid: null, sx: 0, sy: 0, offX: 0, offY: 0, armT: 0, liftT: 0, atEdge: false,
    pos: { x: 0, y: 0 }, center: -Math.PI / 2, scroll: 0, selRel: null,
  }).current;

  /* ---------- feedback ---------- */
  const ac = useRef(null);
  const soundRef = useRef(toggles.sound ?? true);
  soundRef.current = toggles.sound ?? true;
  const tick = useCallback((f = 520, d = 0.035, v = 0.06) => {
    if (!soundRef.current) return;
    try {
      ac.current = ac.current || new (window.AudioContext || window.webkitAudioContext)();
      const c = ac.current, o = c.createOscillator(), gn = c.createGain(), t = c.currentTime;
      o.type = "triangle";
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + d);
      gn.gain.setValueAtTime(v, t);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(gn).connect(c.destination);
      o.start(t); o.stop(t + d + 0.01);
    } catch {}
  }, []);
  const buzz = useCallback((p) => {
    if (!live.current.haptics) return;
    try { navigator.vibrate && navigator.vibrate(p); } catch {}
  }, []);

  /* ---------- knob spring ---------- */
  const sp = useRef({ s: 1, vs: 0, ts: 1, x: 0, vx: 0, tx: 0, y: 0, vy: 0, ty: 0 }).current;
  const raf = useRef(0);
  const step = useCallback(() => {
    const k = 560, d = 26, dt = 1 / 60;
    for (const [p, v, t] of [["s", "vs", "ts"], ["x", "vx", "tx"], ["y", "vy", "ty"]]) {
      sp[v] += (-k * (sp[p] - sp[t]) - d * sp[v]) * dt;
      sp[p] += sp[v] * dt;
    }
    const B = btnRef.current?.style;
    if (B) {
      const nx = sp.x / JR, ny = sp.y / JR;
      B.setProperty("--s", sp.s.toFixed(4));
      B.setProperty("--kx", sp.x.toFixed(2) + "px");
      B.setProperty("--ky", sp.y.toFixed(2) + "px");
      B.setProperty("--rx", (-ny * 18).toFixed(2) + "deg");
      B.setProperty("--ry", (nx * 18).toFixed(2) + "deg");
      B.setProperty("--hx", (35 - nx * 20).toFixed(1) + "%");
      B.setProperty("--hy", (28 - ny * 20).toFixed(1) + "%");
      B.setProperty("--gx", (16 - nx * 12).toFixed(1) + "%");
      B.setProperty("--gy", (9 - ny * 12).toFixed(1) + "%");
      B.setProperty("--shx", (-sp.x * 0.35).toFixed(2) + "px");
      B.setProperty("--shy", (9 - sp.y * 0.35).toFixed(2) + "px");
    }
    const rest = Math.abs(sp.s - sp.ts) + Math.abs(sp.vs) + Math.abs(sp.x - sp.tx) + Math.abs(sp.vx) + Math.abs(sp.y - sp.ty) + Math.abs(sp.vy) < 0.001;
    raf.current = rest ? 0 : requestAnimationFrame(step);
  }, [sp]);
  const kick = () => { if (!raf.current) raf.current = requestAnimationFrame(step); };
  const scaleTo = (s) => { sp.ts = s; kick(); };
  const knobSet = (x, y) => { sp.x = sp.tx = x; sp.y = sp.ty = y; sp.vx = sp.vy = 0; kick(); };
  const knobHome = () => { sp.tx = 0; sp.ty = 0; kick(); };

  /* ---------- dock position ---------- */
  const cls = (add, ...c) => dockRef.current?.classList[add ? "add" : "remove"](...c);
  const clampPos = (p) => ({
    x: Math.min(window.innerWidth - EDGE, Math.max(EDGE, p.x)),
    y: Math.min(window.innerHeight - EDGE, Math.max(EDGE + 40, p.y)),
  });
  const place = (glide) => {
    const el = dockRef.current; if (!el) return;
    el.classList.toggle("bc-glide", !!glide);
    el.style.transform = `translate(${g.pos.x}px,${g.pos.y}px)`;
  };
  const savePos = () => { try { localStorage.setItem(storageKey, JSON.stringify(g.pos)); } catch {} };

  useLayoutEffect(() => {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(storageKey)); } catch {}
    if (!p || typeof p.x !== "number") p = live.current.home();
    g.pos = clampPos(p);
    place(false);
    const onResize = () => { g.pos = clampPos(g.pos); place(true); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  /* ---------- infinite dial ---------- */
  const sc = useRef({ v: 0, raf: 0, last: 0, lastRound: 0, edgeDir: 0, target: null, wheelT: 0 }).current;

  const setActive = (s) => {
    if (s === live.current.active) return;
    live.current.active = s;
    setActiveState(s);
    if (s !== null) { tick(700 + mod(s, live.current.actions.length) * 40, 0.03, 0.05); buzz(6); }
  };
  const updateSelect = () => {
    if (g.mode !== "select" || g.selRel === null) return;
    setActive(Math.abs(g.selRel) < HALF + 0.2 ? Math.round(g.scroll + g.selRel / STEP) : null);
  };
  const setScroll = (v) => {
    g.scroll = v;
    setScrollState(v);
    const r = Math.round(v);
    if (r !== sc.lastRound) {           // detent click every time a button passes the focus point
      sc.lastRound = r;
      if (live.current.open) { tick(560 + mod(r, live.current.actions.length) * 24, 0.018, 0.03); buzz(3); }
    }
    updateSelect();
  };
  const scrollLoop = (t) => {
    const dt = sc.last ? Math.min(0.05, (t - sc.last) / 1000) : 1 / 60;
    sc.last = t;
    let s = g.scroll;
    if (sc.edgeDir) { s += sc.edgeDir * dt * 4.5; sc.v = 0; }                    // auto-spin at arc ends
    else if (Math.abs(sc.v) > 1.2 && sc.target === null) { s += sc.v * dt; sc.v *= Math.pow(0.03, dt); } // momentum
    else {                                                                        // snap to detent
      sc.v = 0;
      const tgt = sc.target ?? Math.round(s);
      s += (tgt - s) * Math.min(1, dt * 16);
      if (Math.abs(tgt - s) < 0.002) {
        sc.target = null; sc.raf = 0; sc.last = 0;
        setScroll(tgt); cls(false, "bc-scrolling");
        return;
      }
    }
    setScroll(s);
    sc.raf = requestAnimationFrame(scrollLoop);
  };
  const animateScroll = () => {
    cls(true, "bc-scrolling");
    if (!sc.raf) { sc.last = 0; sc.raf = requestAnimationFrame(scrollLoop); }
  };
  const stopScroll = () => { cancelAnimationFrame(sc.raf); sc.raf = 0; sc.last = 0; sc.v = 0; sc.target = null; };
  const nudge = (dir) => { sc.v = 0; sc.target = Math.round(sc.target ?? g.scroll) + dir; animateScroll(); };
  const wheelBy = (delta) => {
    stopScroll(); cls(true, "bc-scrolling");
    setScroll(g.scroll + delta / 90);
    clearTimeout(sc.wheelT);
    sc.wheelT = setTimeout(animateScroll, 110);
  };

  useEffect(() => () => { cancelAnimationFrame(raf.current); cancelAnimationFrame(sc.raf); clearTimeout(sc.wheelT); }, [sc]);

  /* ---------- menu ---------- */
  const setOpen = (v) => {
    if (live.current.open === v) return;
    live.current.open = v;
    if (v) {
      const { innerWidth: w, innerHeight: h } = window;
      let c = Math.atan2(h / 2 - g.pos.y, w / 2 - g.pos.x);   // fan opens toward screen center
      if (Math.hypot(w / 2 - g.pos.x, h / 2 - g.pos.y) < 80) c = -Math.PI / 2;
      g.center = c; setCenter(c);
    } else {
      sc.edgeDir = 0;
    }
    setOpenState(v);
    if (v) { tick(380, 0.06, 0.05); buzz(10); }
    else { setActive(null); tick(240, 0.05, 0.035); }
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
    let on;
    if (a.toggle) {
      on = !live.current.toggles[a.id];
      setToggles((t) => ({ ...t, [a.id]: on }));
      if (a.id === "sound") soundRef.current = on;
    }
    tick(880, 0.05, 0.07); setTimeout(() => tick(1320, 0.06, 0.05), 55); buzz([8, 30, 14]);
    setOpen(false);
    scaleTo(1.12); setTimeout(() => scaleTo(1), 90);
    if (a.id === "home") { g.pos = clampPos(live.current.home()); place(true); savePos(); }
    live.current.onAction?.(a.id, on);
  };

  /* ---------- joystick output ---------- */
  const emitJoy = (x, y) => live.current.onJoystick?.({ x, y: -y, mag: Math.min(1, Math.hypot(x, y)) });

  /* ---------- logo gestures ----------
     press → move > DRAG_PX → joystick (or radial select if menu open)
     press → still for HOLD_MS → pick up & move
     press → quick release → toggle menu                                */
  const onPointerDown = (e) => {
    if (g.pid !== null) return;
    g.pid = e.pointerId;
    btnRef.current.setPointerCapture(g.pid);
    g.mode = "press"; g.sx = e.clientX; g.sy = e.clientY;
    g.offX = e.clientX - g.pos.x; g.offY = e.clientY - g.pos.y;
    cls(true, "bc-down"); scaleTo(0.96); tick(300, 0.03, 0.035);
    g.armT = setTimeout(() => cls(true, "bc-arming"), 140);
    g.liftT = setTimeout(() => {
      if (g.mode !== "press") return;
      g.mode = "move";
      cls(false, "bc-arming", "bc-down"); cls(true, "bc-lifted");
      if (live.current.open) setOpen(false);
      scaleTo(1.14); buzz(18); tick(200, 0.08, 0.06);
    }, HOLD_MS);
  };

  const onPointerMove = (e) => {
    if (e.pointerId !== g.pid) return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy, d = Math.hypot(dx, dy);
    if (g.mode === "press" && d > DRAG_PX) {
      clearTimeout(g.armT); clearTimeout(g.liftT); cls(false, "bc-arming");
      if (live.current.open) { g.mode = "select"; stopScroll(); }
      else { g.mode = "joy"; cls(true, "bc-joy"); scaleTo(1); buzz(5); }
    }
    if (g.mode === "joy") {
      const k = d > JR ? JR / d : 1, kx = dx * k, ky = dy * k;
      knobSet(kx, ky);
      emitJoy(kx / JR, ky / JR);
      const b = baseRef.current?.style;
      if (b) {
        b.setProperty("--ang", (Math.atan2(dx, -dy) * 180) / Math.PI + "deg");
        b.setProperty("--mag", Math.min(1, d / JR).toFixed(3));
      }
      const edge = d >= JR;
      if (edge && !g.atEdge) { buzz(4); tick(460, 0.025, 0.03); }
      g.atEdge = edge;
    } else if (g.mode === "move") {
      g.pos = { x: e.clientX - g.offX, y: e.clientY - g.offY };
      place(false);
    } else if (g.mode === "select") {
      knobSet(Math.max(-14, Math.min(14, dx * 0.2)), Math.max(-14, Math.min(14, dy * 0.2)));
      if (d < 36) { g.selRel = null; sc.edgeDir = 0; setActive(null); return; }
      const rel = wrap(Math.atan2(dy, dx) - g.center);
      g.selRel = rel;
      const atEnd = Math.abs(rel) > HALF - 0.14 && Math.abs(rel) < HALF + 0.6;
      const dir = atEnd ? Math.sign(rel) : 0;
      if (dir !== sc.edgeDir) { sc.edgeDir = dir; if (dir) animateScroll(); else animateScroll(); }
      updateSelect();
    }
  };

  const onRelease = (e) => {
    if (e.pointerId !== g.pid) return;
    g.pid = null;
    clearTimeout(g.armT); clearTimeout(g.liftT); cls(false, "bc-arming");
    if (g.mode === "press") setOpen(!live.current.open);
    else if (g.mode === "joy") { cls(false, "bc-joy"); emitJoy(0, 0); g.atEdge = false; }
    else if (g.mode === "move") { cls(false, "bc-lifted"); g.pos = clampPos(g.pos); place(true); savePos(); buzz(10); tick(320, 0.05, 0.05); }
    else if (g.mode === "select") {
      sc.edgeDir = 0; g.selRel = null;
      const s = live.current.active;
      if (s !== null) fire(mod(s, live.current.actions.length)); else setOpen(false);
      animateScroll();
    }
    g.mode = "idle"; cls(false, "bc-down"); knobHome(); scaleTo(1);
  };

  /* ---------- dial gestures (swipe along the ring, tap a button) ---------- */
  const wd = useRef({ pid: null }).current;
  const polar = (e) => {
    const dx = e.clientX - g.pos.x, dy = e.clientY - g.pos.y;
    return { ang: Math.atan2(dy, dx), d: Math.hypot(dx, dy) };
  };
  const onWheelDown = (e) => {
    if (!live.current.open || wd.pid !== null) return;
    wd.pid = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = polar(e);
    Object.assign(wd, {
      prev: p.ang, acc: 0, s0: g.scroll, x0: e.clientX, y0: e.clientY, drag: false, d0: p.d, t: performance.now(), v: 0,
      slot: e.target.closest?.("[data-slot]")?.dataset.slot ?? null,
    });
    stopScroll();
  };
  const onWheelMove = (e) => {
    if (e.pointerId !== wd.pid) return;
    if (!wd.drag && Math.hypot(e.clientX - wd.x0, e.clientY - wd.y0) > 6) { wd.drag = true; cls(true, "bc-scrolling"); }
    if (!wd.drag) return;
    const p = polar(e), now = performance.now();
    const da = wrap(p.ang - wd.prev);
    wd.prev = p.ang; wd.acc += da;
    const dt = Math.max(1, now - wd.t) / 1000; wd.t = now;
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
    const idle = performance.now() - wd.t > 80;     // finger stopped before lifting → no fling
    sc.v = idle ? 0 : Math.max(-22, Math.min(22, wd.v));
    animateScroll();
  };

  // mouse wheel / trackpad over the controller spins the dial (non-passive so the page doesn't scroll)
  useEffect(() => {
    const el = dockRef.current; if (!el) return;
    const onWheel = (e) => {
      if (!live.current.open) return;
      e.preventDefault();
      wheelBy(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
      if (!live.current.open) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); nudge(1); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); nudge(-1); }
      if (e.key === "Enter" && document.activeElement === btnRef.current) {
        e.preventDefault(); fire(mod(Math.round(g.scroll), live.current.actions.length));
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
    <div className={`bc-root${open ? " bc-open" : ""}${active !== null ? " bc-picking" : ""}`}>
      <style>{CSS}</style>
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
          <svg className="bc-track" viewBox={`0 0 ${WH * 2} ${WH * 2}`} aria-hidden="true">
            <path className="bc-band" d={arcPath(MENU_R, center - HALF - trackPad, center + HALF + trackPad)} />
            <path className="bc-rail" d={arcPath(MENU_R + 38, center - HALF, center + HALF)} />
            <circle className="bc-thumb" cx={WH + (MENU_R + 38) * Math.cos(thumbAng)} cy={WH + (MENU_R + 38) * Math.sin(thumbAng)} r="2.5" />
          </svg>

          {slots.map((s) => {
            const i = mod(s, n), a = actions[i];
            const off = (s - scroll) * STEP;
            const ang = center + off, cx = Math.cos(ang), sy = Math.sin(ang);
            const ad = Math.abs(off);
            const o = ad <= HALF ? 1 : Math.max(0, 1 - (ad - HALF) / (STEP * 0.8));
            const k = 1 - Math.min(1, ad / (HALF + STEP)) * 0.3;
            return (
              <button
                key={s}
                data-slot={s}
                className={`bc-item${active === s ? " bc-active" : ""}${s === focusSlot ? " bc-focus" : ""}${a.toggle && toggles[a.id] ? " bc-on" : ""}`}
                aria-label={a.label}
                tabIndex={open && o > 0.5 ? 0 : -1}
                onClick={(e) => { if (e.detail === 0) fire(i); }}   // keyboard only; pointer taps go through the wheel
                style={{
                  "--x": `${(cx * MENU_R).toFixed(1)}px`,
                  "--y": `${(sy * MENU_R).toFixed(1)}px`,
                  "--lx": `${(cx * 44).toFixed(1)}px`,
                  "--ly": `${(sy * 44).toFixed(1)}px`,
                  "--o": o.toFixed(3),
                  "--k": k.toFixed(3),
                  pointerEvents: open && o > 0.3 ? "auto" : "none",
                  transitionDelay: open ? `${Math.abs(s - focusSlot) * 26}ms` : "0ms",
                }}
              >
                <svg viewBox="0 0 24 24">{a.icon}</svg>
                <span className="bc-label">{a.label}</span>
              </button>
            );
          })}
        </div>

        <button
          ref={btnRef}
          className="bc-btn"
          aria-label="Controller: drag to steer, tap for menu, hold to move"
          aria-expanded={open}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onRelease}
          onPointerCancel={onRelease}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => { if (e.detail === 0) setOpen(!live.current.open); }}
        >
          <span className="bc-cshadow" />
          <span className="bc-glow" />
          <span className="bc-cap" />
          <svg className="bc-ring" viewBox="0 0 84 84"><circle cx="42" cy="42" r="41" /></svg>
          <svg className="bc-logo" viewBox="0 0 153 170" aria-hidden="true">
            <defs>
              <linearGradient id="bc-logo-g" x1="0" y1="85" x2="152" y2="85" gradientUnits="userSpaceOnUse">
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

const CSS = `
@property --pz{syntax:'<length>';inherits:true;initial-value:0px}
.bc-root{--bc-panel:#151a2e;--bc-fg:#f3ead8;--bc-red-1:#7c1414;--bc-red-2:#e22424;--bc-cream:#f3ead8;--bc-ink:#1d1a16;--bc-line:rgba(255,255,255,.12);
  --bc-spring:cubic-bezier(.34,1.56,.64,1);--bc-out:cubic-bezier(.22,1,.36,1);
  font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.bc-scrim{position:fixed;inset:0;background:rgba(6,8,18,.35);opacity:0;pointer-events:none;transition:opacity .25s var(--bc-out);z-index:50}
.bc-open .bc-scrim{opacity:1;pointer-events:auto}
.bc-dock{position:fixed;left:0;top:0;width:0;height:0;z-index:51;will-change:transform}
.bc-dock.bc-glide{transition:transform .55s var(--bc-spring)}

/* joystick gate */
.bc-base{position:absolute;left:-60px;top:-60px;width:120px;height:120px;border-radius:50%;pointer-events:none;
  background:rgba(13,16,32,.16);box-shadow:inset 0 0 0 1px rgba(243,234,216,.03);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
  opacity:0;transform:scale(.74);transition:transform .5s var(--bc-spring),opacity .2s}
.bc-joy .bc-base{opacity:1;transform:scale(1)}
.bc-lifted .bc-base{opacity:0;transform:scale(.6)}
.bc-ticks{position:absolute;inset:0;border-radius:50%;opacity:0;transition:opacity .3s;
  background:repeating-conic-gradient(rgba(243,234,216,.06) 0 1.1deg,transparent 1.1deg 15deg);
  -webkit-mask:radial-gradient(circle,transparent 0 50px,#000 51px 55px,transparent 56px);mask:radial-gradient(circle,transparent 0 50px,#000 51px 55px,transparent 56px)}
.bc-joy .bc-ticks{opacity:1}
.bc-arc{position:absolute;inset:0;border-radius:50%;opacity:var(--mag,0);
  background:conic-gradient(from calc(var(--ang,0deg) - 45deg),transparent 0deg,rgba(255,70,70,1) 45deg,transparent 90deg);
  -webkit-mask:radial-gradient(circle,transparent 0 50px,#000 51px 57px,transparent 58px);mask:radial-gradient(circle,transparent 0 50px,#000 51px 57px,transparent 58px);
  filter:drop-shadow(0 0 6px rgba(226,36,36,.9))}

/* logo knob */
.bc-btn{position:absolute;left:-36px;top:-36px;width:72px;height:72px;border-radius:50%;border:0;padding:0;cursor:grab;touch-action:none;outline:none;
  background:none;perspective:240px;display:grid;place-items:center;
  transform:translate(var(--kx,0px),var(--ky,0px)) scale(var(--s,1));transition:--pz .14s var(--bc-out)}
.bc-down .bc-btn{--pz:3px}
.bc-lifted .bc-btn{cursor:grabbing}
.bc-cshadow{position:absolute;inset:14px;border-radius:50%;background:rgba(0,0,0,.35);filter:blur(10px);pointer-events:none;
  transform:translate(var(--shx,0px),calc(var(--shy,9px) - var(--pz)));transition:opacity .2s}
.bc-lifted .bc-cshadow{--shy:26px;opacity:.75}
.bc-cap{position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at var(--hx,35%) var(--hy,28%),rgba(255,255,255,.10) 0%,rgba(255,255,255,.025) 55%,rgba(255,255,255,0) 100%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  transform:translateY(var(--pz)) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))}
.bc-cap::after{content:"";position:absolute;left:var(--gx,16%);top:var(--gy,9%);width:44%;height:28%;border-radius:50%;
  background:radial-gradient(ellipse,rgba(255,255,255,.14),rgba(255,255,255,0) 70%);transform:rotate(-24deg)}
.bc-btn:focus-visible .bc-cap{box-shadow:0 0 0 3px var(--bc-red-2)}
.bc-lifted .bc-cap{box-shadow:0 0 0 1px rgba(243,234,216,.5)}
.bc-logo{position:relative;z-index:1;width:32px;height:36px;pointer-events:none;
  transform:translateY(var(--pz)) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:rotate .45s var(--bc-spring),scale .45s var(--bc-spring);
  filter:drop-shadow(0 6px 8px rgba(0,0,0,.45)) drop-shadow(0 0 14px rgba(226,36,36,.28))}
.bc-open .bc-logo{rotate:-12deg;scale:.9}
.bc-glow{position:absolute;inset:-14px;border-radius:50%;background:radial-gradient(circle,rgba(226,36,36,.45),transparent 65%);opacity:0;transition:opacity .25s;pointer-events:none}
.bc-open .bc-glow,.bc-joy .bc-glow{opacity:1}
.bc-ring{position:absolute;inset:-6px;width:84px;height:84px;pointer-events:none;transform:rotate(-90deg)}
.bc-ring circle{fill:none;stroke:var(--bc-cream);stroke-width:2.5;stroke-linecap:round;stroke-dasharray:258;stroke-dashoffset:258;opacity:0;transition:opacity .1s}
.bc-arming .bc-ring circle{opacity:1;stroke-dashoffset:0;transition:stroke-dashoffset .28s linear,opacity .1s}
.bc-ripple{position:absolute;left:-36px;top:-36px;width:72px;height:72px;border-radius:50%;border:2px solid var(--bc-red-2);pointer-events:none;animation:bc-rip .55s var(--bc-out) forwards}
@keyframes bc-rip{from{transform:scale(1);opacity:.9}to{transform:scale(2.2);opacity:0}}

/* infinite dial */
.bc-wheel{position:absolute;left:-${WH}px;top:-${WH}px;width:${WH * 2}px;height:${WH * 2}px;pointer-events:none;touch-action:none}
.bc-open .bc-wheel{pointer-events:auto}
.bc-track{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;opacity:0;transition:opacity .25s var(--bc-out)}
.bc-open .bc-track{opacity:1}
.bc-band{fill:none;stroke:rgba(13,16,32,.38);stroke-width:66;stroke-linecap:round}
.bc-rail{fill:none;stroke:rgba(243,234,216,.07);stroke-width:1}
.bc-thumb{fill:rgba(243,234,216,.55)}

.bc-item{position:absolute;left:calc(50% - 27px);top:calc(50% - 27px);width:54px;height:54px;border-radius:50%;border:0;padding:0;cursor:pointer;
  background:var(--bc-panel);color:var(--bc-fg);box-shadow:0 0 0 1px var(--bc-line),0 10px 24px rgba(0,0,0,.45);
  display:grid;place-items:center;opacity:0;pointer-events:none;
  transform:translate(0,0) scale(.3);transition:transform .4s var(--bc-spring),opacity .18s,background .15s}
.bc-item svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.bc-open .bc-item{opacity:var(--o,1);transform:translate(var(--x),var(--y)) scale(var(--k,1))}
.bc-open .bc-item.bc-focus{transform:translate(var(--x),var(--y)) scale(calc(var(--k,1) * 1.08));box-shadow:0 0 0 1px rgba(243,234,216,.28),0 12px 28px rgba(0,0,0,.5)}
.bc-open .bc-item.bc-active{background:linear-gradient(135deg,var(--bc-red-1),var(--bc-red-2));transform:translate(calc(var(--x)*1.1),calc(var(--y)*1.1)) scale(1.18)}
.bc-scrolling .bc-item{transition:background .15s;transition-delay:0ms!important}
.bc-item.bc-on::before{content:"";position:absolute;top:6px;right:8px;width:6px;height:6px;border-radius:50%;background:var(--bc-red-2);box-shadow:0 0 0 2px var(--bc-panel)}
.bc-item:focus-visible{box-shadow:0 0 0 3px var(--bc-fg)}
.bc-label{position:absolute;left:50%;top:50%;white-space:nowrap;font-size:10px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--bc-fg);background:rgba(13,16,32,.8);padding:3px 6px;border-radius:5px;pointer-events:none;opacity:0;
  transform:translate(calc(-50% + var(--lx)),calc(-50% + var(--ly)));transition:opacity .15s}
.bc-focus .bc-label,.bc-active .bc-label{opacity:1}
.bc-picking .bc-item:not(.bc-active) .bc-label{opacity:0}
.bc-item.bc-active .bc-label{background:var(--bc-cream);color:var(--bc-ink)}

@media (prefers-reduced-motion:reduce){.bc-root *{transition-duration:.01ms!important;animation-duration:.01ms!important}}
`;
