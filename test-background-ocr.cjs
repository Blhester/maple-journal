'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),harness=require('./test-screenshot-transfer.cjs'),{decode}=require('./lib/png-rgba.cjs');
const screenshot=decode(fs.readFileSync('dist/assets/ocr-example.png'));
function fixture({deferDecode=false,deferText=false,tight=false,oldExp=false,unreadableHp=false,levelText='58',generic=false,expOnly=false}={}){
  const urls=new Map(),trace={requests:[],canvases:[],fontWorkers:0,terminated:0,textWorkers:0,textTerminated:0},pending={};let id=0,recognitions=0;
  const storage=new Map();if(tight||oldExp){const regions=structuredClone(require('./dist/ocr-core.js').defaults);if(tight)for(const [key,x]of [['hp',1419],['mp',1469]])regions[key]={x:x/1919,y:960/1079,w:30/1919,h:17/1079};if(oldExp)regions.exp={x:1047/1919,y:1037/1079,w:66/1919,h:17/1079};storage.set('maple-journal-ocr-regions-v1',JSON.stringify(regions));}
  const h=harness(storage,{screenCapture:{supported:()=>true,createSession:()=>({active:()=>true,stop(){},capture:async options=>{trace.requests.push(options);return new Blob(['pixels']);}})},setupRuntime:(context,Element)=>{
    class LocalURL extends URL{static createObjectURL(blob){const url='blob:test-'+(++id);urls.set(url,blob);return url;}static revokeObjectURL(url){urls.delete(url);}}
    Object.assign(context,{URL:LocalURL,Blob,DOMException,MapleExpReader:require('./dist/exp-reader.js'),MapleQuantityReader:require('./dist/quantity-reader.js'),
      Image:class{constructor(){this.naturalWidth=1919;this.naturalHeight=1079;}decode(){return deferDecode?new Promise(resolve=>{pending.decode=resolve;}):Promise.resolve();}},
      Worker:class{constructor(url){this.url=url;trace.fontWorkers++;}terminate(){if(!this.ended){this.ended=true;trace.terminated++;}}async postMessage(data){const source=await urls.get(this.url).text(),scope={self:{postMessage:message=>{if(!this.ended)this.onmessage({data:message});}}};vm.runInNewContext(source,scope);scope.self.onmessage({data});}},
      Tesseract:{createWorker:async()=>{trace.textWorkers++;return {setParameters:async()=>{},recognize:async()=>{if(deferText)return new Promise(resolve=>{pending.text=resolve;});return {data:{text:++recognitions<=3?levelText:'0',confidence:90}};},terminate:async()=>{trace.textTerminated++;}};}}
    });
    if(generic){context.window=context;context.document.body=new Element('body');context.setTimeout=setTimeout;context.MapleUseData=require('./dist/data/use-items.json');vm.runInNewContext(fs.readFileSync('dist/use-slots.js','utf8'),context);}
    context.document.baseURI='https://test.invalid/';context.location.protocol='https:';if(expOnly)context.MapleEtcCapture={init(){},render(){},mount(){},read(){throw Error('ETC OCR must be skipped');}};
    context.document.createElement=tag=>{
      const element=new Element(tag);if(tag!=='canvas')return element;
      trace.canvases.push(element);let sourceX=null,sourceY=null;
      element.getContext=()=>({drawImage:(_image,x,y)=>{sourceX=x;sourceY=y;},fillRect(){},putImageData(){},getImageData:(_x,_y,width,height)=>{
        if(sourceX===Math.round(require('./dist/ocr-core.js').defaults.mesos.x*1919)&&width===197&&height===16)return {width,height,data:new Uint8ClampedArray(width*height*4).fill(255)};
        if(unreadableHp&&sourceX>=1410&&sourceX<1460)return {width,height,data:new Uint8ClampedArray(width*height*4)};
        if(sourceX>=1410&&sourceX<1480){const data=new Uint8ClampedArray(width*height*4);for(let row=0;row<height;row++)data.set(screenshot.data.subarray(((sourceY+row)*screenshot.width+sourceX)*4,((sourceY+row)*screenshot.width+sourceX+width)*4),row*width*4);return {width,height,data};}
        if(sourceX>=1040&&sourceX<1115){const data=new Uint8ClampedArray(width*height*4);for(let row=0;row<height;row++)data.set(screenshot.data.subarray(((sourceY+row)*screenshot.width+sourceX)*4,((sourceY+row)*screenshot.width+sourceX+width)*4),row*width*4);return {width,height,data};}
        return {width,height,data:new Uint8ClampedArray(width*height*4)};
      }});return element;
    };
  }});
  if(expOnly){h.node('tracking-mode').value='exp';h.fire('tracking-mode','change');}
  return {h,trace,urls,pending};
}
const flush=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setImmediate(resolve));assert(predicate());};
(async()=>{
  const {h,trace,urls}=fixture(),result=await h.screenshot.sampleProgress({signal:new AbortController().signal,allowPrompt:false});
  assert.deepEqual(Object.fromEntries(Object.entries(result.results).map(([k,r])=>[k,r.value])),{level:'58',exp:'268621',mesos:'0',hp:'441',mp:'761'});assert.equal(result.results.exp.percent,'24.70');assert.equal(result.results.exp.levelUsed,58);assert.equal(result.results.exp.estimated,true);
  assert.equal(trace.requests.length,1);assert.equal(trace.requests[0].allowPrompt,false);assert.equal(trace.fontWorkers,3);assert.equal(trace.terminated,3);assert.equal(trace.textWorkers,1);assert.equal(trace.textTerminated,1);assert.equal(urls.size,0);
  const exp=fixture({generic:true,expOnly:true}),expRead=await exp.h.screenshot.sampleProgress();assert.deepEqual(Object.keys(expRead.results),['level','exp']);assert.equal(exp.trace.fontWorkers,1,'Only EXP font OCR runs; no potion readers');assert.equal(exp.trace.textWorkers,1);assert.equal(exp.urls.size,0);
  const generic=fixture({generic:true}),genericRead=await generic.h.screenshot.sampleProgress();assert.equal(genericRead.results.uses.length,2);assert.equal(genericRead.results.uses[0].quantity,'441');assert.equal(genericRead.results.uses[1].quantity,'761');assert.equal(generic.urls.size,0);assert.equal(generic.trace.fontWorkers,generic.trace.terminated);
  const tight=fixture({tight:true}),tightResult=await tight.h.screenshot.sampleProgress({allowPrompt:false});assert.equal(tightResult.results.hp.value,'441');assert.equal(tightResult.results.mp.value,'761');assert.equal(tight.urls.size,0,'Padded automatic reads release all pixel URLs too');
  const migrated=fixture({oldExp:true}),migratedRead=await migrated.h.screenshot.sampleProgress();assert.equal(migratedRead.results.exp.value,'268621');assert.equal(JSON.parse(migrated.h.storage.get('maple-journal-ocr-regions-v2')).exp.w,134/1919);
  const noLevel=fixture({levelText:''});noLevel.h.node('start-level').value='58';const unknown=await noLevel.h.screenshot.sampleProgress();assert.equal(unknown.results.exp.percent,'24.70');assert.equal(unknown.results.exp.value,null,'Automatic captures cannot infer the current level from the starting form');
  const missingHp=fixture({unreadableHp:true}),partial=await missingHp.h.screenshot.sampleProgress();assert.equal(partial.results.hp.value,null);assert.equal(partial.results.exp.value,'268621');assert.equal(partial.results.mp.value,'761');
  const progress=require('./dist/auto-progress.js').fromRead(partial,{level:58},60000);assert.equal(progress.end.exp,268621);assert.equal(progress.end.hp,null,'Real unreadable potion pixels no longer discard good percentage EXP');assert.equal(missingHp.urls.size,0);
  assert.equal(h.node('ocr-workspace').hidden,true);assert.equal(h.node('ocr-image').attributes.src,undefined);assert.equal(h.node('ocr-review-fields').children.length,0,'No background sample opens or fills the manual review dialog');
  // All numeric preprocessing canvases must be released too, including the
  // scaled intermediates, rather than merely dropping the final output canvas.
  assert(trace.canvases.length>0);assert(trace.canvases.every(canvas=>canvas.width===1&&canvas.height===1),'All read buffers released after a completed sample');
  for(const stage of ['decode','text']){
    const f=fixture(stage==='decode'?{deferDecode:true}:{deferText:true}),controller=new AbortController(),job=f.h.screenshot.sampleProgress({signal:controller.signal});
    await flush(()=>!!f.pending[stage]);controller.abort();await assert.rejects(job,{name:'AbortError'});assert.equal(f.urls.size,0,'Abort releases image and worker URLs during '+stage);assert.equal(f.trace.textTerminated,f.trace.textWorkers);
    if(stage==='decode')f.pending.decode();else f.pending.text({data:{text:'99999',confidence:99}});
    await flush(()=>f.urls.size===0);assert.equal(f.h.node('ocr-image').attributes.src,undefined);
  }
  const open=fixture();open.h.fire('screenshot-start');await assert.rejects(open.h.screenshot.sampleProgress({signal:new AbortController().signal}),/review is open/);assert.equal(open.trace.requests.length,0);
  console.log('Passed: actual background OCR path reads real EXP/HP/MP PNG fixtures with font workers, reuses text OCR, skips manual review, forwards no-prompt capture, releases workers/URLs, rejects concurrent dialog use and cancels during image decode or OCR without applying late values.');
})().catch(error=>{console.error(error);process.exitCode=1;});
