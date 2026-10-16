import test from 'node:test';
import assert from 'node:assert/strict';
import { curlPagePoint, releasedPageTurn } from '../src/components/openbook/pageCurl.ts';

test('curl keeps the spine fixed for either turn and grabbed corner', () => {
  for (const bend of [-1.5, 0, 1.5]) for (const corner of [-1, 0, 1]) {
    for (const y of [-1.5, 0, 1.5]) {
      assert.deepEqual(curlPagePoint(0, y, 2, 3, bend, corner), { x: 0, y, z: 0 });
    }
  }
});
test('paper bends without shortening its surface length', () => {
  for (const bend of [-1.5, 1.5]) {
    let length = 0, previous = curlPagePoint(0, 1.2, 2, 3, bend, 1);
    for (let i = 1; i <= 1000; i++) {
      const point = curlPagePoint(i / 500, 1.2, 2, 3, bend, 1);
      length += Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z);
      previous = point;
    }
    assert.ok(Math.abs(length - 2) < 0.00001);
    assert.ok(Math.abs(previous.z) > 0.5);
  }
});
test('flat paper has its original dimensions', () => {
  assert.deepEqual(curlPagePoint(2, 1.5, 2, 3, 0), { x: 2, y: 1.5, z: 0 });
});
test('release respects taps, threshold, flick direction, and cancellation', () => {
  assert.equal(releasedPageTurn(0, 0, false, true), true);
  assert.equal(releasedPageTurn(0.19, 0, false, false), false);
  assert.equal(releasedPageTurn(0.51, 0, false, false), true);
  assert.equal(releasedPageTurn(0.2, 1, false, false), true);
  assert.equal(releasedPageTurn(0.8, -1, false, false), true);
  assert.equal(releasedPageTurn(1, 2, true, true), false);
});

 test('top and bottom grabs curl their own corner first and mirror vertically', () => {
  const top = curlPagePoint(2, 1.5, 2, 3, 2.5, 1);
  const bottom = curlPagePoint(2, -1.5, 2, 3, 2.5, -1);
  const opposite = curlPagePoint(2, -1.5, 2, 3, 2.5, 1);
  assert.ok(top.z > opposite.z);
  assert.ok(Math.abs(top.z - bottom.z) < 1e-10);
  assert.ok(Math.abs(top.x - bottom.x) < 1e-10);
  assert.ok(Math.abs(top.y + bottom.y) < 1e-10);
 });

test('reaching 20 percent commits even with a backwards release velocity', () => {
  assert.equal(releasedPageTurn(0.2, -2, false, false), true);
  assert.equal(releasedPageTurn(0.199, -2, false, false), false);
  assert.equal(releasedPageTurn(0.8, -2, true, false), false);
});
