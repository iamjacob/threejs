import { useSyncExternalStore } from "react";
import { LibraryApproach, LiveLibrary } from "./libraryApproach";
import { getStage, subscribeStage } from "./stageHost";

export default function LibraryBridge() {
	const stage = useSyncExternalStore(subscribeStage, getStage, getStage);
	const library = stage.mode === "library";
	return (
		<>
			<LibraryApproach library={library} />
			{library ? <LiveLibrary showStats={stage.showStats} /> : null}
		</>
	);
}
