import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";

/** Soft radial falloff behind the carousel. The canvas itself stays opaque. */
export default function Vignette() {
	const scene = useThree((state) => state.scene);
	useEffect(() => {
		const canvas = document.createElement("canvas");
		canvas.width = 256;
		canvas.height = 256;
		const context = canvas.getContext("2d");
		if (!context) return;
		const gradient = context.createRadialGradient(128, 108, 0, 128, 124, 150);
		gradient.addColorStop(0, "#141c3c");
		gradient.addColorStop(0.62, "#080b18");
		gradient.addColorStop(1, "#080b18");
		context.fillStyle = gradient;
		context.fillRect(0, 0, 256, 256);
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		const previous = scene.background;
		scene.background = texture;
		return () => {
			if (scene.background === texture) scene.background = previous;
			texture.dispose();
		};
	}, [scene]);
	return null;
}
