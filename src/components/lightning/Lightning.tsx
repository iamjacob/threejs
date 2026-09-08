import { Environment, Lightformer } from "@react-three/drei";
import { usePresentationStore } from "../../stores/usePresentationStore";

export default function Lightning() {
	const redAccent = usePresentationStore((state) => state.redAccent);

	return (
		<group name="studio-lighting">
			<ambientLight intensity={0.3} />
			<hemisphereLight args={["#eef3ff", "#34303b", 0.7]} />
			<group name="soft-lighting">
				<directionalLight
					position={[-3, 5, 4]}
					color="#fff0df"
					intensity={1.8}
				/>
				<directionalLight
					position={[4, 2, 2]}
					color="#dde9ff"
					intensity={0.8}
				/>
				<directionalLight
					position={[1, 3, -5]}
					color="#f1edff"
					intensity={1.4}
				/>
			</group>
			{redAccent && (
				<group name="red-accent-lighting">
					<directionalLight
						position={[-4, 2, 3]}
						color="#ff514a"
						intensity={3}
					/>
					<directionalLight
						position={[2, 1, -4]}
						color="#ff806b"
						intensity={2}
					/>
				</group>
			)}
			<Environment resolution={128} frames={1}>
				<Lightformer
					form="rect"
					position={[-3, 3, 2]}
					target={[0, 0, 0]}
					scale={[4, 5, 1]}
					color="#fff1dd"
					intensity={1.5}
				/>
				<Lightformer
					form="rect"
					position={[4, 1, 1]}
					target={[0, 0, 0]}
					scale={[2, 5, 1]}
					color="#e3edff"
					intensity={1}
				/>
				<Lightformer
					form="rect"
					position={[0, 2, -5]}
					target={[0, 0, 0]}
					scale={[5, 3, 1]}
					color="#f3efff"
					intensity={1.5}
				/>
			</Environment>
		</group>
	);
}
