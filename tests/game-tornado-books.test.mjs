import assert from "node:assert/strict";
import { test } from "node:test";
import { fallbackColor, TORNADO_CAPACITY, tornadoInstances } from "../src/game/core/tornadoBooks.ts";

const book = (i, extra = {}) => ({
	id: `b${String(i).padStart(3, "0")}`,
	title: `Title ${i}`,
	author: "A",
	addedAt: 1000 + i,
	source: "scan",
	catalogId: null,
	widthCm: 11,
	heightCm: 18,
	thicknessCm: 1,
	color: null,
	...extra,
});
const at = (inst) => [inst.x, inst.y, inst.z].map((v) => v.toFixed(9)).join(",");

test("empty library → no instances", () => {
	assert.deepEqual(tornadoInstances([]), { instances: [], hidden: 0 });
});

test("single book renders at slot 0 (top of the spiral, widest radius)", () => {
	const { instances } = tornadoInstances([book(1)]);
	assert.equal(instances.length, 1);
	assert.equal(instances[0].slot, 0);
	assert.ok(instances[0].y > 30, "top of the tornado");
	assert.ok(Math.hypot(instances[0].x, instances[0].z) > 8, "outer radius");
});

test("positions are stable: input order, re-renders and appending never move existing books", () => {
	const lib = [book(3), book(1), book(2)];
	const a = tornadoInstances(lib).instances;
	const b = tornadoInstances([...lib].reverse()).instances;
	assert.deepEqual(a.map((i) => [i.bookId, at(i)]), b.map((i) => [i.bookId, at(i)]), "order-independent");
	const grown = tornadoInstances([...lib, book(4)]).instances;
	for (const inst of a) assert.equal(at(grown.find((g) => g.bookId === inst.bookId)), at(inst), `${inst.bookId} did not move`);
	assert.equal(grown.find((g) => g.bookId === "b004").slot, 3, "new book takes the next slot");
});

test("same addedAt is tie-broken by id deterministically", () => {
	const lib = [book(2, { addedAt: 5 }), book(1, { addedAt: 5 })];
	assert.deepEqual(tornadoInstances(lib).instances.map((i) => i.bookId), ["b001", "b002"]);
});

test("large libraries cap at capacity; the rest are counted, not drawn", () => {
	const lib = Array.from({ length: 200 }, (_, i) => book(i));
	const { instances, hidden } = tornadoInstances(lib);
	assert.equal(instances.length, TORNADO_CAPACITY);
	assert.equal(hidden, 200 - TORNADO_CAPACITY);
	assert.equal(new Set(instances.map(at)).size, TORNADO_CAPACITY, "no two books share a position");
});

test("size from physical cm; unknown or absurd sizes fall back; fallback colors are deterministic", () => {
	const [known, unknown, huge] = tornadoInstances([
		book(1),
		book(2, { widthCm: null, heightCm: null, thicknessCm: null }),
		book(3, { widthCm: 9999 }),
	]).instances;
	assert.ok(Math.abs(known.size[0] - 11 * 0.12) < 1e-9);
	assert.ok(Math.abs(unknown.size[1] - 20 * 0.12) < 1e-9);
	assert.ok(huge.size[0] <= 60 * 0.12 + 1e-9);
	assert.equal(fallbackColor({ title: "Seneca", author: "Seneca" }), fallbackColor({ title: "Seneca", author: "Seneca" }));
	assert.equal(fallbackColor({ title: "x", author: "y", color: "#123456" }), "#123456");
	assert.match(fallbackColor({ title: "x", author: "y", color: "javascript:alert(1)" }), /^#[0-9a-f]{6}$/i);
});
