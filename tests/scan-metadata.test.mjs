import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScanMetadata, requestScanMetadata } from '../src/components/scanner/scanMetadata.ts';
test('metadata accepts unknown fields and nulls, rejects malformed data', () => {
 assert.deepEqual(parseScanMetadata({metadata:{title:' Book ',subtitle:null,author:' Writer ',future:123}}),{title:'Book',subtitle:'',author:'Writer'});
 for(const value of [null,{}, {metadata:{title:17,subtitle:null,author:null}}, {metadata:{title:'Book'}}]) assert.throws(()=>parseScanMetadata(value));
});
test('request sends only a resized JPEG and the versioned metadata contract', async () => {
 const original={Image:globalThis.Image,document:globalThis.document,fetch:globalThis.fetch};
 const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:(type,quality)=>{assert.equal(type,'image/jpeg');assert.equal(quality,.72);return 'data:image/jpeg;base64,small';}};
 try {
 globalThis.Image=class {naturalWidth=1600;naturalHeight=2400;async decode(){}};
 globalThis.document={createElement:()=>canvas};
 globalThis.fetch=async (url,options)=>{
 assert.equal(url,'https://ai.boooks.app/v1/scans/metadata');
 assert.equal(options.credentials,'omit');
 const body=JSON.parse(options.body);
 assert.deepEqual(body.image,{mimeType:'image/jpeg',base64:'small',width:512,height:768});
 assert.equal(body.scanId,'draft-1');
 assert.deepEqual(body.fields,['title','subtitle','author']);
 return {ok:true,json:async()=>({metadata:{title:'Book',subtitle:null,author:'Writer'}})};
 };
 assert.equal((await requestScanMetadata('local-image','draft-1',new AbortController().signal)).title,'Book');
 const controller=new AbortController();controller.abort();
 await assert.rejects(requestScanMetadata('local-image','draft-1',controller.signal),{name:'AbortError'});
 } finally { Object.assign(globalThis,original); }
});
