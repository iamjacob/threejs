import assert from 'node:assert/strict'
import test from 'node:test'
import { createShakeDetector } from '../src/components/reader/shakeDetector.ts'

const acceleration = x => ({ x, y: 0, z: 9.8 })

test('ignores missing sensor data, gradual tilts, and isolated bumps', () => {
    const detect = createShakeDetector()
    assert.equal(detect(null, 0), false)
    assert.equal(detect({ x: null, y: null, z: null }, 0), false)
    assert.equal(detect(acceleration(NaN), 0), false)
    for (let i = 0; i < 20; i++) assert.equal(detect(acceleration(i / 2), i * 100), false)
    assert.equal(detect(acceleration(-20), 2000), false)
    assert.equal(detect(acceleration(20), 3100), false)
    assert.equal(detect(acceleration(-20), 4200), false)
})

test('recognizes repeated shaking and suppresses immediate retriggers', () => {
    const detect = createShakeDetector()
    assert.equal(detect(acceleration(0), 0), false)
    assert.equal(detect(acceleration(20), 120), false)
    assert.equal(detect(acceleration(-20), 240), false)
    assert.equal(detect(acceleration(20), 360), true)
    for (let i = 4; i < 20; i++) assert.equal(detect(acceleration(i % 2 ? 20 : -20), i * 120), false)
    assert.equal(detect(acceleration(0), 3000), false)
    assert.equal(detect(acceleration(20), 3120), false)
    assert.equal(detect(acceleration(-20), 3240), false)
    assert.equal(detect(acceleration(20), 3360), true)
})
