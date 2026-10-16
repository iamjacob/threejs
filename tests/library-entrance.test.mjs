import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "three";
import { libraryEntrancePose, LIBRARY_ENTRANCE_SECONDS } from "../src/components/tour/libraryEntrance.ts";

test("short camera entrance approaches the shelf and lands exactly on the standard view", () => {
	const center = new Vector3(0, 0.6, -7.5);
	assert.ok(LIBRARY_ENTRANCE_SECONDS <= 2);
	for (const distance of [3, 6, 10]) {
		const start = libraryEntrancePose(center, distance, 0);
		const end = libraryEntrancePose(center, distance, LIBRARY_ENTRANCE_SECONDS);
		assert.ok(start.position.x < end.position.x);
		assert.ok(start.position.y > end.position.y);
		assert.ok(start.position.distanceTo(center) > end.position.distanceTo(center));
		assert.deepEqual(end.target, center);
		assert.deepEqual(end.position, center.clone().add(new Vector3(0, distance * .12, distance * .993)));
		assert.deepEqual(libraryEntrancePose(center, distance, 10), end);
		for (let t = 0; t < LIBRARY_ENTRANCE_SECONDS; t += .05) {
			const pose = libraryEntrancePose(center, distance, t);
			assert.ok(pose.position.z > center.z, "Camera remains in front of the shelf");
		}
	}
});
