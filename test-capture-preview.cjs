'use strict';
const assert=require('node:assert/strict'),harness=require('./test-screenshot-transfer.cjs'),C=require('./dist/screen-capture.js');
const flush=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setImmediate(resolve));assert(predicate(),'Capture completed the expected stage');};
function fixture(){
  const urls=new Map(),trace={requests:0,draws:0,reads:0},pending={};let runtime,id=0,decode=()=>Promise.resolve(),readError=false,deferRead=false;
  const track=new EventTarget();track.readyState='live';track.stop=()=>{track.readyState='ended';};track.getSettings=()=>({width:1919,height:1079});
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const storage=new Map([['maple-journal-ocr-tuning-v1',JSON.stringify(Object.fromEntries(require('./dist/ocr-core.js').fields.map(f=>[f.id,{reader:'general'}])))]]);
  const h=harness(storage,{screenCapture:{supported:()=>C.supported(runtime),createSession:options=>C.createSession({...options,env:runtime})},setupRuntime:(context,Element)=>{
    runtime=context;
    context.document.baseURI='https://test.invalid/';context.location.protocol='https:';
    const originalGet=context.document.getElementById;
    function find(root,predicate){for(const child of root.children||[]){if(predicate(child))return child;const match=find(child,predicate);if(match)return match;}return null;}
    context.document.getElementById=id=>find(originalGet('ocr-review-fields'),e=>e.id===id)||originalGet(id);
    Element.prototype.querySelector=function(selector){return find(this,e=>selector.startsWith('#')?e.id===selector.slice(1):(e.className||'').split(' ').includes(selector.slice(1)));};
    class LocalURL extends URL{static createObjectURL(blob){const url='blob:capture-'+(++id);urls.set(url,blob);return url;}static revokeObjectURL(url){urls.delete(url);}}
    Object.assign(context,{isSecureContext:true,Blob,DOMException,setTimeout,clearTimeout,URL:LocalURL,
      navigator:{mediaDevices:{getSupportedConstraints:()=>({width:true,height:true,frameRate:true}),getDisplayMedia:async()=>{trace.requests++;return stream;}}},
      Image:class{constructor(){this.naturalWidth=1919;this.naturalHeight=1079;}decode(){return decode();}},
      Tesseract:{createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async()=>{
        trace.reads++;if(readError)throw new Error('Test OCR failed');if(deferRead)return new Promise(resolve=>{pending.read=resolve;});
        const label=originalGet('ocr-progress-text').textContent,values={'training map':'Ant Tunnel IV','class / job':'Cleric',level:'58',exp:'24.70%',mesos:'6706','hp supply quantity':'441','mp supply quantity':'761'},key=Object.keys(values).find(k=>label.startsWith('Reading '+k+' ·'));
        return {data:{text:values[key],confidence:90}};
      }})}
    });
    Element.prototype.getContext=()=>({drawImage:()=>{trace.draws++;},fillRect(){},putImageData(){},getImageData:(_x,_y,width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)})});
    context.document.createElement=tag=>{
      if(tag==='video'){const video=new EventTarget();Object.assign(video,{readyState:2,videoWidth:1919,videoHeight:1079,play:()=>Promise.resolve(),pause(){},remove(){}});return video;}
      const element=new Element(tag);if(tag==='canvas'){
        element.getContext=()=>({drawImage:()=>{trace.draws++;},fillRect(){},putImageData(){},getImageData:(_x,_y,width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)})});
        element.toBlob=callback=>callback(new Blob(['local snapshot'],{type:'image/png'}));
      }return element;
    };
  }});
  h.node('ocr-region-field').value='exp';h.fire('screenshot-start');
  return {h,trace,urls,pending,track,get:id=>runtime.document.getElementById(id),setDecode:value=>{decode=value;},setReadError:value=>{readError=value;},setDeferRead:value=>{deferRead=value;}};
}
(async()=>{
  const {h,trace,urls,track,setDecode,get,setReadError}=fixture();
  h.fire('ocr-capture');await flush(()=>!h.node('ocr-capture').disabled&&trace.reads>0);
  assert.equal(get('ocr-value-level').value,'58');assert.equal(get('ocr-value-exp').value,'268621');assert.equal(get('ocr-value-mesos').value,'6706');assert.equal(get('ocr-value-hp').value,'441');assert.equal(get('ocr-value-mp').value,'761');assert.equal(h.node('ocr-review-form').hidden,false,'Capture automatically populates the real OCR review');assert.equal(h.node('start-exp').value,'','Values still require review and Apply');
  assert.equal(h.node('ocr-workspace').hidden,false);assert.match(h.node('ocr-file-name').textContent,/Screen capture.png/);
  assert.match(h.node('ocr-capture-status').textContent,/cannot verify the source type/);assert.equal(h.node('ocr-capture-error').hidden,true);assert.equal(h.node('ocr-capture').disabled,false);
  assert.equal(trace.requests,1);assert.equal(track.readyState,'live');assert.equal(urls.size,1,'Only the current preview URL remains');
  // Run the real capture -> decode -> preview path without a File constructor.
  const firstReads=trace.reads;h.fire('ocr-capture');await flush(()=>!h.node('ocr-capture').disabled&&trace.reads>firstReads);assert.equal(trace.requests,1);assert.equal(urls.size,1);
  const previous=h.node('ocr-image').src;h.node('ocr-review-form').hidden=false;const beforeFailure=trace.reads;
  setDecode(()=>Promise.reject(new Error('Test image decode failed')));h.fire('ocr-capture');await flush(()=>!h.node('ocr-capture').disabled);
  assert.equal(h.node('ocr-capture-error').hidden,false);assert.match(h.node('ocr-capture-error').textContent,/Test image decode failed/);
  assert.equal(h.node('ocr-image').src,previous);assert.equal(h.node('ocr-review-form').hidden,false);assert.equal(get('ocr-value-hp').value,'441');assert.equal(trace.reads,beforeFailure,'Failed decode never re-reads a stale screenshot');assert.equal(urls.size,1,'Failed replacement releases its URL and keeps the previous preview');
  setDecode(()=>Promise.resolve());h.fire('ocr-capture');await flush(()=>!h.node('ocr-capture').disabled);assert.equal(h.node('ocr-capture-error').hidden,true);assert.match(h.node('ocr-capture-status').textContent,/Snapshot captured/);
  setReadError(true);h.fire('ocr-capture');await flush(()=>!h.node('ocr-capture').disabled);assert.match(h.node('ocr-error').textContent,/Test OCR failed/);assert.equal(h.node('ocr-workspace').hidden,false,'An OCR failure keeps the image available for retry');
  setReadError(false);h.fire('ocr-read');await flush(()=>!h.node('ocr-read').disabled);assert.equal(get('ocr-value-hp').value,'441','Manual re-read remains available');
  let finish;setDecode(()=>new Promise(resolve=>{finish=resolve;}));h.fire('ocr-capture');await flush(()=>!!finish);h.fire('ocr-close');finish();await flush(()=>urls.size===0);
  assert.equal(h.node('ocr-workspace').hidden,true,'Closing during decode cannot reopen the preview');assert.equal(h.node('screenshot-dialog').open,false);h.windowEvent({type:'pagehide'});assert.equal(track.readyState,'ended');
  const late=fixture();late.setDeferRead(true);late.h.fire('ocr-capture');await flush(()=>!!late.pending.read);late.h.fire('ocr-close');late.pending.read({data:{text:'99999',confidence:99}});await flush(()=>!late.h.node('ocr-read').disabled);assert.equal(late.h.node('ocr-review-fields').children.length,0,'Closing during automatic OCR cannot populate a late review');assert.equal(late.urls.size,0);late.h.windowEvent({type:'pagehide'});
  console.log('Passed: Firefox-like capture automatically fills real OCR review values without Read screenshot, repeated snapshots reuse sharing, values wait for Apply, failures allow retry, failed/cancelled decodes do not re-read stale pixels, and closing during decode/OCR prevents late results.');
})().catch(error=>{console.error(error);process.exitCode=1;});
