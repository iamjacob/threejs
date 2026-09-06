"use client";

import { useMemo } from "react";
import type { ReactElement } from "react";
import * as THREE from "three";

import useSafeLoader from "./useSafeLoader.tsx";

const Book = (): ReactElement => {
  const sideTexture = useSafeLoader(
    "/experience/books/assets/booktextureSide.webp",
  );

  const spineTexture = useSafeLoader(
    "/blockchain/m/i/mit_liv_med_fangekoret-00000001/cover/spine.webp",
  );

  const edgeTexture = useSafeLoader(
    "/experience/books/assets/booktexture.webp",
  );

  const frontTexture = useSafeLoader(
    "/experience/books/assets/booktexture.webp",
  );

  const topTexture = useSafeLoader(
    "/blockchain/m/i/mit_liv_med_fangekoret-00000001/cover/front.webp",
  );

  const backTexture = useSafeLoader(
    "/blockchain/m/i/mit_liv_med_fangekoret-00000001/cover/back.webp",
  );

  const materials = useMemo<THREE.MeshStandardMaterial[]>(
    () =>
      [
        sideTexture,
        spineTexture,
        edgeTexture,
        frontTexture,
        topTexture,
        backTexture,
      ].map(
        (texture) =>
          new THREE.MeshStandardMaterial({
            map: texture,
          }),
      ),
    [
      sideTexture,
      spineTexture,
      edgeTexture,
      frontTexture,
      topTexture,
      backTexture,
    ],
  );

  return (
    <mesh
      position={[0, 0, 0]}
      rotation={[0, 0, 0]}
    >
      <boxGeometry args={[0.7, 1, 0.1]} />

      {/*
        Later: show a wireframe while the cover images load,
        then fade the book materials in.
      */}

      {materials.map((material, index) => (
        <primitive
          key={material.uuid}
          object={material}
          attach={`material-${index}`}
        />
      ))}
    </mesh>
  );
};

export default Book;