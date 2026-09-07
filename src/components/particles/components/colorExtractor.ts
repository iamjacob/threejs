import type {
	BookData,
	ColorExtractionResult,
	ExtractedColor,
	ParticlePixel,
	RgbColor,
} from "../types";

const fallbackColors: ExtractedColor[] = [
	{ color: [1, 0.4, 0.1], percentage: 0.4 },
	{ color: [0.2, 0.6, 1], percentage: 0.3 },
	{ color: [1, 0.9, 0.3], percentage: 0.3 },
];

const fallbackResult = (): ColorExtractionResult => ({
	colors: fallbackColors,
	palette: fallbackColors.map(({ color }) => color),
	pixelData: null,
});

export const extractBookColorsAndPixels = async (
	imageUrl: string,
	maxColors = 8,
): Promise<ColorExtractionResult> =>
	new Promise((resolve) => {
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		const image = new Image();

		if (!context) {
			resolve(fallbackResult());
			return;
		}

		image.crossOrigin = "anonymous";
		image.onload = () => {
			const maxSize = 150;
			const scale = Math.min(maxSize / image.width, maxSize / image.height);

			canvas.width = image.width * scale;
			canvas.height = image.height * scale;
			context.drawImage(image, 0, 0, canvas.width, canvas.height);

			try {
				const imageData = context.getImageData(
					0,
					0,
					canvas.width,
					canvas.height,
				);
				const colors = extractColors(imageData.data, maxColors);

				resolve({
					colors,
					palette: createParticleColorPalette(colors),
					pixelData: extractPixelPositions(
						imageData.data,
						canvas.width,
						canvas.height,
					),
				});
			} catch (error: unknown) {
				console.warn("Could not extract colors and pixels from image:", error);
				resolve(fallbackResult());
			}
		};

		image.onerror = () => {
			console.warn("Could not load image for color extraction:", imageUrl);
			resolve(fallbackResult());
		};

		image.src = imageUrl;
	});

const extractPixelPositions = (
	imageData: Uint8ClampedArray,
	width: number,
	height: number,
): ParticlePixel[] => {
	const pixels: ParticlePixel[] = [];
	const step = 2;

	for (let y = 0; y < height; y += step) {
		for (let x = 0; x < width; x += step) {
			const index = (y * width + x) * 4;
			const red = imageData[index] ?? 0;
			const green = imageData[index + 1] ?? 0;
			const blue = imageData[index + 2] ?? 0;
			const alpha = imageData[index + 3] ?? 0;

			if (alpha > 50) {
				pixels.push({
					x: (x - width / 2) / 50,
					y: -(y - height / 2) / 50,
					z: 0,
					color: [red / 255, green / 255, blue / 255],
				});
			}
		}
	}

	return pixels;
};

interface CountedColor {
	color: RgbColor;
	count: number;
}

const extractColors = (
	imageData: Uint8ClampedArray,
	maxColors: number,
): ExtractedColor[] => {
	const colorMap = new Map<string, number>();
	const step = 4;

	for (let index = 0; index < imageData.length; index += step * 4) {
		const red = imageData[index] ?? 0;
		const green = imageData[index + 1] ?? 0;
		const blue = imageData[index + 2] ?? 0;
		const alpha = imageData[index + 3] ?? 0;

		if (alpha < 128) continue;

		const colorKey = [red, green, blue]
			.map((channel) => Math.floor(channel / 32) * 32)
			.join(",");
		colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
	}

	const colors: CountedColor[] = Array.from(colorMap.entries())
		.map(([colorKey, count]) => {
			const [red = 0, green = 0, blue = 0] = colorKey.split(",").map(Number);
			return {
				color: [red / 255, green / 255, blue / 255] as RgbColor,
				count,
			};
		})
		.sort((first, second) => second.count - first.count)
		.slice(0, maxColors);

	const totalCount = colors.reduce((sum, item) => sum + item.count, 0);
	if (totalCount === 0) return [];

	return colors.map(({ color, count }) => ({
		color,
		percentage: count / totalCount,
	}));
};

export const getBookCoverUrl = (bookData: BookData): string | null => {
	if (typeof bookData.cover === "string") return bookData.cover;
	if (bookData.cover?.front) return bookData.cover.front;

	const possiblePaths = [
		bookData.id ? `/covers/${bookData.id}.jpg` : undefined,
		bookData.isbn ? `/covers/${bookData.isbn}.jpg` : undefined,
		bookData.id ? `/books/${bookData.id}/cover.jpg` : undefined,
		bookData.thumbnail,
		bookData.image,
	];

	return possiblePaths.find((path): path is string => Boolean(path)) ?? null;
};

export const createParticleColorPalette = (
	extractedColors: ExtractedColor[],
): RgbColor[] => {
	if (extractedColors.length === 0) {
		return fallbackColors.map(({ color }) => color);
	}

	return extractedColors.map(({ color: [red, green, blue] }) =>
		enhanceColorForParticles(red, green, blue),
	);
};

const enhanceColorForParticles = (
	red: number,
	green: number,
	blue: number,
): RgbColor => {
	const [hue, saturation, value] = rgbToHsv(red, green, blue);
	return hsvToRgb(hue, Math.min(1, saturation * 1.3), Math.min(1, value * 1.2));
};

const rgbToHsv = (red: number, green: number, blue: number): RgbColor => {
	const maximum = Math.max(red, green, blue);
	const minimum = Math.min(red, green, blue);
	const difference = maximum - minimum;
	let hue = 0;

	if (difference !== 0) {
		if (maximum === red) hue = ((green - blue) / difference) % 6;
		else if (maximum === green) hue = (blue - red) / difference + 2;
		else hue = (red - green) / difference + 4;
	}

	hue /= 6;
	if (hue < 0) hue += 1;

	return [hue, maximum === 0 ? 0 : difference / maximum, maximum];
};

const hsvToRgb = (hue: number, saturation: number, value: number): RgbColor => {
	const chroma = value * saturation;
	const intermediate = chroma * (1 - Math.abs(((hue * 6) % 2) - 1));
	const match = value - chroma;
	let rgb: RgbColor;

	if (hue < 1 / 6) rgb = [chroma, intermediate, 0];
	else if (hue < 2 / 6) rgb = [intermediate, chroma, 0];
	else if (hue < 3 / 6) rgb = [0, chroma, intermediate];
	else if (hue < 4 / 6) rgb = [0, intermediate, chroma];
	else if (hue < 5 / 6) rgb = [intermediate, 0, chroma];
	else rgb = [chroma, 0, intermediate];

	return [rgb[0] + match, rgb[1] + match, rgb[2] + match];
};
