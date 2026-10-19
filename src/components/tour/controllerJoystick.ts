export type ControllerJoystick = { x: number; y: number; mag: number };
/** What the joystick's vertical axis drives on the front page. */
export type ControllerJoystickMode = "look" | "zoom";

let current: ControllerJoystick = { x: 0, y: 0, mag: 0 };
let mode: ControllerJoystickMode = "look";

export function setControllerJoystick(input: ControllerJoystick) {
	current = input;
}

export function getControllerJoystick() {
	return current;
}

export function setControllerJoystickMode(next: ControllerJoystickMode) {
	mode = next;
}

export function getControllerJoystickMode() {
	return mode;
}
