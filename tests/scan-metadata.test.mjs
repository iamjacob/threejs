import test from 'node:test';
import assert from 'node:assert/strict';
import { isFlatImage, isPlausibleTitle, isUsableTitle, judgeCover, parseScanMetadata, parseShelfBooks, requestScanMetadata } from '../src/components/scanner/scanMetadata.ts';
test('the reader may say is_book and confidence; every spelling is understood, bad values are ignored', () => {
 const m = (extra) => parseScanMetadata({title:'Dune',subtitle:'',author:'Frank Herbert',...extra});
 assert.equal(m({is_book:false,reason:' Not a cover. '}).isBook,false);
 assert.equal(m({is_book:false,reason:' Not a cover. '}).reason,'Not a cover.');
 assert.equal(m({isBook:true}).isBook,true);
 assert.equal(m({is_book:'yes'}).isBook,undefined);
 assert.equal(m({confidence:0.8}).confidence,0.8);
 assert.equal(m({confidence:'0.5'}).confidence,0.5);
 assert.equal(m({confidence:85}).confidence,0.85);
 for (const bad of [-1,150,'high',null,NaN]) assert.equal(m({confidence:bad}).confidence,undefined,String(bad));
 assert.equal(m({reason:'null'}).reason,undefined);
 assert.equal(m({}).isBook,undefined);
});
test('judging a cover: not a book, blank, unreadable, unsure, or fine', () => {
 const read = (o) => ({title:'Dune',subtitle:'',author:'F',...o});
 assert.equal(judgeCover(read({isBook:false})).kind,'not-book');
 assert.equal(judgeCover(read({isBook:false,reason:'A cat.'})).message,'A cat.');
 // The reader found nothing: a flat photo is "blank", otherwise "no title".
 assert.equal(judgeCover(read({title:''}),true).kind,'not-book');
 assert.equal(judgeCover(read({title:''}),false).kind,'empty');
 assert.equal(judgeCover(read({title:'null'})).kind,'empty');
 // Confidence bands.
 assert.equal(judgeCover(read({confidence:0.2})).kind,'empty');
 assert.equal(judgeCover(read({confidence:0.5})).kind,'check');
 assert.equal(judgeCover(read({confidence:0.5})).title,'Dune');
 assert.equal(judgeCover(read({confidence:0.9})).kind,'ok');
 // No confidence given: only the local plausibility check applies.
 assert.equal(judgeCover(read({})).kind,'ok');
 // Symbols only is "nothing read"; mostly-symbols with a few letters is "check it".
 assert.equal(judgeCover(read({title:'@@##$$%%^^'})).kind,'empty');
 assert.equal(judgeCover(read({title:'@#a$%^&*()b!@#'})).kind,'check');
 assert.equal(judgeCover(read({isBook:true,confidence:0.95})).kind,'ok');
});
test('plausible titles look like words, not noise or paragraphs', () => {
 for (const good of ['Dune','The Source','Les Misérables','1984','Man’s Search for Meaning']) assert.equal(isPlausibleTitle(good),true,good);
 for (const bad of ['@@##$$%%^^','aaaaaaaaaa','x'.repeat(200),'null','']) assert.equal(isPlausibleTitle(bad),false,bad);
});
test('a featureless photo is flat; one with detail is not', () => {
 const w=48,h=64;
 assert.equal(isFlatImage(new Uint8Array(w*h).fill(200),w,h),true);
 const noisy=new Uint8Array(w*h).map((_,i)=>(i*37)%256);
 assert.equal(isFlatImage(noisy,w,h),false);
 const gradient=new Uint8Array(w*h).map((_,i)=>235+((i%w)>24?3:0));
 assert.equal(isFlatImage(gradient,w,h),true);
 const cover=new Uint8Array(w*h).map((_,i)=>((i%w)<16||(i%w)>32)?40:220);
 assert.equal(isFlatImage(cover,w,h),false);
});
test('a cover the model could not read gives empty fields, never "null" or "Untitled"', () => {
 const unreadable = {title:'null',subtitle:'N/A',author:'  Unknown '};
 assert.deepEqual(parseScanMetadata(unreadable),{title:'',subtitle:'',author:''});
 assert.deepEqual(parseScanMetadata({title:'No title',subtitle:'-',author:'?'}),{title:'',subtitle:'',author:''});
 // A real book that merely contains those words is kept.
 assert.equal(parseScanMetadata({title:'None of the Above',subtitle:'',author:''}).title,'None of the Above');
 assert.equal(parseScanMetadata({title:'Unknown Pleasures',subtitle:'',author:''}).title,'Unknown Pleasures');
});
test('only a real title may be searched for or saved', () => {
 for (const bad of ['', ' ', 'a', 'null', 'Unknown', 'Untitled', 'N/A', '--', '...', '12'.slice(0,0)]) assert.equal(isUsableTitle(bad), false, JSON.stringify(bad));
 for (const good of ['Dune', '1984', 'It', 'Les Misérables', '深夜食堂']) assert.equal(isUsableTitle(good), true, good);
});
test('shelf scan accepts {books:[...]} or a bare array, keeps order, drops unreadable entries and clamps boxes', () => {
 const books = parseShelfBooks({books:[
  {title:'First',author:'A',box:{x:-0.2,y:0.1,width:0.3,height:1.4}},
  {title:'',author:''},
  'junk',
  {title:'Third',subtitle:null,author:'C',box:{x:'no'}},
 ]});
 assert.deepEqual(books,[
  {title:'First',subtitle:'',author:'A',box:{x:0,y:0.1,width:0.3,height:1}},
  {title:'Third',subtitle:'',author:'C'},
 ]);
 assert.deepEqual(parseShelfBooks([{title:'Only'}]),[{title:'Only',subtitle:'',author:''}]);
 for(const value of [null,'x',{}]) assert.throws(()=>parseShelfBooks(value));
});
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
