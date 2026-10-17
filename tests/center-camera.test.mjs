import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pointerTurnSpeed,stepCenterTurn} from '../src/components/tour/centerCamera.ts';
test('side steering has a neutral center and symmetric bounded speed',()=>{
 assert.equal(pointerTurnSpeed(.3),0);assert.equal(pointerTurnSpeed(-.3),0);
 assert.equal(pointerTurnSpeed(-1),-pointerTurnSpeed(1));
 assert.equal(pointerTurnSpeed(2),pointerTurnSpeed(1));
 assert.ok(pointerTurnSpeed(.6)<pointerTurnSpeed(.9));
});
test('cinematic turning eases in, settles on release and bounds stalled frames',()=>{
 let state=stepCenterTurn(0,0,.65,1/60);
 assert.ok(state.speed>0&&state.speed<.65);
 const first=state.speed;
 for(let i=0;i<120;i++)state=stepCenterTurn(state.yaw,state.speed,.65,1/60);
 assert.ok(state.speed>first);
 const release=state.yaw;
 for(let i=0;i<240;i++)state=stepCenterTurn(state.yaw,state.speed,0,1/60);
 assert.equal(state.speed,0);assert.ok(state.yaw>release);
 assert.deepEqual(stepCenterTurn(0,0,.65,10),stepCenterTurn(0,0,.65,.05));
});
