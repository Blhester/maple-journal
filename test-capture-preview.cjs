'use strict';
const assert=require('node:assert/strict'),harness=require('./test-screenshot-transfer.cjs'),C=require('./dist/screen-capture.js');
const flush=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setImmediate(resolve));assert(predicate(),'Capture completed the expected stage');};
function fixture(){
  const urls=new Map(),trace={requests:0,draws:0},pending={};let runtime,id=0,decode=()=>Promise.resolve();
  const track=new EventTarget();track.readyState='live';track.stop=()=>{track.readyState='ended';};track.getSettings=()=>({width:1919,height:1079});
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const h=harness(new Map(),{screenCapture:{supported:()=>C.supported(runtime),createSession:options=>C.createSession({...options,env:runtime})},setupRuntime:(context,Element)=>{
    runtime=context;
    class LocalURL extends URL{static createObjectURL(blob){const url='blob:capture-'+(++id);urls.set(url,blob);return url;}static revokeObjectURL(url){urls.delete(url);}}
    Object.assign(context,{isSecureContext:true,Blob,DOMException,setTimeout,clearTimeout,URL:LocalURL,
      navigator:{mediaDevices:{getSupportedConstraints:()=>({width:true,height:true,frameRate:true}),getDisplayMedia:async()=>{trace.requests++;return stream;}}},
      Image:class{constructor(){this.naturalWidth=1919;this.naturalHeight=1079;}decode(){return decode();}}
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
  return {h,trace,urls,pending,track,setDecode:value=>{decode=value;}};
}
(async()=>{
  const {h,trace,urls,track,setDecode}=fixture();
  h.fire('ocr-capture');await flush(()=>/Snapshot captured/.test(h.node('ocr-capture-status').textContent));
  assert.equal(h.node('ocr-workspace').hidden,false);assert.match(h.node('ocr-file-name').textContent,/Screen capture.png/);
  assert.match(h.node('ocr-capture-status').textContent,/cannot verify the source type/);assert.equal(h.node('ocr-capture-error').hidden,true);assert.equal(h.node('ocr-capture').disabled,false);
  assert.equal(trace.requests,1);assert.equal(track.readyState,'live');assert.equal(urls.size,1,'Only the current preview URL remains');
  // Run the real capture -> decode -> preview path without a File constructor.
  h.fire('ocr-capture');await flush(()=>!h.node('ocr-capture').disabled);assert.equal(trace.requests,1);assert.equal(urls.size,1);
  const previous=h.node('ocr-image').src;h.node('ocr-review-form').hidden=false;h.node('ocr-value-hp').value='441';
  setDecode(()=>Promise.reject(new Error('Test image decode failed')));h.fire('ocr-capture');await flush(()=>!h.node('ocr-capture').disabled);
  assert.equal(h.node('ocr-capture-error').hidden,false);assert.match(h.node('ocr-capture-error').textContent,/Test image decode failed/);
  assert.equal(h.node('ocr-image').src,previous);assert.equal(h.node('ocr-review-form').hidden,false);assert.equal(h.node('ocr-value-hp').value,'441');assert.equal(urls.size,1,'Failed replacement releases its URL and keeps the previous preview');
  setDecode(()=>Promise.resolve());h.fire('ocr-capture');await flush(()=>!h.node('ocr-capture').disabled);assert.equal(h.node('ocr-capture-error').hidden,true);assert.match(h.node('ocr-capture-status').textContent,/Snapshot captured/);
  let finish;setDecode(()=>new Promise(resolve=>{finish=resolve;}));h.fire('ocr-capture');await flush(()=>!!finish);h.fire('ocr-close');finish();await flush(()=>urls.size===0);
  assert.equal(h.node('ocr-workspace').hidden,true,'Closing during decode cannot reopen the preview');assert.equal(h.node('screenshot-dialog').open,false);h.windowEvent({type:'pagehide'});assert.equal(track.readyState,'ended');
  console.log('Passed: Firefox-like real media session through actual Capture screen handler, retained snapshots, Blob preview without File, visible post-grant errors, previous-image/review preservation, retry and close-during-decode cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
