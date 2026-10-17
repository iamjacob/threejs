import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { createShelfPlateGeometry } from "./shelfPlateGeometry";
import { useShelfPlatesStore } from "../../stores/useShelfPlatesStore";
import {
	SHELF_INNER_RADIUS,
	SHELF_SPACING,
	SHELF_THICKNESS,
} from "./shelfBooks";

function GoldPlate({
	label,
	shelf,
	radius,
}: {
	label: string;
	shelf: number;
	radius: number;
}) {
	const openEditor = useShelfPlatesStore((state) => state.openEditor);
	const width = Math.min(2, Math.max(0.85, label.length * 0.047 + 0.22)) * 0.8;
	const geometry = useMemo(() => createShelfPlateGeometry(width), [width]);
	useEffect(
		() => () => {
			geometry.body.dispose();
			geometry.face.dispose();
		},
		[geometry],
	);
	const texture = useMemo(() => {
		const canvas = document.createElement("canvas");
		canvas.width = 1536;
		canvas.height = 192;
		const ctx = canvas.getContext("2d")!;
		const gold = ctx.createLinearGradient(0, 0, 0, 192);
		gold.addColorStop(0, "#fff0b8");
		gold.addColorStop(0.14, "#dbb96a");
		gold.addColorStop(0.6, "#c89c47");
		gold.addColorStop(1, "#a3772e");
		ctx.fillStyle = gold;
		ctx.fillRect(0, 0, 1536, 192);
		ctx.strokeStyle = "#f9de91";
		ctx.lineWidth = 8;
		ctx.strokeRect(6, 6, 1524, 180);
		ctx.fillStyle = "#302414";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.font = "600 100px system-ui, sans-serif";
		ctx.fillText(label.toLocaleUpperCase(), 768, 101, 1340);
		const map = new CanvasTexture(canvas);
		map.colorSpace = SRGBColorSpace;
		return map;
	}, [label]);
	useEffect(() => () => texture.dispose(), [texture]);
	return (
		<group
			position={[
				radius - 0.4,
				(shelf - 1) * SHELF_SPACING + SHELF_THICKNESS / 2,
				0,
			]}
			rotation={[0, -Math.PI / 2, 0]}
		>
			<mesh
				geometry={geometry.body}
				name={`gold-plate-${shelf}`}
				onClick={(event) => {
					event.stopPropagation();
					openEditor();
				}}
			>
				<meshStandardMaterial
					color="#cba451"
					metalness={0.6}
					roughness={0.35}
				/>
			</mesh>
			<mesh
				geometry={geometry.face}
				onClick={(event) => {
					event.stopPropagation();
					openEditor();
				}}
			>
				<meshStandardMaterial map={texture} metalness={0.25} roughness={0.4} />
			</mesh>
		</group>
	);
}

export default function ShelfPlates({
	radius = SHELF_INNER_RADIUS + 0.4,
}: {
	radius?: number;
}) {
	const labels = useShelfPlatesStore((state) => state.labels);
	return labels.map((label, shelf) =>
		label ? (
			<GoldPlate key={shelf} label={label} shelf={shelf} radius={radius} />
		) : null,
	);
}
