/** Pointer steering is angular only: the viewer stays at the shelf's center. */
export function pointerTurnSpeed(x: number) {
	const edge = Math.max(0, Math.min(1, (Math.abs(x) - 0.35) / 0.65));
	return edge === 0 ? 0 : Math.sign(x) * edge * edge * 0.65;
}
export function stepCenterTurn(
	yaw: number,
	speed: number,
	wanted: number,
	delta: number,
) {
	const dt = Math.max(0, Math.min(delta, 0.05));
	const next = speed + (wanted - speed) * (1 - Math.exp(-dt * 5));
	return { yaw: yaw + next * dt, speed: Math.abs(next) < 0.0001 ? 0 : next };
}
