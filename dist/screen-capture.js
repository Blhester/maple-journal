(function(root,factory){const api=factory();root.MapleScreenCapture=api;if(typeof module!=='undefined')module.exports=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const abortError=()=>new DOMException('Capture cancelled.','AbortError');
  function supported(env=globalThis){return !!env.isSecureContext&&typeof env.navigator?.mediaDevices?.getDisplayMedia==='function';}
  function stopTracks(stream){for(const track of stream?.getTracks()||[])if(track.readyState!=='ended')track.stop();}
  function requireMonitor(stream){if(stream?.getVideoTracks()[0]?.getSettings?.()?.displaySurface!=='monitor'){const error=new Error('Choose an Entire screen / monitor. Window and browser-tab capture are not supported.');error.name='CaptureSourceError';throw error;}}
  function wait(promise,signal){
    if(signal.aborted){Promise.resolve(promise).catch(()=>{});return Promise.reject(signal.reason||abortError());}
    return new Promise((resolve,reject)=>{const abort=()=>{cleanup();reject(signal.reason||abortError());},cleanup=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});});
  }
  // Retain only the user-granted stream, never screenshot pixels or permission.
  // Reopening the chooser is necessary once the stream ends or the page reloads.
  function createSession({env=globalThis,onChange=()=>{}}={}){
    let stream=null,operation=null,trackEnded=null;
    const active=()=>!!stream&&stream.getVideoTracks()[0]?.readyState==='live';
    function release(){
      const previous=stream;stream=null;
      if(previous&&trackEnded)previous.getVideoTracks()[0]?.removeEventListener('ended',trackEnded);
      trackEnded=null;stopTracks(previous);onChange(false);
    }
    function stop(){operation?.abort(abortError());release();}
    async function capture({signal,allowPrompt=true}={}){
      if(!supported(env))throw new Error('Screen capture is unavailable here. Open grindjournal.com in a desktop browser over HTTPS, or upload a screenshot.');
      if(signal?.aborted)throw signal.reason||abortError();
      if(operation)throw new Error('A snapshot is already in progress.');
      const controller=new AbortController(),abort=()=>controller.abort(signal?.reason||abortError());signal?.addEventListener('abort',abort,{once:true});
      operation=controller;let video,canvas,timer;
      try{
        if(!active()){
          release();
          if(!allowPrompt){const error=new Error('Screen sharing disconnected. Turn automatic screenshots on again to select a monitor.');error.name='CaptureSourceError';throw error;}
          // The chooser cannot be restricted by this hint. Validate the actual
          // selected track below; window and browser-tab sources are rejected.
          const request=env.navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'monitor',frameRate:{ideal:1,max:1}},audio:false,selfBrowserSurface:'exclude',monitorTypeSurfaces:'include',surfaceSwitching:'exclude',systemAudio:'exclude'});
          Promise.resolve(request).then(lateStream=>{if(operation!==controller||controller.signal.aborted)stopTracks(lateStream);},()=>{});
          stream=await wait(request,controller.signal);if(controller.signal.aborted)throw controller.signal.reason;
          const track=stream.getVideoTracks()[0];if(!track||track.readyState==='ended')throw new Error('The selected screen is no longer available. Choose a monitor or upload.');
          requireMonitor(stream);
          trackEnded=()=>{operation?.abort(new Error('Screen sharing stopped before a snapshot was ready. Select a source again or upload.'));release();};track.addEventListener('ended',trackEnded,{once:true});
          onChange(true);
        }
        requireMonitor(stream);
        timer=setTimeout(()=>controller.abort(new Error('The selected screen did not provide a frame. Keep the game visible and try again, or upload a screenshot.')),15000);
        video=env.document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;
        await wait(video.play(),controller.signal);
        if(video.readyState<2)await wait(new Promise((resolve,reject)=>{const ready=()=>{cleanup();resolve();},failed=()=>{cleanup();reject(new Error('The browser could not read this screen.'));},cleanup=()=>{video.removeEventListener('loadeddata',ready);video.removeEventListener('error',failed);controller.signal.removeEventListener('abort',cleanup);};video.addEventListener('loadeddata',ready,{once:true});video.addEventListener('error',failed,{once:true});controller.signal.addEventListener('abort',cleanup,{once:true});}),controller.signal);
        const width=video.videoWidth,height=video.videoHeight;
        if(width<320||height<200||width*height>24000000)throw new Error('Choose a screen between 320 × 200 and 24 megapixels, or upload a smaller screenshot.');
        requireMonitor(stream);
        canvas=env.document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw new Error('The browser could not create a snapshot. Upload a screenshot instead.');context.drawImage(video,0,0,width,height);
        const blob=await wait(new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('The snapshot could not be encoded. Try uploading instead.')),'image/png')),controller.signal);
        if(blob.size>15*1024*1024)throw new Error('The snapshot exceeds 15 MB. Choose a smaller screen or upload a smaller screenshot.');
        return blob;
      }catch(error){
        release();throw error;
      }finally{
        clearTimeout(timer);signal?.removeEventListener('abort',abort);if(operation===controller)operation=null;
        if(video){video.pause();video.srcObject=null;video.remove();}if(canvas)canvas.width=canvas.height=1;
      }
    }
    return {capture,stop,active};
  }
  // Keep one-shot capture available for callers that do not need a connection.
  async function capture({signal,env=globalThis}={}){
    const session=createSession({env});try{return await session.capture({signal});}finally{session.stop();}
  }
  return {supported,capture,createSession};
});
