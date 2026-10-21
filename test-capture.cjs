'use strict';
const assert=require('node:assert/strict'),C=require('./dist/screen-capture.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async predicate=>{for(let i=0;i<30&&!predicate();i++)await Promise.resolve();assert(predicate(),'Capture reached the expected media stage');};
function fixture(settings={}){
  const trace={requests:[],draws:0,paused:false},track=new EventTarget(),extra=new EventTarget();for(const item of [track,extra]){item.readyState='live';item.stop=()=>{item.readyState='ended';};}
  const stream={getTracks:()=>[track,extra],getVideoTracks:()=>[track]},video=new EventTarget();Object.assign(video,{readyState:settings.waitForFrame?0:2,videoWidth:settings.width||1919,videoHeight:1079,play:()=>Promise.resolve(),pause:()=>{trace.paused=true;},remove:()=>{}});
  const canvas={getContext:()=>({drawImage:()=>{trace.draws++;}}),toBlob:callback=>{trace.encode=callback;if(!settings.deferEncode)callback(settings.failEncode?null:new Blob(['snapshot'],{type:'image/png'}));}};
  const env={isSecureContext:true,navigator:{mediaDevices:{getDisplayMedia:options=>{trace.requests.push(options);return settings.request||Promise.resolve(stream);}}},document:{createElement:name=>name==='video'?video:canvas}};
  return {env,trace,stream,track,extra,video,canvas};
}
(async()=>{
  assert.equal(C.supported({isSecureContext:false}),false);assert.equal(C.supported({isSecureContext:true,navigator:{}}),false);
  await assert.rejects(C.capture({env:{isSecureContext:false}}),/unavailable/);
  const ok=fixture(),blob=await C.capture({env:ok.env});assert.equal(blob.type,'image/png');assert.equal(ok.trace.requests[0].audio,false);assert.equal(ok.trace.requests[0].video.displaySurface,'window');assert.equal(ok.trace.draws,1);assert.equal(ok.track.readyState,'ended');assert.equal(ok.extra.readyState,'ended');assert.equal(ok.video.srcObject,null);assert.equal(ok.trace.paused,true);assert.equal(ok.canvas.width,1);
  const denied=fixture({request:Promise.reject(new DOMException('Denied','NotAllowedError'))});await assert.rejects(C.capture({env:denied.env}),{name:'NotAllowedError'});
  const late=deferred(),cancelled=fixture({request:late.promise}),controller=new AbortController(),pending=C.capture({env:cancelled.env,signal:controller.signal});controller.abort();await assert.rejects(pending,{name:'AbortError'});late.resolve(cancelled.stream);await flush(()=>cancelled.track.readyState==='ended');assert.equal(cancelled.extra.readyState,'ended');assert.equal(cancelled.trace.draws,0);
  const ended=fixture({waitForFrame:true}),reading=C.capture({env:ended.env});await flush(()=>ended.video.srcObject===ended.stream);ended.track.readyState='ended';ended.track.dispatchEvent(new Event('ended'));await assert.rejects(reading,/stopped before/);assert.equal(ended.extra.readyState,'ended');assert.equal(ended.trace.draws,0);
  const encoding=fixture({deferEncode:true}),abortEncode=new AbortController(),encodingResult=C.capture({env:encoding.env,signal:abortEncode.signal});await flush(()=>!!encoding.trace.encode);abortEncode.abort();await assert.rejects(encodingResult,{name:'AbortError'});assert.equal(encoding.track.readyState,'ended');encoding.trace.encode(new Blob(['late image']));
  for(const settings of [{failEncode:true},{width:100},{width:30000}]){const failed=fixture(settings);await assert.rejects(C.capture({env:failed.env}));assert.equal(failed.track.readyState,'ended');assert.equal(failed.extra.readyState,'ended');assert.equal(failed.video.srcObject,null);}
  const already=fixture(),before=new AbortController();before.abort();await assert.rejects(C.capture({env:already.env,signal:before.signal}),{name:'AbortError'});assert.equal(already.trace.requests.length,0);
  const loaded=fixture({waitForFrame:true}),loading=C.capture({env:loaded.env});await flush(()=>loaded.video.srcObject===loaded.stream);loaded.video.readyState=2;loaded.video.dispatchEvent(new Event('loadeddata'));assert.equal((await loading).type,'image/png');assert.equal(loaded.trace.draws,1);
  const large=fixture({deferEncode:true}),largeResult=C.capture({env:large.env});await flush(()=>!!large.trace.encode);large.trace.encode({type:'image/png',size:15*1024*1024+1});await assert.rejects(largeResult,/15 MB/);assert.equal(large.track.readyState,'ended');
  console.log('Passed: one-frame screen capture, no audio request, permission denial, cancellation with late grants, source-ended/encoding failures, dimension limits, and track/video cleanup.');

  const reused=fixture(),changes=[],session=C.createSession({env:reused.env,onChange:active=>changes.push(active)});
  assert.equal(session.active(),false);
  assert.equal((await session.capture()).type,'image/png');assert.equal(session.active(),true);
  assert.equal(reused.track.readyState,'live');assert.equal(reused.extra.readyState,'live');
  assert.equal(reused.video.srcObject,null,'A retained stream does not retain the temporary video');
  assert.equal(reused.canvas.width,1,'Pixel buffers are released after each snapshot');
  await session.capture();await session.capture();
  assert.equal(reused.trace.requests.length,1,'Three snapshots request one source chooser');assert.equal(reused.trace.draws,3);assert.equal(reused.trace.requests[0].audio,false);
  session.stop();assert.equal(session.active(),false);assert.equal(reused.track.readyState,'ended');assert.equal(reused.extra.readyState,'ended');assert.equal(changes.at(-1),false);
  const replacement=fixture();reused.env.navigator.mediaDevices.getDisplayMedia=options=>{reused.trace.requests.push(options);return Promise.resolve(replacement.stream);};
  await session.capture();assert.equal(reused.trace.requests.length,2,'After Stop sharing the chooser is required again');assert.equal(session.active(),true);session.stop();assert.equal(replacement.track.readyState,'ended');

  const idle=fixture(),idleSession=C.createSession({env:idle.env});await idleSession.capture();idle.track.readyState='ended';idle.track.dispatchEvent(new Event('ended'));
  assert.equal(idleSession.active(),false,'Browser Stop sharing disconnects an idle source');assert.equal(idle.extra.readyState,'ended');
  const switched=fixture();idle.env.navigator.mediaDevices.getDisplayMedia=options=>{idle.trace.requests.push(options);return Promise.resolve(switched.stream);};
  await idleSession.capture();assert.equal(idle.trace.requests.length,2,'A source ended by the browser must be selected again');idleSession.stop();

  const granting=deferred(),lateSessionFixture=fixture({request:granting.promise}),lateSession=C.createSession({env:lateSessionFixture.env});
  const permission=lateSession.capture();await assert.rejects(lateSession.capture(),/already in progress/);lateSession.stop();await assert.rejects(permission,{name:'AbortError'});
  granting.resolve(lateSessionFixture.stream);await flush(()=>lateSessionFixture.track.readyState==='ended');assert.equal(lateSessionFixture.extra.readyState,'ended');assert.equal(lateSession.active(),false);

  const stoppedFrame=fixture({waitForFrame:true}),stoppedSession=C.createSession({env:stoppedFrame.env}),frame=stoppedSession.capture();
  await flush(()=>stoppedFrame.video.srcObject===stoppedFrame.stream);stoppedSession.stop();await assert.rejects(frame,{name:'AbortError'});assert.equal(stoppedFrame.trace.draws,0);assert.equal(stoppedFrame.video.srcObject,null);

  const failedSessionFixture=fixture({failEncode:true}),failedSession=C.createSession({env:failedSessionFixture.env});await assert.rejects(failedSession.capture(),/encoded/);assert.equal(failedSession.active(),false);assert.equal(failedSessionFixture.track.readyState,'ended');
  console.log('Passed: retained source reuse (one chooser for three snapshots), frame buffer cleanup, explicit Stop/change source, browser-ended tracks, fresh selection after disconnection, duplicate capture protection, pending chooser cancellation, late grants and failed-frame cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
