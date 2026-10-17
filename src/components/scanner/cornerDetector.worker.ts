import { detectCorners } from "./cornerDetector";

self.onmessage = (event: MessageEvent<ImageData>) => {
	self.postMessage(detectCorners(event.data));
};
