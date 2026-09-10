import type { DemoId } from "../layout/demoScenes";

export type TourStage =
	| "library"
	| "pull"
	| "read"
	| "return"
	| "grow"
	| "privacy"
	| "delete"
	| "add"
	| "end";
export type BookPose = {
	position: [number, number, number];
	quaternion: [number, number, number, number];
};

export const tourStages: Record<
	TourStage,
	{ title: string; text: string; demo: DemoId; duration?: number }
> = {
	library: {
		title: "Every book has a story.",
		text: "Tap a cover, or let the demo pick one for you.",
		demo: "mobile-books",
		duration: 7,
	},
	pull: {
		title: "Take a closer look.",
		text: "From your shelf to your hands.",
		demo: "3DBook",
		duration: 2,
	},
	read: {
		title: "A little room to get lost.",
		text: "Read the book, turn a page, or pick another cover.",
		demo: "OpenBook",
		duration: 12,
	},
	return: {
		title: "Back on the shelf.",
		text: "A story to come back to.",
		demo: "mobile-books",
		duration: 1.8,
	},
	grow: {
		title: "Make room for more.",
		text: "Your shelves grow with your collection.",
		demo: "Shelflevels",
		duration: 18,
	},
	privacy: {
		title: "Some stories are just for you.",
		text: "Tap a book on the shelf to hide or reveal its cover.",
		demo: "Blur",
	},
	delete: {
		title: "Let one go.",
		text: "Delete a book and watch it disappear.",
		demo: "PerlinNoise",
	},
	add: {
		title: "A new story takes shape.",
		text: "Add books and watch the cover come together.",
		demo: "Particles",
	},
	end: {
		title: "Let’s make the next generation smarter than us!",
		text: "Tap another book, or play the whole demo again.",
		demo: "mobile-books",
	},
};

export const nextTourStage: Partial<Record<TourStage, TourStage>> = {
	pull: "read",
	read: "grow",
	grow: "privacy",
	privacy: "delete",
	delete: "add",
	add: "end",
};

export const tourChapters: { stage: TourStage; label: string }[] = [
	{ stage: "library", label: "Shelves" },
	{ stage: "read", label: "Read" },
	{ stage: "grow", label: "Grow" },
	{ stage: "privacy", label: "Blur" },
	{ stage: "delete", label: "Delete" },
	{ stage: "add", label: "Add" },
	{ stage: "end", label: "Replay" },
];
