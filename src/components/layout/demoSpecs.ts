import type { DemoId } from "./demoScenes";

export type SpecsId = DemoId | "Boooks";
type DemoSpecs = {
	title: string;
	description: string;
	values: [string, string][];
	needs: string;
	enhancements: string[];
	hint: string;
};

const book: DemoSpecs = {
	title: "3D Book",
	description: "The base book component shared by the visual experiments.",
	values: [
		["Geometry", "Three.js BoxGeometry · 0.7 × 1 × 0.1 units"],
		["Material", "MeshStandardMaterial with a matte PBR cover"],
		[
			"Textures",
			"Six material slots: front, back, spine, fore edge, top and bottom. Loaded with drei useTexture in sRGB.",
		],
	],
	needs:
		"Cover artwork for front, back and spine, page-edge textures, and the book's dimensions.",
	enhancements: [
		"Load dimensions and all cover assets from real book metadata.",
		"Add rounded cover edges and a curved spine for a more physical silhouette.",
	],
	hint: "Drag to orbit. Pinch or scroll to zoom.",
};

const openBook: DemoSpecs = {
	title: "Open Book",
	description:
		"A hinged book with individually modeled pages and live PDF content.",
	values: [
		["Geometry", "120 thin page meshes, two covers and a spine"],
		[
			"Animation",
			"GSAP timelines rotate rigid page hinges for opening, closing and page turns.",
		],
		[
			"PDF loader",
			"usePDFToImage uses PDF.js and its worker to rasterize pages on demand, with a 12-page image cache.",
		],
		[
			"Page surface",
			"PDF canvas → WebP image → Three.js texture on the current page",
		],
	],
	needs:
		"A PDF, front/back/spine artwork, book dimensions, and accessible PDF.js worker files.",
	enhancements: [
		"Add a page-curl vertex shader on subdivided pages, driven by GSAP during opening, closing and page turns.",
		"Render both sides of each page, prefetch nearby pages, and derive the modeled page count from the PDF.",
	],
	hint: "Scroll or drag the page wheel to turn pages. Drag the book to orbit.",
};

const shelves: DemoSpecs = {
	title: "Shelf + levels",
	description: "A procedural shelf system built from fractions of a circle.",
	values: [
		[
			"Construction",
			"Three.js Shape arcs become ExtrudeGeometry. Each shelf fraction grows from a short arc to a full ring.",
		],
		[
			"Progression",
			"A level configuration maps book-count milestones to four shelf fractions; Zustand stores the active level.",
		],
		[
			"Animation",
			"GSAP tweens the fractions with a small stagger. The autoplay tour also reframes the camera.",
		],
		[
			"Material",
			"Wood color, normal and roughness maps loaded with TextureLoader",
		],
	],
	needs:
		"Level thresholds, shelf fractions and wood textures. PDF loading currently belongs to Open Book; the shelves are not yet populated with books.",
	enhancements: [
		"Place real books along each arc using their widths, then connect selection to Open Book and its PDF loader.",
		"Reuse geometry or deform it on the GPU during growth, and instance repeated books for larger collections.",
	],
	hint: "Play the tour or change levels manually. Dragging the camera pauses the tour.",
};

export const DEMO_SPECS: Record<SpecsId, DemoSpecs> = {
	Boooks: {
		title: "Boooks R3F!",
		description:
			"An interactive collection of book and shelf components, with notes on how each experiment is made.",
		values: [
			["Rendering", "Three.js + React Three Fiber + drei"],
			["Motion", "GSAP timelines and GPU shaders"],
			["State", "Zustand stores connect the canvas and its outside controls."],
		],
		needs:
			"Book cover assets, PDFs for readable pages, and a WebGL-capable browser.",
		enhancements: [
			"Connect the experiments to one real book collection and a shared asset-loading flow.",
		],
		hint: "Choose a component, then open Specs for its construction, required inputs and proposed improvements.",
	},
	"3DBook": book,
	OpenBook: openBook,
	"page-folding": { ...openBook, title: "Page folding" },
	"page-zoom-in": {
		...openBook,
		title: "Page zoom in",
		description:
			"The Open Book component with a closer camera preset for inspecting PDF pages.",
	},
	Shelflevels: shelves,
	"level-based-shelf": { ...shelves, title: "Growing shelves" },
	"level-four-shelves": {
		...shelves,
		title: "Level 4 shelves",
		description:
			"The four-shelf preset: 16 books unlock four arcs, each covering 8% of a circle.",
	},
	"level-top-shelves": {
		...shelves,
		title: "360° shelves",
		description:
			"The 200-book milestone expands all four fractional shelves into complete rings.",
	},
	Particles: {
		title: "Add book · Particles",
		description:
			"A GPU particle cloud assembles the actual pixels of all six book faces.",
		values: [
			[
				"Pixel source",
				"The same six loaded textures as the finished book; sampled at UV cell centers with texture transforms and sRGB conversion.",
			],
			[
				"Face mapping",
				"Positions and normals come from BoxGeometry UVs, preserving the front, back, spine and three page-edge orientations.",
			],
			[
				"Animation",
				"A custom GLSL vertex shader gathers the points over 8 seconds. Hidden faces fade out as the book settles.",
			],
			[
				"Handoff",
				"The pixel image settles first, then crossfades into the shared PBR book. Replay starts with a 1-second shrink.",
			],
		],
		needs:
			"Six readable texture maps and book dimensions. Remote images must allow cross-origin canvas sampling.",
		enhancements: [
			"Adapt particle density to screen size and device performance.",
			"Add lighting to the particle shader to bring its appearance closer to the PBR cover during the handoff.",
		],
		hint: "Press Add Book to start. Orbit while it forms to inspect each face.",
	},
	PerlinNoise: {
		title: "Delete book · Dissolve",
		description:
			"The shared book material dissolves through a procedural noise field.",
		values: [
			[
				"Material",
				"MeshStandardMaterial with the same cover maps and PBR settings as 3D Book",
			],
			[
				"Shader",
				"onBeforeCompile adds a 3D noise mask, fragment discard and a glowing emissive edge.",
			],
			[
				"Particles",
				"GPU points drift away from the book surface as the dissolve advances.",
			],
			[
				"Playback",
				"Zustand drives dissolve / restore; useFrame eases the progress.",
			],
		],
		needs:
			"Book textures, subdivided geometry, and progress shared between the cover and particles.",
		enhancements: [
			"Sample the exact dissolving surface colors for the outgoing particles.",
			"Expose noise scale, edge width and dissolve speed as artistic controls.",
		],
		hint: "Press Dissolve Book, then Restore Book to bring it back.",
	},
	Blur: {
		title: "Blur",
		description:
			"A custom shader wraps a real book in a pixelated glass shell.",
		values: [
			[
				"Capture",
				"drei useFBO renders the scene offscreen with the glass shell temporarily hidden.",
			],
			[
				"Shader",
				"Custom GLSL samples that render in 28-CSS-pixel blocks and quantizes each color channel to four steps.",
			],
			[
				"Underlying book",
				"The current demo uses the standard textured book beneath the shell.",
			],
			[
				"Playback",
				"useFrame updates the capture. The toggle is instant; there is no GSAP transition yet.",
			],
		],
		needs:
			"A book mesh beneath the shell, a render target and the canvas resolution.",
		enhancements: [
			"Replace the demo cover with an anonymous book asset underneath the filter, without identifying artwork.",
			"Use GSAP to animate pixel size and filter strength when revealing or hiding the book.",
		],
		hint: "Use Blur to compare the effect. Turning it off also skips the extra scene capture.",
	},
};
