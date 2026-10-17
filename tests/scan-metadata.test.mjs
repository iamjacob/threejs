import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScanMetadata, requestScanMetadata } from '../src/components/scanner/scanMetadata.ts';
test('metadata accepts _meta, nulls and missing fields, rejects malformed data', () => {
 assert.deepEqual(parseScanMetadata({title:' Book ',subtitle:null,author:' A, B ',_meta:{model:'m',ms:1}}),{title:'Book',subtitle:'',author:'A, B'});
 assert.deepEqual(parseScanMetadata({title:'Book'}),{title:'Book',subtitle:'',author:''});
 for(const value of [null,'x',{title:17,subtitle:null,author:null}]) assert.throws(()=>parseScanMetadata(value));
});
test('request uploads a 1024px JPEG as multipart field "image"', async () => {
 const original={Image:globalThis.Image,document:globalThis.document,fetch:globalThis.fetch};
 const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toBlob:(cb,type,quality)=>{assert.equal(type,'image/jpeg');assert.equal(quality,.8);cb(new Blob(['jpg'],{type}));}};
 try {
 globalThis.Image=class {naturalWidth=1600;naturalHeight=2400;async decode(){}};
 globalThis.document={createElement:()=>canvas};
 let response={ok:true,status:200,json:async()=>({title:'Book',subtitle:null,author:'Writer',_meta:{}})};
 globalThis.fetch=async (url,options)=>{
 assert.equal(url,'https://boooks-scan.iam-249.workers.dev/scan');
 assert.equal(options.method,'POST');
 assert.equal(options.credentials,'omit');
 assert.ok(options.body instanceof FormData);
 const file=options.body.get('image');
 assert.equal(file.name,'cover.jpg');
 assert.equal(file.type,'image/jpeg');
 return response;
 };
 assert.deepEqual(await requestScanMetadata('local-image',new AbortController().signal),{title:'Book',subtitle:'',author:'Writer'});
 assert.equal(canvas.width,683);assert.equal(canvas.height,1024);
 response={ok:false,status:502,json:async()=>({error:'upstream unreachable'})};
 await assert.rejects(requestScanMetadata('local-image',new AbortController().signal),{name:'ScanMetadataError',status:502});
 response={ok:false,status:413,json:async()=>{throw new Error('not json');}};
 await assert.rejects(requestScanMetadata('local-image',new AbortController().signal),{status:413,message:/too large/});
 const controller=new AbortController();controller.abort();
 await assert.rejects(requestScanMetadata('local-image',controller.signal),{name:'AbortError'});
 } finally { Object.assign(globalThis,original); }
});
