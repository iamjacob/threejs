import assert from 'node:assert/strict';
import {test} from 'node:test';
import {rolldown} from 'rolldown';
const build=await rolldown({input:'src/components/scanner/scanDrafts.ts',platform:'node'});
const {output}=await build.generate({format:'esm'});await build.close();
const {newScanDraft,saveDraft,loadDrafts,pagePhotos}=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
// Exercise the production transaction lifecycle with a deterministic IDB stand-in.
const records=new Map();
globalThis.indexedDB={open(){const request={};queueMicrotask(()=>{request.result={close(){},transaction(){const tx={objectStore(){return {put(value){records.set(value.id,structuredClone(value));queueMicrotask(()=>tx.oncomplete());},getAll(){const r={};queueMicrotask(()=>{r.result=structuredClone([...records.values()]);r.onsuccess();});return r;}}}};return tx;}};request.onsuccess();});return request;}};
test('new books retain earlier photos, tags, crop points and editable draft identity',async()=>{
 const first=newScanDraft();first.title='First';first.photos=[{id:'photo',name:'Copyright',image:'data:image/png;base64,AA',tag:'copyright',points:[{x:1,y:2}],crop:{image:'cropped',width:100,height:200}}];first.updated=1;
 await saveDraft(first);
 const second=newScanDraft();second.title='Second';second.updated=2;await saveDraft(second);
 const history=await loadDrafts();assert.deepEqual(history.map(d=>d.title),['Second','First']);assert.deepEqual(history[1].photos,first.photos);
 first.title='First, edited';first.updated=3;await saveDraft(first);
 const edited=await loadDrafts();assert.equal(edited.length,2);assert.equal(edited[0].id,first.id);assert.equal(edited[0].title,'First, edited');
});

test('page photos map to their own leaf: explicit index wins, a rescan replaces, covers are skipped',()=>{
 const photo=(id,tag,page)=>({id,name:id,image:id,tag,page});
 const map=pagePhotos([photo('cover','front'),photo('a','page',2),photo('b','page'),photo('c','page',0),photo('jacket','dustjacket')]);
 assert.deepEqual([...map.keys()].sort(),[0,2,3]);
 assert.equal(map.get(2).id,'a');assert.equal(map.get(3).id,'b');assert.equal(map.get(0).id,'c');
 assert.equal(pagePhotos([photo('old','page',1),photo('new','page',1)]).get(1).id,'new');
});
