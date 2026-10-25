import type { ArrangedBook } from "../components/shelves/shelfArrangement.ts";
import {
	arrangedBookPose,
	arrangeShelfBooks,
	shelfArcFraction,
} from "../components/shelves/shelfArrangement.ts";
import type { ShelfBook } from "../components/shelves/shelfBooks";
import type { ShelfDocument } from "../lib/shelfModel";
import { landingDelay } from "./flight.ts";
import { BEATS, JOURNEY_SECONDS } from "./journey.ts";

export type OnboardingAnswers = {
	rhythm: string;
	identity: string;
};

/** Catalog titles that actually have covers. Quiet, short, reflective. */
const CALM = [
	"seneca",
	"the daily stoic",
	"stilness is the key",
	"discipline is destiny",
	"shaolin spirit",
	"a course in miracles",
	"four thousand weeks",
];

/** A set time, kept as a mild boost. Card 4 decides the set that actually flies. */
const STEADY = [
	"the daily stoic",
	"discipline is destiny",
	"four thousand weeks",
	"traction",
	"empowered",
	"how big things get done",
	"be useful",
	"shaolin spirit",
];

/** Curious: wider, less devotional. */
const CURIOUS = [
	"behave",
	"small data",
	"the source",
	"what's your dream?",
	"mit liv med fangekoret",
	"blitzscaling",
	"how big things get done",
	"be useful",
];

const DEFAULT = [
	"seneca",
	"the daily stoic",
	"behave",
	"stilness is the key",
	"small data",
	"what's your dream?",
	"four thousand weeks",
	"shaolin spirit",
];

const MAX_BOOKS = 9;

/**
 * Shelves sit on the beats where the camera actually stops. The curve is ~2000
 * units long, so a shelf even 0.08 ahead is hundreds of units out of frame.
 */
export const LANDING_STATIONS = BEATS.map((beat) => ({
	t: beat.t,
	side: beat.side,
}));

/** Card 4. One book is a short calm set. A few at once opens the wider shelf. */
function bookLimit(answers: OnboardingAnswers) {
	if (answers.identity === "One book at a time") return 5;
	if (answers.identity === "A few at once") return MAX_BOOKS;
	return 8;
}

function score(title: string, answers: OnboardingAnswers) {
	const name = title.toLowerCase();
	if (!answers.rhythm && !answers.identity) {
		const index = DEFAULT.indexOf(name);
		return index === -1 ? 0 : DEFAULT.length - index;
	}
	const one = answers.identity === "One book at a time";
	const many = answers.identity === "A few at once";
	// A focused reader does not pick up the wide, restless titles.
	if (one && CURIOUS.includes(name) && !CALM.includes(name)) return 0;
	let value = 0;
	if (one && CALM.includes(name)) value += 4;
	if (many && (CURIOUS.includes(name) || STEADY.includes(name))) value += 3;
	if (answers.rhythm === "Whenever I can" && CALM.includes(name)) value += 1;
	if (answers.rhythm === "At a set time" && STEADY.includes(name)) value += 1;
	return value;
}

export function selectOnboardingBooks<
	T extends { title: string; pages: number },
>(catalog: readonly T[], answers: OnboardingAnswers) {
	return catalog
		.map((book) => ({ book, score: score(book.title, answers) }))
		.filter((entry) => entry.score > 0)
		.sort(
			(a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title),
		)
		.slice(0, bookLimit(answers))
		.map((entry) => entry.book);
}

function singleRow(group: ShelfBook[]): ShelfDocument {
	const items: ShelfDocument["items"] = {};
	const order: string[] = [];
	for (const book of group) {
		items[book.id] = { shelf: 1, layout: "upright", angle: 0, face: "cover" };
		order.push(book.id);
	}
	return {
		items,
		order,
		stacks: [],
		groups: [],
		spacing: 0.1,
		alignment: "center",
	};
}

function splitEven<T>(items: readonly T[], parts: number) {
	const chunks: T[][] = [];
	let cursor = 0;
	for (let index = 0; index < parts; index += 1) {
		const size = Math.ceil((items.length - cursor) / (parts - index));
		chunks.push(items.slice(cursor, cursor + size));
		cursor += size;
	}
	return chunks;
}

export type LandingPlan = {
	t: number;
	side: number;
	placements: ArrangedBook[];
	delays: Record<string, number>;
	arc: number;
};

export function planLandings(
	catalog: readonly ShelfBook[],
	answers: OnboardingAnswers,
): LandingPlan[] {
	const selected = selectOnboardingBooks(catalog, answers);
	if (!selected.length) return [];
	const chunks = splitEven(selected, LANDING_STATIONS.length);
	return LANDING_STATIONS.flatMap((station, index) => {
		const group = chunks[index] ?? [];
		if (!group.length) return [];
		const document = singleRow(group);
		const arc = Math.min(
			0.42,
			Math.max(0.14, shelfArcFraction(group, document, 0.16)),
		);
		const placements = arrangeShelfBooks(group, document, arc);
		const delays: Record<string, number> = {};
		placements.forEach((placement, bookIndex) => {
			delays[placement.book.id] = landingDelay(
				station.t,
				bookIndex,
				JOURNEY_SECONDS,
			);
		});
		return [{ ...station, placements, delays, arc }];
	});
}

export type SettledPose = {
	id: string;
	position: [number, number, number];
	quaternion: [number, number, number, number];
	scale: [number, number, number];
	delay: number;
};

/**
 * `arrangedBookPose` includes the library shelf's yaw and drop. Recentering on
 * the cluster keeps that arrangement and puts it in front of the camera,
 * instead of 7 units out on the big shelf radius where it would read as a speck.
 */
export function settlePoses(
	placements: readonly ArrangedBook[],
	delays: Record<string, number>,
	scale = 1.55,
): SettledPose[] {
	if (!placements.length) return [];
	const posed = placements.map((placement) => arrangedBookPose(placement));
	const center = [0, 0, 0];
	for (const pose of posed) {
		center[0] += pose.position[0];
		center[1] += pose.position[1];
		center[2] += pose.position[2];
	}
	center[0] /= posed.length;
	center[1] /= posed.length;
	center[2] /= posed.length;
	return placements.map((placement, index) => {
		const pose = posed[index];
		const [w, h, d] = placement.book.dimensions;
		return {
			id: placement.book.id,
			position: [
				(pose.position[0] - center[0]) * scale,
				(pose.position[1] - center[1]) * scale,
				(pose.position[2] - center[2]) * scale,
			],
			quaternion: [
				pose.quaternion[0],
				pose.quaternion[1],
				pose.quaternion[2],
				pose.quaternion[3],
			],
			scale: [
				w * placement.scale * scale,
				h * placement.scale * scale,
				d * placement.scale * scale,
			],
			delay: delays[placement.book.id] ?? 0,
		};
	});
}

export function plankFor(poses: readonly SettledPose[]) {
	let minY = 0;
	let halfWidth = 0.4;
	let depth = 0.28;
	for (const pose of poses) {
		minY = Math.min(minY, pose.position[1] - pose.scale[1] / 2);
		halfWidth = Math.max(
			halfWidth,
			Math.abs(pose.position[0]) + pose.scale[0] / 2,
		);
		depth = Math.max(depth, Math.abs(pose.position[2]) + pose.scale[2] / 2);
	}
	return {
		width: halfWidth * 2 + 0.28,
		height: 0.055,
		depth: Math.max(0.42, depth + 0.12),
		y: minY - 0.028,
	};
}
