import type { ReactNode } from "react";

export const LOGO_D =
	"M129.636 69.2931C116.863 60.7237 102.441 57.3581 87.7081 59.4667C90.952 52.1272 92.5335 44.5985 92.3037 37.4754C91.8847 24.3509 85.3427 13.3215 73.8943 6.42809C59.3506 -2.33057 37.1837 -2.11431 21.1937 6.92819C7.63677 14.592 0.1757 27.311 0.1757 42.7603C0.1757 52.6949 0.0540583 134.361 0.013509 155.339L0 160.232C0 164.53 3.48723 168.112 7.78545 168.193L88.1947 169.815C88.7894 169.828 89.3841 169.828 89.9788 169.828C120.58 169.828 142.382 156.271 149.803 132.645C157.061 109.559 148.194 81.7417 129.636 69.2931ZM59.4993 70.442C58.8235 70.9151 58.4315 71.2124 58.3369 71.28C54.8902 73.9292 54.1874 78.7546 56.7555 82.2689C59.3236 85.7832 64.1355 86.5942 67.7038 84.1206C68.0552 83.8773 68.4066 83.6205 68.704 83.4043C73.1374 80.3901 96.4803 66.1978 120.783 82.4987C133.583 91.0816 139.8 111.437 134.651 127.873C129.379 144.674 113.552 153.92 90.0735 153.92C89.5598 153.92 89.0327 153.92 88.5326 153.906L15.9494 152.446V150.811C15.9899 124.562 16.0981 52.0866 16.0981 42.7468C16.0981 30.6225 23.1401 24.0941 29.0333 20.7555C40.1573 14.4704 55.931 14.1595 65.7034 20.0392C72.5697 24.1617 76.1651 30.2035 76.4219 37.9755C76.7868 49.3158 69.6502 62.9674 59.4993 70.442Z";

export type ControllerActionItem = {
	id: string;
	label: string;
	activeLabel?: string;
	toggle?: boolean;
	on?: boolean;
	icon: ReactNode;
	activeIcon?: ReactNode;
};

export type BoooksControllerProps = {
	actions?: ControllerActionItem[];
	onJoystick?: (input: { x: number; y: number; mag: number }) => void;
	onAction?: (id: string, on?: boolean) => void;
	activeToggles?: Record<string, boolean>;
	storageKey?: string;
	home?: () => { x: number; y: number };
	haptics?: boolean;
};

export const DEFAULT_ACTIONS: ControllerActionItem[] = [
	{
		id: "scan",
		label: "Scan a book",
		icon: (
			<>
				<path d="M3 8h3l2-3h8l2 3h3v11H3z" />
				<circle cx="12" cy="13" r="3.5" />
			</>
		),
	},
	{
		id: "play",
		label: "Play",
		activeLabel: "Pause",
		toggle: true,
		icon: <path d="M7 5v14l12-7z" />,
		activeIcon: (
			<>
				<rect x="6" y="5" width="4" height="14" rx="1" />
				<rect x="14" y="5" width="4" height="14" rx="1" />
			</>
		),
	},
	{
		id: "screenshot",
		label: "Screenshot",
		icon: (
			<>
				<path d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v2M16 20h2a2 2 0 0 0 2-2v-2" />
				<circle cx="12" cy="12" r="3.2" />
			</>
		),
	},
	{
		// Opens the real same-device People & messages page (/people).
		id: "chat",
		label: "People & messages",
		icon: <path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.3-4.6A8 8 0 1 1 21 12z" />,
	},
	{
		id: "timer",
		label: "Timer",
		icon: (
			<>
				<circle cx="12" cy="13" r="7" />
				<path d="M12 9v4l2.5 2M10 3h4" />
			</>
		),
	},
	{
		id: "jump",
		label: "Jump",
		icon: <path d="M12 19V7M7 11l5-5 5 5M6 21h12" />,
	},
	{
		id: "zoom",
		label: "Zoom stick",
		toggle: true,
		icon: (
			<>
				<circle cx="11" cy="11" r="7" />
				<path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
			</>
		),
	},
	{
		id: "cam",
		label: "Overview",
		toggle: true,
		icon: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
	},
	{
		id: "lamp",
		label: "Lamplight",
		toggle: true,
		icon: (
			<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
		),
	},
	{
		id: "home",
		label: "Re-dock",
		icon: (
			<>
				<circle cx="12" cy="12" r="8" />
				<circle cx="12" cy="12" r="2.5" />
				<path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
			</>
		),
	},
	{
		id: "shelf",
		label: "Shelf",
		icon: <path d="M4 20h16M6 20V6M10 20V4M14 20l3-14 3 .7-3 13.3" />,
	},
	{
		id: "quote",
		label: "Quotes",
		icon: <path d="M7 11h3v6H5v-4c0-3 1-5 4-6M16 11h3v6h-5v-4c0-3 1-5 4-6" />,
	},
	{
		// Cycles the 3D environment (library/castle/forest/zen). Was labelled "Map" before the real
		// map route existed; the action id stays "map" so existing behaviour is unchanged.
		id: "map",
		label: "Scenery",
		icon: (
			<>
				<path d="M3 19l6-9 4 6 3-4 5 7z" />
				<circle cx="16.5" cy="6.5" r="2" />
			</>
		),
	},
	{
		id: "go-map",
		label: "Open map",
		icon: (
			<>
				<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
			</>
		),
	},
];

/** Map route button back to the shelves (used by MAP_PLAY_ACTIONS). */
export const GO_SHELVES_ACTION: ControllerActionItem = {
	id: "go-shelves",
	label: "Shelves",
	icon: (
		<>
			<path d="M4 20h16M4 4h16M4 12h16" />
			<path d="M7 4v8M10 6v6M14 12v8M17 14v6" />
		</>
	),
};

export const JR = 44; // joystick travel radius (px)
export const MENU_R = 96; // radial menu radius
export const SPREAD = (150 * Math.PI) / 180; // visible arc
export const HALF = SPREAD / 2;
export const STEP = SPREAD / 4; // angle between buttons (5 fully visible)
export const VIS = 3; // slots rendered each side of focus
export const WH = MENU_R + 60; // wheel layer half-size
export const EDGE = 56; // min distance from viewport edge
export const HOLD_MS = 420; // long-press to pick up
export const DRAG_PX = 7; // movement before joystick engages

export const mod = (a: number, n: number) => ((a % n) + n) % n;
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const arcPath = (r: number, a0: number, a1: number) => {
	const x0 = WH + r * Math.cos(a0);
	const y0 = WH + r * Math.sin(a0);
	const x1 = WH + r * Math.cos(a1);
	const y1 = WH + r * Math.sin(a1);
	return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

export const defaultHome = () => ({
	x: Math.max(EDGE + 20, Math.min(110, window.innerWidth * 0.22)),
	y: window.innerHeight - 120,
});
