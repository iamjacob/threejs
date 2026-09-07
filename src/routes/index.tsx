import { createFileRoute } from '@tanstack/react-router'
import { OrbitControls, Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
// import { createFileRoute } from "@tanstack/react-router";
import Header from "../components/layout/header/header.tsx";
import TocSidebar from "../components/layout/TocSidebar.tsx";
import Particles from "../components/particles/Particles.tsx";
import ParticlesController from "../components/particles/ParticlesController.tsx";

import Shelves from "../components/Shelves/Shelves";
import Book from "../components/book/book";
import CensoredBook from "../components/blur/CensoredBook";

import BookPageSwiper from "../components/openbook/BookPageSwiper.tsx";
import OpenBook from "../components/openbook/OpenBook.tsx";

import Dissolve from "../components/dissolve/Dissolve.tsx";
import DissolveController from "../components/dissolve/DissolveController.tsx";


//Fix routes in TOC!
export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<div className="fixed">
			<Header />
			<TocSidebar />

			<div
				className="w-full h-full fixed inset-0 z-0 bg-blue-900"
				style={{
					top: "env(safe-area-inset-top)",
				}}
			>
				<Canvas
					className="pointer-events-none"
					camera={{
						position: [0, 0.0001, 5],
						zoom: 4,
						fov: 75,
					}}
				>
					{/* <Shelves /> */}

					{/* <Book /> */}

					{/* <CensoredBook/> */}

					{/* <OpenBook /> */}

					<Dissolve/>

					<Particles />

					{/* Foliate.js */}
					{/* <Foliate/> */}

					<Stars />

					<ambientLight intensity={1} />
					<OrbitControls />
				</Canvas>

				<DissolveController/>
				{/* <ParticlesController /> */}

				{/* <LevelController/> */}
				{/* <BookPageSwiper /> */}
			</div>
		</div>
	);
}
