import type { ComponentType } from "react";
import CensoredBook from "../blur/CensoredBook";
import Book from "../book/book";
import Dissolve from "../dissolve/Dissolve";
import DissolveController from "../dissolve/DissolveController";
import BookPageSwiper from "../openbook/BookPageSwiper";
import OpenBook from "../openbook/OpenBook";
import Particles from "../particles/Particles";
import ParticlesController from "../particles/ParticlesController";
import LevelController from "../shelves/LevelController";
import { progressionConfig } from "../shelves/progressionConfig";
import Shelves from "../shelves/Shelves";

export type CameraView = "book" | "open-book" | "page" | "shelves";

type DemoScene = {
	Scene: ComponentType;
	Controller?: ComponentType;
	camera: CameraView;
	shelfLevel?: number;
	autoplay?: boolean;
};

const shelves: DemoScene = {
	Scene: Shelves,
	Controller: LevelController,
	camera: "shelves",
	shelfLevel: 1,
	autoplay: true,
};

const openBook: DemoScene = {
	Scene: OpenBook,
	Controller: BookPageSwiper,
	camera: "open-book",
};

export const DEMO_SCENES = {
	"3DBook": { Scene: Book, camera: "book" },
	OpenBook: openBook,
	"page-folding": openBook,
	"page-zoom-in": { ...openBook, camera: "page" },
	Shelflevels: shelves,
	"level-based-shelf": shelves,
	"level-four-shelves": { ...shelves, shelfLevel: 4, autoplay: false },
	"level-top-shelves": {
		...shelves,
		shelfLevel: progressionConfig.levels.length - 1,
		autoplay: false,
	},
	Particles: {
		Scene: Particles,
		Controller: ParticlesController,
		camera: "book",
	},
	PerlinNoise: {
		Scene: Dissolve,
		Controller: DissolveController,
		camera: "book",
	},
	Blur: { Scene: CensoredBook, camera: "book" },
} satisfies Record<string, DemoScene>;

export type DemoId = keyof typeof DEMO_SCENES;

export function isDemoId(id: string): id is DemoId {
	return Object.hasOwn(DEMO_SCENES, id);
}

export function getDemoScene(id: DemoId): DemoScene {
	return DEMO_SCENES[id];
}
