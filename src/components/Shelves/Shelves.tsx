import { useEffect, useMemo, useRef, useState } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import { useLevelStore } from "../../stores/useLevelStore";
import { progressionConfig } from "./progressionConfig";

type Vector3Tuple = [number, number, number];

interface ShelfProps {
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
  fraction: number;
  index: number;
}

const Shelf = ({
  position = [0, 0, 0],
  rotation = [-Math.PI / 2, 0, 0],
  fraction,
  index,
}: ShelfProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  // const { zoomToShelf } = useShelfZoomStore();

  const textures = useLoader(THREE.TextureLoader, [
    "/experience/shelf/Wood051_1K-JPG_Color.webp",
    "/experience/shelf/Wood051_1K-JPG_NormalDX.webp",
    "/experience/shelf/Wood051_1K-JPG_Roughness.webp",
  ]);

  const [colorMap, normalMap, roughnessMap] = useMemo(() => {
    textures.forEach((map) => {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(1, 1);
    });

    return textures;
  }, [textures]);

  const geometry = useMemo(() => {
    const outerR = 8;
    const innerR = 7;
    const arcLength = Math.PI * 2 * fraction;
    const startAngle = -arcLength / 2; // Center the arc
    const endAngle = arcLength / 2;

    const shape = new THREE.Shape();

    shape.moveTo(
      Math.cos(startAngle) * outerR,
      Math.sin(startAngle) * outerR,
    );

    shape.absarc(0, 0, outerR, startAngle, endAngle, false);

    shape.lineTo(
      Math.cos(endAngle) * innerR,
      Math.sin(endAngle) * innerR,
    );

    shape.absarc(0, 0, innerR, endAngle, startAngle, true);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.08,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 32,
    });
  }, [fraction]);

  return (
    <group
      position={position}
      rotation={rotation}
      name={`shelf-group-${index}`}
    >
      {/* Visible shelf */}
      <mesh
        ref={meshRef}
        raycast={() => null}
        // onDoubleClick={() => toggle()}
      >
        <primitive object={geometry} attach="geometry" />

        <meshStandardMaterial
          map={colorMap}
          normalMap={normalMap}
          roughnessMap={roughnessMap}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};

const Shelves = () => {
  const levelIndex = useLevelStore((state) => state.levelIndex);
  const targetFractions = progressionConfig.levels[levelIndex]?.shelves ?? [];
  const [animatedFractions, setAnimatedFractions] = useState<number[]>(
    progressionConfig.levels[0]?.shelves ?? [],
  );

  useEffect(() => {
    const tweens: { value: number }[] = [];

    targetFractions.forEach((targetFraction, index) => {
      const tweenState = {
        value: animatedFractions[index] ?? 0,
      };
      tweens.push(tweenState);

      gsap.to(tweenState, {
        value: targetFraction,
        duration: 0.45,
        delay: index * 0.06,
        ease: "power1.out",
        onUpdate: () => {
          setAnimatedFractions((current) => {
            const next = [...current];
            next[index] = tweenState.value;
            return next;
          });
        },
      });
    });

    return () => {
      tweens.forEach((tweenState) => gsap.killTweensOf(tweenState));
    };
  }, [levelIndex, targetFractions]);

  return (
    <group
      position={[0, -0.8, 0]}
      rotation={[0, Math.PI / 2, 0]}
    >
      {animatedFractions.map((fraction, i) => {
        if (fraction <= 0.0001) return null;

        return (
          <Shelf
            key={i}
            index={i}
            position={[0, i - 1, 0]}
            fraction={fraction}
          />
        );
      })}
    </group>
  );
};

export default Shelves;