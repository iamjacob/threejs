import { Vector3 } from "three";

/** Jacob's presets. Values are sRGB 0..1, matching the V4 prototype (not THREE.Color). */
function hex(r: number, g: number, b: number) {
	return new Vector3(r / 255, g / 255, b / 255);
}

export const AURA_STYLES = {
	aurora: {
		colors: [
			hex(0, 245, 255),
			hex(78, 255, 104),
			hex(255, 35, 174),
			hex(174, 86, 255),
		],
		waveA: 3,
		waveB: 7,
		rings: 3,
		shape: 0,
	},
	chakra: {
		colors: [
			hex(255, 42, 135),
			hex(255, 216, 48),
			hex(0, 224, 255),
			hex(122, 255, 78),
		],
		waveA: 6,
		waveB: 12,
		rings: 4,
		shape: 1,
	},
	arcane: {
		colors: [
			hex(100, 78, 255),
			hex(248, 43, 255),
			hex(63, 236, 255),
			hex(255, 174, 46),
		],
		waveA: 5,
		waveB: 11,
		rings: 3,
		shape: 2,
	},
} as const;

export type AuraStyleName = keyof typeof AURA_STYLES;

export function isAuraStyle(value: unknown): value is AuraStyleName {
	return value === "aurora" || value === "chakra" || value === "arcane";
}
