export type ControllerJoystick = { x: number; y: number; mag: number };

let current: ControllerJoystick = { x: 0, y: 0, mag: 0 };

export function setControllerJoystick(input: ControllerJoystick) {
	current = input;
}

export function getControllerJoystick() {
	return current;
}
