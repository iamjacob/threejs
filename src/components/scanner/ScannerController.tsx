import { useEffect } from "react";
import BoooksController from "../layout/BoooksController";
import {
	getControllerJoystick,
	setControllerJoystick,
} from "../tour/controllerJoystick";
import "./scanner-controller.css";

export type ScannerControllerAction =
	| "capture"
	| "roll"
	| "cover"
	| "pages"
	| "details"
	| "size"
	| "new"
	| "shelf";

const ACTIONS = [
	{
		id: "capture",
		label: "Capture",
		icon: (
			<>
				<path d="M3 8h3l2-3h8l2 3h3v11H3z" />
				<circle cx="12" cy="13" r="3.5" />
			</>
		),
	},
	{
		id: "roll",
		label: "Camera roll",
		icon: (
			<>
				<rect x="3" y="3" width="18" height="18" rx="2" />
				<circle cx="9" cy="9" r="2" />
				<path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
			</>
		),
	},
	{
		id: "cover",
		label: "Cover & size",
		icon: <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3zM5 4v16M8 20h11" />,
	},
	{
		id: "pages",
		label: "Pages",
		icon: (
			<path d="M2 5h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H2zM22 5h-7a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h7z" />
		),
	},
	{
		id: "details",
		label: "Details",
		icon: <path d="M4 6h16M4 12h10M4 18h7" />,
	},
	{
		id: "size",
		label: "Size",
		icon: <path d="M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2" />,
	},
	{
		id: "new",
		label: "New book",
		icon: <path d="M12 5v14M5 12h14" />,
	},
	{
		id: "shelf",
		label: "To shelf",
		icon: <path d="M4 20h16M6 20V6M10 20V4M14 20l3-14 3 .7-3 13.3" />,
	},
];

/**
 * The Boooks controller, scoped to the scanner: its own remembered position
 * (bottom-right by default), scanner steps on the dial, and the joystick
 * spinning the live 3D book / turning pages.
 */
export default function ScannerController({
	onAction,
	onJoystick,
}: {
	onAction: (id: ScannerControllerAction) => void;
	onJoystick?: (input: { x: number; y: number; mag: number }) => void;
}) {
	// Make sure the shelf camera never sees stale scanner joystick input.
	useEffect(() => () => setControllerJoystick({ x: 0, y: 0, mag: 0 }), []);
	return (
		<div className="scanner-controller">
			<BoooksController
				actions={ACTIONS}
				storageKey="boooks-dock-scanner"
				home={() => ({
					x: window.innerWidth - 84,
					y: window.innerHeight - 128,
				})}
				onJoystick={(input: { x: number; y: number; mag: number }) => {
					setControllerJoystick(input);
					onJoystick?.(input);
				}}
				onAction={(id: string) => {
					if (id === "sound") return;
					onAction(id as ScannerControllerAction);
				}}
			/>
		</div>
	);
}

export { getControllerJoystick as getScannerJoystick };
