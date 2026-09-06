import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";

import Book from "../book/book";

import { SceneGlassMaterial } from "./SceneGlassMaterial";

const CensoredBook = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef =
    useRef<InstanceType<typeof SceneGlassMaterial>>(null);

  // Storage for the captured scene
  const renderTarget = useFBO();
  const { size } = useThree();

  useFrame((state) => {
    const mesh = meshRef.current;
    const material = materialRef.current;

    if (!mesh || !material) return;

    // Hide the pixel-glass mesh while capturing the scene
    mesh.visible = false;

    // Render the rest of the scene into the texture
    state.gl.setRenderTarget(renderTarget);
    state.gl.render(state.scene, state.camera);
    state.gl.setRenderTarget(null);

    // Pass the captured scene into the shader
    material.uSceneDiffuse = renderTarget.texture;
    material.uWinResolution.set(size.width, size.height);

    mesh.visible = true;
  });

  return (
    <group>
      {/* Anything behind the pixel glass */}
      <Book />

      {/* Pixel-glass box */}
      <mesh
        ref={meshRef}
        position={[0, 0, 0]}
        scale={[1, 1, 1]}
      >
        <boxGeometry args={[0.7, 1, 0.1]} />

        <sceneGlassMaterial
          ref={materialRef}
          transparent
          uBlockSize={28}
          uColorLevels={4}
        />
      </mesh>
    </group>
  );
};

export default CensoredBook;