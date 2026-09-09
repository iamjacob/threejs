import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { MeshStandardMaterial, SRGBColorSpace } from "three";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";

export { BOOK_COVER_PATH, BOOK_DIMENSIONS } from "./bookTextures";
export const BOOK_MATERIAL = {
	roughness: 0.62,
	metalness: 0,
	envMapIntensity: 0.7,
};
export function useBookTextures(urls?: string[]) {
	const book = useSelectedBook();
	const textures = useTexture(
		(urls ?? book.textureUrls).map((url) => publicAssetUrl(url)),
	);
	const gl = useThree((state) => state.gl);
	return useMemo(() => {
		for (const texture of textures) {
			texture.colorSpace = SRGBColorSpace;
			texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
			texture.needsUpdate = true;
		}
		return textures;
	}, [textures, gl]);
}

export function useBookMaterials() {
	const textures = useBookTextures();
	const materials = useMemo(
		() =>
			textures.map(
				(map) => new MeshStandardMaterial({ ...BOOK_MATERIAL, map }),
			),
		[textures],
	);
	useEffect(
		() => () => {
			for (const material of materials) material.dispose();
		},
		[materials],
	);
	return materials;
}
