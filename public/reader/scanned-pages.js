// Camera-roll pages use the same Foliate book interface and scroll renderer.
export async function makeScannedBook(id) {
 const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('boooks-scans',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 let saved;
 try {saved=await new Promise((resolve,reject)=>{const r=db.transaction('books').objectStore('books').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}
 if(!saved?.scanPages?.length)throw Error('No scanned pages');
 const urls=new Map();
 return {
  rendition:{layout:'pre-paginated'},metadata:{title:saved.title},
  sections:saved.scanPages.map((page,index)=>({
   id:String(index),size:page.image.length,
   load() {if(urls.has(index))return urls.get(index);
    const doc=document.implementation.createHTMLDocument('Page '+(index+1));
    // The renderer reads the decoded image dimensions, including uncropped photos.
    const image=doc.createElement('img');image.src=page.image;image.style.cssText='display:block;width:100%;height:auto';doc.body.style.margin='0';doc.body.append(image);
    const url=URL.createObjectURL(new Blob([doc.documentElement.outerHTML],{type:'text/html'}));urls.set(index,url);return url;
   },unload(){const url=urls.get(index);if(url)URL.revokeObjectURL(url);urls.delete(index);}
  })),
  destroy(){for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}
 };
}
