import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

const useSafeLoader = (
  url: string | null | undefined,
  fallbackUrl = "/covers/test.jpg",
): THREE.Texture => {
  const loader = useMemo(
    () => new THREE.TextureLoader(),
    [],
  );

  const placeholderTexture = useMemo(
    () => new THREE.Texture(),
    [],
  );

  const [texture, setTexture] =
    useState<THREE.Texture>(placeholderTexture);

  useEffect(() => {
    let isActive = true;

    const setLoadedTexture = (
      loadedTexture: THREE.Texture,
    ): void => {
      if (isActive) {
        setTexture(loadedTexture);
      }
    };

    const loadFallback = (): void => {
      loader.load(
        fallbackUrl,
        setLoadedTexture,
        undefined,
        (error: unknown) => {
          console.error(
            `useSafeLoader: Failed to load fallback texture: ${fallbackUrl}`,
            error,
          );
        },
      );
    };

    if (!url?.trim()) {
      console.warn(
        `useSafeLoader: No URL provided. Using fallback: ${fallbackUrl}`,
      );

      loadFallback();

      return () => {
        isActive = false;
      };
    }

    loader.load(
      url,
      setLoadedTexture,
      undefined,
      (error: unknown) => {
        console.error(
          `useSafeLoader: Failed to load texture: ${url}. Using fallback: ${fallbackUrl}`,
          error,
        );

        loadFallback();
      },
    );

    return () => {
      isActive = false;
    };
  }, [url, fallbackUrl, loader]);

  return texture;
};

export default useSafeLoader;