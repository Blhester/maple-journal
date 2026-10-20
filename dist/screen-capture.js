(function(root,factory){const api=factory();root.MapleScreenCapture=api;if(typeof module!=='undefined')module.exports=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const abortError=()=>new DOMException('Capture cancelled.','AbortError');
  function supported(env=globalThis){return !!env.isSecureContext&&typeof env.navigator?.mediaDevices?.getDisplayMedia==='function';}
  function stopTracks(stream){for(const track of stream?.getTracks()||[])if(track.readyState!=='ended')track.stop();}
  function wait(promise,signal){
    if(signal.aborted){Promise.resolve(promise).catch(()=>{});return Promise.reject(signal.reason||abortError());}
    return new Promise((resolve,reject)=>{const abort=()=>{cleanup();reject(signal.reason||abortError());},cleanup=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});});
  }
  // Request from a click handler: a browser-owned chooser is required for every snapshot.
  async function capture({signal,env=globalThis}={}){
    if(!supported(env))throw new Error('Screen capture is unavailable here. Open grindjournal.com in a desktop browser over HTTPS, or upload a screenshot.');
    if(signal?.aborted)throw signal.reason||abortError();
    const controller=new AbortController(),abort=()=>controller.abort(signal?.reason||abortError());signal?.addEventListener('abort',abort,{once:true});
    let stream,video,canvas,timer,finished=false,trackEnded;
    try{
      // Audio is never requested. The window hint does not restrict the browser's chooser.
      const request=env.navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'window'},audio:false,selfBrowserSurface:'exclude'});
      Promise.resolve(request).then(lateStream=>{if(finished||controller.signal.aborted)stopTracks(lateStream);},()=>{});
      stream=await wait(request,controller.signal);if(controller.signal.aborted)throw controller.signal.reason;
      const track=stream.getVideoTracks()[0];if(!track||track.readyState==='ended')throw new Error('The selected screen is no longer available. Try another window or upload.');
      trackEnded=()=>controller.abort(new Error('Screen sharing stopped before a snapshot was ready. Try again or upload.'));track.addEventListener('ended',trackEnded,{once:true});
      timer=setTimeout(()=>controller.abort(new Error('The selected window did not provide a frame. Keep the game visible and try again, or upload a screenshot.')),15000);
      video=env.document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;
      await wait(video.play(),controller.signal);
      if(video.readyState<2)await wait(new Promise((resolve,reject)=>{const ready=()=>{cleanup();resolve();},failed=()=>{cleanup();reject(new Error('The browser could not read this window.'));},cleanup=()=>{video.removeEventListener('loadeddata',ready);video.removeEventListener('error',failed);controller.signal.removeEventListener('abort',cleanup);};video.addEventListener('loadeddata',ready,{once:true});video.addEventListener('error',failed,{once:true});controller.signal.addEventListener('abort',cleanup,{once:true});}),controller.signal);
      const width=video.videoWidth,height=video.videoHeight;
      if(width<320||height<200||width*height>24000000)throw new Error('Choose a window between 320 × 200 and 24 megapixels, or upload a smaller screenshot.');
      canvas=env.document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw new Error('The browser could not create a snapshot. Upload a screenshot instead.');context.drawImage(video,0,0,width,height);
      const blob=await wait(new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('The snapshot could not be encoded. Try uploading instead.')),'image/png')),controller.signal);
      if(blob.size>15*1024*1024)throw new Error('The snapshot exceeds 15 MB. Choose a smaller window or upload a smaller screenshot.');
      return blob;
    }finally{
      finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);const track=stream?.getVideoTracks()[0];if(track&&trackEnded)track.removeEventListener('ended',trackEnded);stopTracks(stream);
      if(video){video.pause();video.srcObject=null;video.remove();}if(canvas)canvas.width=canvas.height=1;
    }
  }
  return {supported,capture};
});
