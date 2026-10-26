(() => {
  'use strict';
  const $=id=>document.getElementById(id),C=MapleOcrCore,layoutKey='maple-journal-ocr-regions-v2',legacyLayoutKey='maple-journal-ocr-regions-v1',tuningKey='maple-journal-ocr-tuning-v1',tuningKeys=['reader','mode','contrast','brightness','threshold','chroma','scale','invert'];
  let options,context,image=null,regions=structuredClone(C.defaults),busy=false,worker=null,run=0,objectUrl=null,drag=null;
  let libraryPromise=null,workerUrls=[],tunings={},digitCancel=null,captureController=null,captureSession=null,captureWasActive=false,readCanvases=new Set();
  function paintCaptureConnection(){
    const active=!!captureSession?.active();
    $('ocr-capture').textContent=active?'Capture snapshot':'Capture screen';
    $('ocr-capture-change').hidden=!active;$('ocr-capture-change').disabled=busy;
    $('ocr-capture-stop').hidden=!active;$('capture-sharing-bar').hidden=!active;
    if(captureWasActive&&!active){$('ocr-capture-status').textContent='The selected screen disconnected. Capture screen lets you select a monitor again.';options?.onCaptureEnded?.();}
    captureWasActive=active;
  }
  function stopSharing(){
    if(captureController)stop();captureSession?.stop();paintCaptureConnection();
    $('ocr-capture-status').textContent='Screen sharing stopped. Capture screen will let you choose a monitor again.';
  }
  const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;};
  function error(id,message){$(id).textContent=message||'';$(id).hidden=!message;}
  const expOnly=()=>options?.getContext().expOnly===true;
  const activeFields=()=>C.fields.filter(field=>(!expOnly()||['level','exp'].includes(field.id))&&(!window.MapleUseSlots?.ready()||!['hp','mp'].includes(field.id))&&(context.stage==='setup'||!['map','class'].includes(field.id)));
  function svg(tag,attrs){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))e.setAttribute(key,value);return e;}
  function drawGuide(){
    for(const [index,field]of C.fields.entries()){
      const r=C.defaults[field.id],x=r.x*1919,y=r.y*1079,w=r.w*1919,h=r.h*1079;
      const box=svg('rect',{x:x-4,y:y-4,width:w+8,height:h+8,rx:4,class:'ocr-guide-box'});
      const cx=x+w/2,cy=Math.max(17,y-20),circle=svg('circle',{cx,cy,r:15,class:'ocr-guide-number'}),label=svg('text',{x:cx,y:cy+5,'text-anchor':'middle'});label.textContent=index+1;
      $('ocr-guide-overlay').append(box,circle,label);
    }
  }
  function sourceRegion(id){
    const r=C.region(regions[id]),x=Math.round(r.x*image.naturalWidth),y=Math.round(r.y*image.naturalHeight);
    return {x,y,w:Math.max(1,Math.min(image.naturalWidth-x,Math.round(r.w*image.naturalWidth))),h:Math.max(1,Math.min(image.naturalHeight-y,Math.round(r.h*image.naturalHeight)))};
  }
  function crop(id,treatment='original'){
    const r=sourceRegion(id),scale=C.scaleFor(r.w,r.h,['class','mesos'].includes(id)?4:5),pad=12,canvas=document.createElement('canvas');canvas.width=Math.round(r.w*scale)+pad*2;canvas.height=Math.round(r.h*scale)+pad*2;
    const small=document.createElement('canvas');small.width=r.w;small.height=r.h;const smallCtx=small.getContext('2d',{willReadFrequently:true});smallCtx.drawImage(image,r.x,r.y,r.w,r.h,0,0,r.w,r.h);
    if(treatment!=='original'){
      const pixels=smallCtx.getImageData(0,0,r.w,r.h),d=pixels.data;
      for(let i=0;i<d.length;i+=4){const [red,green,blue]=[d[i],d[i+1],d[i+2]];let value;
        if(treatment==='orange')value=red>180&&green>75&&blue<100?0:255;
        else if(treatment==='white')value=Math.min(red,green,blue)>190?0:255;
        else if(treatment==='dark')value=(red+green+blue)/3<140?0:255;
        else if(treatment==='neutral')value=Math.min(red,green,blue)>145&&Math.max(red,green,blue)-Math.min(red,green,blue)<45?0:255;
        else value=Math.round(red*.299+green*.587+blue*.114);
        d[i]=d[i+1]=d[i+2]=value;d[i+3]=255;
      }smallCtx.putImageData(pixels,0,0);
    }
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=treatment==='original';ctx.drawImage(small,pad,pad,r.w*scale,r.h*scale);small.width=small.height=1;return canvas;
  }
  function processedCrop(id){
    const r=sourceRegion(id),settings=C.tuning(id,tunings[id]),canvas=document.createElement('canvas'),pad=16,scale=C.scaleFor(r.w,r.h,settings.scale);
    // Scale before filtering so the threshold can preserve antialiased strokes.
    const enlarged=document.createElement('canvas');enlarged.width=Math.max(1,Math.round(r.w*scale));enlarged.height=Math.max(1,Math.round(r.h*scale));const ctx=enlarged.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,r.x,r.y,r.w,r.h,0,0,enlarged.width,enlarged.height);
    const pixels=ctx.getImageData(0,0,enlarged.width,enlarged.height);pixels.data.set(C.processPixels(pixels.data,settings));ctx.putImageData(pixels,0,0);
    canvas.width=enlarged.width+pad*2;canvas.height=enlarged.height+pad*2;const out=canvas.getContext('2d');out.fillStyle=settings.invert?'#000':'#fff';out.fillRect(0,0,canvas.width,canvas.height);out.drawImage(enlarged,pad,pad);enlarged.width=enlarged.height=1;return canvas;
  }
  function paintTuning(){
    if(!image)return;const id=$('ocr-region-field').value;if(!C.fields.some(field=>field.id===id))return;const settings=C.tuning(id,tunings[id]);
    const numeric=C.fields.find(field=>field.id===id).numeric,fontReader=settings.reader!=='general';
    $('ocr-reader-wrap').hidden=false;$('ocr-general-controls').hidden=fontReader;
    $('ocr-reader-exp').disabled=!numeric;$('ocr-reader-quantity').disabled=!numeric;
    $('ocr-reader-help').textContent=id==='exp'?(settings.reader==='quantity-font'?'The potion template cannot read EXP percentages. Choose Classic EXP digits or General text OCR.':'Read the EXP percentage, including its decimal point and % sign. The complete EXP bar can be included; clipped absolute totals are ignored. A level is required to estimate within-level EXP. '+(settings.reader==='exp-font'?'The Classic template uses original pixels; image sliders do not affect it.':'Image settings below apply to the percentage OCR.')):!numeric?'Map and class names need letters. General text OCR reads these fields; the available Classic font templates contain digits only.':settings.reader==='exp-font'?'Matches the Classic EXP display font from the original crop, including scaled digits and thousands separators. Keep the full number visible. This template may not match level or mesos fonts; use General text OCR if it stays blank. Image sliders are not used by font matching.':settings.reader==='quantity-font'?'Matches the Classic potion quantity font, including its outline and blue shading, from the original crop. Keep the full number visible. This template may not match other HUD fonts; use General text OCR if it stays blank. Image sliders are not used by font matching.':'Use image settings below for text OCR, or try either Classic digit template when the selected number uses that font. Reader and image settings can be remembered separately for each field.';
    for(const key of tuningKeys){const control=$('ocr-tune-'+key);if(key==='invert')control.checked=settings[key];else control.value=String(settings[key]);if($('ocr-out-'+key))$('ocr-out-'+key).textContent=settings[key]+(key==='contrast'?'×':'');}
    $('ocr-tune-chroma').disabled=busy||settings.mode!=='neutral';$('ocr-tune-threshold').disabled=busy||settings.mode==='gray';
    const canvas=$('ocr-processed');if(fontReader){canvas.width=canvas.height=1;return;}const source=processedCrop(id);canvas.width=source.width;canvas.height=source.height;canvas.getContext('2d').drawImage(source,0,0);source.width=source.height=1;
  }
  function paintRegion(){
    if(!image)return;const id=$('ocr-region-field').value,r=regions[id],overlay=$('ocr-region-overlay');
    overlay.setAttribute('viewBox','0 0 '+image.naturalWidth+' '+image.naturalHeight);overlay.replaceChildren(svg('rect',{x:r.x*image.naturalWidth,y:r.y*image.naturalHeight,width:r.w*image.naturalWidth,height:r.h*image.naturalHeight,class:'ocr-active-box'}));
    for(const key of ['x','y','w','h'])$('ocr-region-'+key).value=String(Math.round(r[key]*10000)/100);
    const canvas=$('ocr-crop'),source=crop(id);canvas.width=source.width;canvas.height=source.height;canvas.getContext('2d').drawImage(source,0,0);
    $('ocr-crop-label').textContent=C.fields.find(field=>field.id===id).label+' · enlarged preview';
    paintTuning();
  }
  function invalidateReview(id){
    if(id){const row=$('ocr-review-'+id);if(row){$('ocr-use-'+id).checked=false;row.querySelector('.ocr-review-note').textContent='Image settings changed. Re-read this field or edit its value to include it.';}return;}
    $('ocr-review-form').hidden=true;$('ocr-empty-review').hidden=false;$('ocr-empty-review').textContent='The image or read region changed. Read the screenshot again to update the suggestions.';
  }
  function restoreReview(){if(!$('ocr-review-fields').children.length)return false;$('ocr-review-form').hidden=false;$('ocr-empty-review').hidden=true;return true;}
  function setBusy(value){
    busy=value;$('ocr-progress-wrap').hidden=!value;
    for(const id of ['ocr-read','ocr-read-field','ocr-reset-tuning','ocr-file','ocr-capture','ocr-capture-change','ocr-example','ocr-region-field','ocr-save-layout','ocr-reset-layout','ocr-apply',...['x','y','w','h'].map(k=>'ocr-region-'+k),...tuningKeys.map(k=>'ocr-tune-'+k)])$(id).disabled=value;
    for(const button of $('ocr-review-fields').querySelectorAll('button'))button.disabled=value||button.dataset.unsupported==='true';
    MaplePotionPicker.setBusy($('ocr-review-fields'),value);
    if(!value&&image)paintTuning();
    $('ocr-region-overlay').classList.toggle('ocr-reading',value);
  }
  function releaseReadCanvases(){for(const canvas of readCanvases)canvas.width=canvas.height=1;readCanvases.clear();}
  function stop(){
    releaseReadCanvases();
    run++;if(captureController){captureController.abort();captureController=null;}$('ocr-capture-cancel').hidden=true;if(digitCancel)digitCancel();if(worker){void worker.terminate();worker=null;}for(const url of workerUrls)URL.revokeObjectURL(url);workerUrls=[];setBusy(false);
  }
  async function captureScreen({changeSource=false}={}){
    if(busy||captureController)return;error('ocr-error','');error('ocr-capture-error','');
    if(!MapleScreenCapture.supported()){$('ocr-capture-status').textContent='Screen capture is unavailable in this browser. Open grindjournal.com in desktop Chrome or Edge over HTTPS, or choose a screenshot file.';return;}
    if(changeSource)captureSession.stop();
    stop();const controller=new AbortController();captureController=controller;setBusy(true);$('ocr-progress-wrap').hidden=true;$('ocr-capture-cancel').hidden=false;$('ocr-capture-status').textContent=captureSession.active()?'Taking a snapshot of your selected screen…':'Choose Entire screen / Screen 1 / Screen 2 containing MapleStory in the browser’s share picker. It stays connected for later snapshots until you stop sharing or leave this page.';
    let shouldRead=false;
    try{
      const blob=await captureSession.capture({signal:controller.signal});if(captureController!==controller)return;
      const loaded=await loadImage(blob,{name:'Screen capture.png',signal:controller.signal});
      if(loaded&&captureController===controller&&$('screenshot-dialog').open){shouldRead=true;$('ocr-capture-status').textContent='Snapshot captured. Reading values automatically; review them before applying. Click Capture snapshot for another image from the same source. Sharing stays on until you stop it; no audio or recording.'+(captureSession.sourceVerified?.()===false?' Your browser cannot verify the source type. Choose Screen 1 or Screen 2 when sharing, rather than a window.':'');}
    }catch(e){if(captureController===controller){
      const cancelled=['NotAllowedError','AbortError'].includes(e.name),message=cancelled?'Capture was cancelled or permission was denied. Your previous screenshot and reviewed values were kept. You can retry or upload instead.':['NotSupportedError','SecurityError'].includes(e.name)?'Screen capture is blocked or unsupported in this browser. Try another desktop browser, or upload a screenshot.':(e.message||'The snapshot could not be opened.')+' Try again or upload a screenshot.';
      $('ocr-capture-status').textContent=message;error('ocr-capture-error',cancelled?'':message);
    }}
    finally{if(captureController===controller){captureController=null;$('ocr-capture-cancel').hidden=true;setBusy(false);}paintCaptureConnection();}
    // Release capture's busy state before handing the decoded image to OCR.
    // A cancelled/failed decode must never re-read the previous screenshot.
    if(shouldRead&&!controller.signal.aborted&&$('screenshot-dialog').open)await read();
  }
  function readDigits(id,choice,box=null,source=image,allowComplete=false){
    const exp=choice==='exp-font',r=box||C.digitRegion(sourceRegion(id),image.naturalWidth,image.naturalHeight,id==='exp'&&exp?'exp-percent':choice),scale=Math.min(1,(exp?512:96)/r.w,(exp?64:32)/r.h),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(r.w*scale));canvas.height=Math.max(1,Math.round(r.h*scale));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,r.x,r.y,r.w,r.h,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);canvas.width=canvas.height=1;
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(new Blob([(exp?MapleExpReader:MapleQuantityReader).workerSource()],{type:'text/javascript'}));let reader;
      const cleanup=()=>{reader?.terminate();URL.revokeObjectURL(url);if(digitCancel===cancel)digitCancel=null;};
      const cancel=()=>{cleanup();reject(new Error('Reading cancelled.'));};digitCancel=cancel;
      try{reader=new Worker(url);reader.onmessage=event=>{cleanup();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.result);};reader.onerror=()=>{cleanup();reject(new Error('The local number reader could not run.'));};reader.postMessage({data:pixels.data,width:pixels.width,height:pixels.height,format:id==='exp'?'percent':'amount',allowComplete},[pixels.data.buffer]);}catch(e){cleanup();reject(e);}
    });
  }
  async function readUseQuantity(source,r,settings,countRegion){
    if(!r)return {value:null};const width=source.naturalWidth,height=source.naturalHeight,x=Math.max(0,Math.floor(r.x*width)),y=Math.max(0,Math.floor((r.y+r.h*.48)*height)),w=Math.min(width-x,Math.ceil(r.w*width)),h=Math.min(height-y,Math.ceil(r.h*height*.46)),box=countRegion?C.digitRegion({x:Math.round(countRegion.x*width),y:Math.round(countRegion.y*height),w:Math.round(countRegion.w*width),h:Math.round(countRegion.h*height)},width,height,'quantity-font'):C.slotCountRegion(r,width,height),tuning=C.tuning('hp',settings||{});
    if(tuning.reader!=='general')return readDigits('hp',tuning.reader,box,source);
    const token=run,ownWorker=!worker;let surface;
    try{
      if(!worker){await loadLibrary();if(token!==run)throw Error('Reading cancelled.');worker=await Tesseract.createWorker('eng',1,workerOptions(()=>{}));}
      surface=document.createElement('canvas');surface.width=box.w*tuning.scale+24;surface.height=box.h*tuning.scale+24;const ctx=surface.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,surface.width,surface.height);ctx.drawImage(source,box.x,box.y,box.w,box.h,12,12,box.w*tuning.scale,box.h*tuning.scale);const p=ctx.getImageData(0,0,surface.width,surface.height);p.data.set(C.processPixels(p.data,tuning));ctx.putImageData(p,0,0);const reads=[];
      for(const mode of ['8','7','13']){if(token!==run)throw Error('Reading cancelled.');await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:'0123456789',user_defined_dpi:'300'});const {data}=await worker.recognize(surface);reads.push({text:data.text,confidence:data.confidence});}return C.select('hp',reads);
    }finally{if(surface)surface.width=surface.height=1;if(ownWorker&&worker){await worker.terminate();worker=null;for(const url of workerUrls)URL.revokeObjectURL(url);workerUrls=[];}}
  }
  function clearImage(){window.MapleEtcCapture?.mount(null);window.MapleUseSlots?.clearReview();if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;image=null;drag=null;$('ocr-image').removeAttribute('src');for(const id of ['ocr-crop','ocr-processed']){$(id).width=1;$(id).height=1;}$('ocr-region-overlay').replaceChildren();$('ocr-workspace').hidden=true;}
  async function loadImage(file,{name=file?.name||'Capture guide example',signal}={}){
    if(!signal)stop();error('ocr-error','');error('ocr-capture-error','');
    const token=run;let nextUrl=null;
    try{
      if(file&&(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024))throw new Error('Choose a PNG, JPG, or WebP smaller than 15 MB.');
      const img=new Image();if(file){nextUrl=URL.createObjectURL(file);img.src=nextUrl;}else img.src=$('ocr-guide').querySelector('img').src;
      await img.decode();if(token!==run||signal?.aborted)return false;if(img.naturalWidth<320||img.naturalHeight<200||img.naturalWidth*img.naturalHeight>24000000)throw new Error('Use a screenshot between 320 × 200 and 24 megapixels.');
      // Replace the previous image and review only after decoding succeeds.
      clearImage();invalidateReview();MaplePotionPicker.dispose($('ocr-review-fields'));$('ocr-review-fields').replaceChildren();$('ocr-field-status').textContent='';objectUrl=nextUrl;nextUrl=null;
      image=img;$('ocr-image').src=img.src;$('ocr-workspace').hidden=false;$('ocr-guide').open=false;$('ocr-file-name').textContent=name+' · '+img.naturalWidth+' × '+img.naturalHeight;paintRegion();
      $('ocr-empty-review').textContent='Check the regions, then read your screenshot. Each field remains editable before applying.';return true;
    }catch(e){if(token===run&&!signal?.aborted){if(signal)throw e;error('ocr-error','The image could not be opened. '+e.message);}return false;}
    finally{if(nextUrl)URL.revokeObjectURL(nextUrl);}
  }
  function loadLibrary(){
    if(window.Tesseract)return Promise.resolve();
    if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script'),embedded=$('ocr-offline-bundle');
      if(embedded){const data=JSON.parse(embedded.textContent);script.textContent=data.library;document.head.append(script);if(window.Tesseract)resolve();else reject(new Error('Embedded OCR runtime did not load.'));}
      else {script.src=new URL('vendor/ocr/tesseract.min.js',document.baseURI).href;script.onload=resolve;script.onerror=()=>reject(new Error('The local OCR files could not load. Try the hosted site or run the downloaded folder using a local web server.'));document.head.append(script);}
    }).catch(e=>{libraryPromise=null;throw e;});
    return libraryPromise;
  }
  function workerOptions(logger){
    const embedded=$('ocr-offline-bundle');
    if(embedded){
      const data=JSON.parse(embedded.textContent),languageUrl='https://grindjournal.invalid/local-ocr/eng.traineddata.gz';
      // This worker intercepts only its embedded language URL; it never transmits screenshots.
      const prelude='const bundledLanguage=Uint8Array.from(atob('+JSON.stringify(data.language)+'),c=>c.charCodeAt(0));const originalFetch=self.fetch.bind(self);self.fetch=(input,init)=>{const u=typeof input==="string"?input:input.url;return u==='+JSON.stringify(languageUrl)+'?Promise.resolve(new Response(bundledLanguage)):originalFetch(input,init);};\n';
      const workerUrl=URL.createObjectURL(new Blob([prelude,data.worker],{type:'text/javascript'})),coreUrl=URL.createObjectURL(new Blob([data.core],{type:'text/javascript'}));workerUrls.push(workerUrl,coreUrl);
      return {workerPath:workerUrl,corePath:coreUrl+'#core.js',langPath:'https://grindjournal.invalid/local-ocr',workerBlobURL:false,legacyCore:false,gzip:true,cacheMethod:'none',logger};
    }
    if(location.protocol==='file:')throw new Error('For screenshot reading, open the standalone download or serve this folder with node preview.cjs. Manual entry works directly from this file.');
    const base=new URL('vendor/ocr/',document.baseURI).href;
    return {workerPath:base+'worker.min.js',corePath:base,langPath:base,workerBlobURL:false,legacyCore:false,gzip:true,cacheMethod:'none',logger};
  }
  async function recognize(fields,token,{selectedOnly=false,background=false}={}){
    const results={};
    let currentField=0,currentPass=0,passCount=1;
    async function ensureTextWorker(){
      if(worker)return;
      await loadLibrary();if(token!==run)return;
      const created=await Tesseract.createWorker('eng',1,workerOptions(message=>{if(token===run&&message.status==='recognizing text')$('ocr-progress').value=Math.min(1,(currentField+(currentPass+(message.progress||0))/passCount)/fields.length);}));
      if(token!==run){await created.terminate();return;}worker=created;
    }
      for(const [index,field]of fields.entries()){
        if(token!==run)return;
        currentField=index;if(selectedOnly)tunings[field.id]=C.tuning(field.id,tunings[field.id]);
        $('ocr-progress-text').textContent='Reading '+field.label.toLowerCase()+' · '+(index+1)+' of '+fields.length;
        const readerChoice=C.tuning(field.id,tunings[field.id]).reader;
        if(readerChoice!=='general'){
          const result=await readDigits(field.id,readerChoice,null,image,background);if(token!==run)return;
          const level=results.level?.value??(!background?(selectedOnly&&$('ocr-use-level')?.checked?$('ocr-value-level').value:options.getContext().level):null);
          results[field.id]=field.id==='exp'?(background?{...result,percent:result.value,levelUsed:null,estimated:result.value!==null}:C.convertPercent(result,level)):{...result,value:C.parse(field.id,result.value)};
          $('ocr-progress').value=(index+1)/fields.length;continue;
        }
        await ensureTextWorker();if(token!==run)return;
        const variants=field.id==='map'?['white','gray']:field.id==='level'?['orange','white']:field.id==='exp'?['original','neutral']:field.id==='mesos'?['dark','gray']:['hp','mp'].includes(field.id)?['neutral','white','original']:['gray','original'];
        const reads=[];
        const enhanced=['map','class','level','mesos'].includes(field.id)||selectedOnly||Object.hasOwn(tunings,field.id),modes=field.numeric?['8','7','13']:field.id==='map'?['6','7']:['7','13'];
        const passes=enhanced?modes.map(mode=>({mode,label:'Adjusted image · '+(mode==='8'?'word':mode==='13'?'raw line':mode==='6'?'block':'line')})):variants.map(treatment=>({mode:field.id==='map'?'6':'7',treatment,label:treatment+' · line'}));
        passCount=passes.length;const prepared=enhanced?processedCrop(field.id):null;if(prepared)readCanvases.add(prepared);
        for(const [passIndex,pass]of passes.entries()){
          if(token!==run)return;
          currentPass=passIndex;
          await worker.setParameters({tessedit_pageseg_mode:pass.mode,tessedit_char_whitelist:field.id==='exp'?'0123456789.,[]()%':field.numeric?'0123456789.,':'',user_defined_dpi:'300'});
          const surface=prepared||crop(field.id,pass.treatment);readCanvases.add(surface);const {data}=await worker.recognize(surface);reads.push({text:data.text,confidence:data.confidence,label:pass.label});
        }
        const level=results.level?.value??(!background?(selectedOnly&&$('ocr-use-level')?.checked?$('ocr-value-level').value:options.getContext().level):null);
        if(field.id==='exp'){const result=C.selectPercent(reads,{allowComplete:background});results.exp=background?{...result,percent:result.value,levelUsed:null,estimated:result.value!==null}:C.convertPercent(result,level);}
        else results[field.id]=field.id==='map'?MapleMapMatcher.select(reads):C.select(field.id,reads);
      }
    if(!expOnly()&&!selectedOnly&&window.MapleUseSlots?.ready()){const rows=await MapleUseSlots.read(image,readUseQuantity,{match:!background,isCurrent:()=>token===run,onStatus:value=>{$('ocr-progress-text').textContent=value;}});if(token!==run)return;results.uses=rows;}
    if(!expOnly()&&!selectedOnly&&window.MapleEtcCapture){if(!background)$('ocr-progress-text').textContent='Reading visible ETC inventory · matching icons and stack counts…';results.etc=await MapleEtcCapture.read(image,readUseQuantity,{background,isCurrent:()=>token===run});if(token!==run)return;}
    return results;
  }
  async function read(selectedOnly=false){
    if(!image||busy||window.MapleUseSlots?.reading())return;const token=++run,fields=activeFields().filter(field=>!selectedOnly||field.id===$('ocr-region-field').value);error('ocr-error','');error('ocr-review-error','');if(!selectedOnly)invalidateReview();setBusy(true);$('ocr-progress').value=0;$('ocr-progress-text').textContent='Loading local text recognition…';$('ocr-field-status').textContent='';
    try{
      const results=await recognize(fields,token,{selectedOnly});
      if(token!==run)return;showReview(results,selectedOnly);$('ocr-progress-text').textContent='Reading complete. Review every value before applying.';if(selectedOnly)$('ocr-field-status').textContent=fields[0].label+' updated below. Other reviewed values were kept.';
    }catch(e){if(token===run){restoreReview();error('ocr-error','Screenshot reading could not finish. '+e.message+' You can continue with manual entry.');}}
    finally{if(token===run){if(worker)await worker.terminate();worker=null;releaseReadCanvases();for(const url of workerUrls)URL.revokeObjectURL(url);workerUrls=[];setBusy(false);}}
  }
  function syncExpEstimate(){
    const input=$('ocr-value-exp');if(!input?.dataset.percent)return;
    const levelInput=$('ocr-value-level'),levelUse=$('ocr-use-level'),level=(levelUse?.checked||levelUse?.disabled)?levelInput?.value:options.getContext().level;
    const value=C.percentExp(level,input.dataset.percent),wasEmpty=input.value==='';input.value=value??'';
    if(value===null)$('ocr-use-exp').checked=false;else if(wasEmpty)$('ocr-use-exp').checked=true;
    const note=$('ocr-review-exp')?.querySelector('.ocr-review-note');if(note)note.textContent=value===null?'Read '+input.dataset.percent+'%. Enter or select the correct level to estimate EXP, or type an EXP total manually.':'Estimated '+Number(value).toLocaleString('en-US')+' EXP from '+input.dataset.percent+'% at level '+level+'. The HUD shows two decimal places, so this is approximate. Edit the total if you know the exact EXP.';
  }
  function showReview(results,partial=false){
    const container=$('ocr-review-fields');if(!partial){MaplePotionPicker.dispose(container);container.replaceChildren();}
    for(const field of activeFields()){
      const previous=$('ocr-review-'+field.id);if(partial&&previous&&!results[field.id])continue;
      const result=results[field.id]||C.select(field.id,[]),row=text('div','','ocr-review-field'),header=text('div','','ocr-review-field-heading'),use=document.createElement('input'),label=document.createElement('label');row.id='ocr-review-'+field.id;
      const supported=field.id!=='level'||context.stage==='setup'||!!context.hasLevel;
      use.type='checkbox';use.id='ocr-use-'+field.id;use.checked=result.value!==null&&supported&&!result.needsConfirmation;use.disabled=!supported;label.htmlFor=use.id;label.textContent=field.label;header.append(use,label);
      const check=text('button','View crop','text-button');check.type='button';check.addEventListener('click',()=>{$('ocr-region-field').value=field.id;paintRegion();});header.append(check);row.append(header);
      const input=document.createElement('input');input.id='ocr-value-'+field.id;input.type=field.numeric?'number':'text';input.setAttribute('aria-label','Recognized '+field.label);input.value=result.value??'';input.disabled=!supported;
      if(field.numeric){input.min=field.id==='level'?'1':'0';input.step='1';if(field.id==='level')input.max='100';}else input.maxLength=80;
      if(field.id==='map'){input.placeholder='Search MeowDB maps';input.setAttribute('aria-describedby','ocr-map-help');}
      input.addEventListener('input',()=>{use.checked=(field.id==='map'?!!MapleMapMatcher.resolve(input.value):input.value.trim()!=='')&&supported;});row.append(input);
      if(field.id==='exp'&&result.percent){input.dataset.percent=result.percent;input.addEventListener('input',()=>{delete input.dataset.percent;row.querySelector('.ocr-review-note').textContent='EXP total entered manually. Check it against your screenshot before applying.';});}
      if(field.id==='level'){input.addEventListener('input',syncExpEstimate);use.addEventListener('change',syncExpEstimate);}
      if(field.id==='map'){
        const matches=text('div','','ocr-map-matches');
        function paintMatches(candidates,searching=false){matches.replaceChildren(text('span',candidates.length?(searching?'Search results · choose a map':'MeowDB matches · choose a map'):'No close map found. Try another name.'));for(const candidate of candidates){const choice=text('div','','ocr-map-choice'),pick=text('button',candidate.label,'secondary');pick.type='button';pick.disabled=busy;pick.setAttribute('aria-label','Use map '+candidate.label);pick.addEventListener('click',()=>{input.value=candidate.label;use.checked=true;row.querySelector('.ocr-review-note').textContent='MeowDB map selected. Check it against your screenshot before applying.';});const link=text('a','MeowDB ↗');link.href=candidate.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','View '+candidate.label+' on MeowDB');choice.append(pick,link);matches.append(choice);}}
        paintMatches(result.candidates||[]);input.addEventListener('input',()=>{paintMatches(MapleMapMatcher.lookup(input.value),true);row.querySelector('.ocr-review-note').textContent=MapleMapMatcher.resolve(input.value)?'Catalog map found. Check it against your screenshot before applying.':'Choose a catalog map below or leave this field unchecked.';});row.append(matches);
        const help=text('small','Choose a suggested map or search by name. Only catalog maps can be applied from this import.','form-note');help.id='ocr-map-help';row.append(help);
      }
      if(result.alternatives?.length){const alternatives=text('div','','ocr-alternatives');alternatives.append(text('span','Other readings: '));for(const value of result.alternatives){const pick=text('button',value,'text-button');pick.type='button';pick.disabled=!supported;pick.dataset.unsupported=String(!supported);pick.setAttribute('aria-label','Use '+value+' for '+field.label);pick.addEventListener('click',()=>{input.value=value;use.checked=supported;if(field.id==='exp')delete input.dataset.percent;if(field.id==='level')syncExpEstimate();});alternatives.append(pick);}row.append(alternatives);}
      if(['hp','mp'].includes(field.id)){
        const supply=text('label','Count belongs to '),select=document.createElement('select');select.id='ocr-potion-'+field.id;select.setAttribute('aria-label',field.id.toUpperCase()+' supply in screenshot');select.replaceChildren(...MapleMath.catalog[field.id].map(item=>new Option(item.name,item.id)));select.value=previous?.querySelector('#ocr-potion-'+field.id)?.value||context[field.id+'Potion'];
        select.addEventListener('change',()=>{if(context.stage==='setup')return;try{if(options.getContext().stage!==context.stage)throw new Error('The session changed. Close and reopen screenshot review.');options.correctSupply(field.id,select.value);context[field.id+'Potion']=select.value;$('ocr-field-status').textContent='Supply item corrected for this recording. Quantities still need review before applying.';}catch(e){select.value=context[field.id+'Potion'];MaplePotionPicker.syncAll();error('ocr-review-error',e.message);}});
        supply.append(select);row.append(supply);
      }
      row.append(text('small',!supported?'Starting level was not recorded. Keep using the manual level-up adjustment.':field.id==='map'?(result.value===null?'No close catalog match. Search for your map or leave it unchecked.':result.needsConfirmation?'Uncertain match: choose the correct map above or search the catalog. This field is not included yet.':'Matched a MeowDB map. Verify the location before applying.'):result.method==='classic-exp'?(result.value===null?'No clear EXP-font number matched. Keep the complete number inside the region, try another reader, or type the value here.':'Classic EXP digits matched. Check the complete number against your screenshot before applying.'):result.method==='classic-digits'?(result.value===null?'No clear Classic count matched. Draw a tight box around the full number, try General text OCR for another font, or type it here.':'Classic quantity digits matched. Check the complete number against your screenshot before applying.'):result.value===null?'No number or text found. Type it here or leave this field unchecked.':result.disagrees?'Readings differ. Check the enlarged crop carefully.':['hp','mp'].includes(field.id)?'Detected count is included. Choose the matching item and edit the number if needed.':result.confidence<70?'Small text: check the enlarged crop before applying.':'Review this value before applying.','ocr-review-note'));
      if(result.value===null&&result.reason)row.append(text('small',result.reason,'ocr-review-note'));
      if(field.id==='exp'&&!result.percent)row.querySelector('.ocr-review-note').textContent='No clear EXP percentage was found. Include the decimal point and % sign, try Classic EXP digits or General text OCR, or type an exact EXP total here.';
      const details=document.createElement('details');details.className='ocr-raw';details.append(text('summary','Recognized text'),text('p',result.raw||'No text recognized'));row.append(details);if(previous){MaplePotionPicker.dispose(previous);previous.replaceWith(row);}else container.append(row);
    }
    $('ocr-review-form').hidden=false;$('ocr-empty-review').hidden=true;
    syncExpEstimate();if(!partial)window.MapleEtcCapture?.mount(results.etc,image);if(results.uses&&window.MapleUseSlots)MapleUseSlots.mountReview(image,results.uses);
    for(const field of ['hp','mp']){const select=$('ocr-potion-'+field);if(select)MaplePotionPicker.enhance(select,field);}
    MaplePotionPicker.syncAll();MaplePotionPicker.setBusy(container,busy);
  }
  function open(calibration=false){
    calibration=calibration===true;context={...options.getContext(),calibration};if(!['setup','ending'].includes(context.stage)&&!(calibration&&context.stage==='running'))return;
    $('ocr-apply').hidden=calibration;
    stop();clearImage();error('ocr-capture-error','');$('ocr-file').value='';$('ocr-file-name').textContent='PNG, JPG, or WebP · up to 15 MB';$('ocr-capture-status').textContent='';$('ocr-review-form').hidden=true;$('ocr-guide').open=true;
    $('ocr-context').textContent=calibration?'Adjust regions and readers using an Entire screen snapshot. Remember regions & image settings, then close and enable Auto screenshots. Numeric readings stay in this calibration preview. Use Remember shortcut regions below to update automatic capture positions. Correct item identities and prices under Use items & costs on the tracker.':context.stage==='setup'?'Fill your starting values from a screenshot taken before training.':'Fill ending values from your final screenshot. Map and class stay as recorded at the start. Use Remember shortcut regions below to update automatic capture positions. Correct item identities and prices under Use items & costs on the tracker.';
    $('ocr-region-field').replaceChildren(...activeFields().map(field=>new Option(field.label,field.id)));$('ocr-region-field').value='exp';error('ocr-error','');error('ocr-review-error','');$('screenshot-dialog').showModal();
    paintCaptureConnection();if(captureSession.active())$('ocr-capture-status').textContent='Your previous monitor is still connected. Click Capture snapshot to use it again.';
  }
  function init(config){
    options=config;window.MapleUseSlots?.bindReview(readUseQuantity,()=>busy);captureSession=MapleScreenCapture.createSession({onChange:paintCaptureConnection});drawGuide();paintCaptureConnection();
    $('ocr-capture-help').textContent=MapleScreenCapture.supported()?'Choose Entire screen (Screen 1 or Screen 2 in Firefox), then Capture snapshot reuses it while this page stays open. Some browsers cannot verify the source type: select a whole screen rather than a window. Use Stop sharing when finished. No audio or recording.':'Screen capture may be unavailable in this browser. Open the site in a desktop browser over HTTPS, or upload a screenshot.';
    $('ocr-capture-change').addEventListener('click',()=>void captureScreen({changeSource:true}));
    for(const id of ['ocr-capture-stop','capture-stop-sharing'])$(id).addEventListener('click',stopSharing);
    window.addEventListener('pagehide',()=>{stop();captureSession.stop();});
    try{const current=localStorage.getItem(layoutKey),saved=JSON.parse(current||localStorage.getItem(legacyLayoutKey));if(saved){for(const field of C.fields)regions[field.id]=C.region(field.id==='mesos'?C.migrateMesosRegion(saved.mesos):!current&&field.id==='exp'?C.migrateExpRegion(saved.exp):saved[field.id]);if(!current||JSON.stringify(saved.mesos)!==JSON.stringify(regions.mesos))localStorage.setItem(layoutKey,JSON.stringify(regions));}}catch{regions=structuredClone(C.defaults);}
    try{const saved=JSON.parse(localStorage.getItem(tuningKey));if(saved)for(const field of C.fields)if(saved[field.id])tunings[field.id]=field.id==='level'?C.migrateLevelTuning(saved[field.id]):C.tuning(field.id,saved[field.id]);}catch{tunings={};}
    $('screenshot-start').addEventListener('click',open);$('screenshot-end').addEventListener('click',open);
    $('ocr-close').addEventListener('click',()=>$('screenshot-dialog').close());$('screenshot-dialog').addEventListener('close',()=>{stop();clearImage();$('ocr-file').value='';$('ocr-file-name').textContent='PNG, JPG, or WebP · up to 15 MB';MaplePotionPicker.dispose($('ocr-review-fields'));$('ocr-review-fields').replaceChildren();});
    $('ocr-capture').addEventListener('click',()=>void captureScreen());$('ocr-capture-cancel').addEventListener('click',()=>{stop();$('ocr-capture-status').textContent='Capture cancelled. Your previous screenshot and reviewed values were kept. If the browser picker is still open, dismiss it there too.';});
    $('ocr-file').addEventListener('change',event=>{if(event.target.files[0]){$('ocr-capture-status').textContent='';void loadImage(event.target.files[0]);}});$('ocr-example').addEventListener('click',()=>{$('ocr-capture-status').textContent='';void loadImage(null);});$('ocr-read').addEventListener('click',()=>void read());$('ocr-read-field').addEventListener('click',()=>void read(true));$('ocr-cancel').addEventListener('click',()=>{stop();$('ocr-progress-text').textContent='Reading cancelled. You can retry or enter values manually.';$('ocr-field-status').textContent=restoreReview()?'Reading cancelled. Other values were kept.':'Reading cancelled. You can retry or enter values manually.';});
    $('ocr-region-field').addEventListener('change',()=>{paintRegion();$('ocr-field-status').textContent='';});
    for(const key of tuningKeys)$('ocr-tune-'+key).addEventListener('input',()=>{const id=$('ocr-region-field').value;tunings[id]=C.tuning(id,Object.fromEntries(tuningKeys.map(k=>[k,k==='invert'?$('ocr-tune-'+k).checked:['mode','reader'].includes(k)?$('ocr-tune-'+k).value:Number($('ocr-tune-'+k).value)])));paintTuning();invalidateReview(id);$('ocr-field-status').textContent='Preview updated. Re-read this field to update its value.';});
    $('ocr-reset-tuning').addEventListener('click',()=>{const id=$('ocr-region-field').value;delete tunings[id];paintTuning();invalidateReview(id);$('ocr-field-status').textContent='Default image settings restored for this field.';});
    for(const key of ['x','y','w','h'])$('ocr-region-'+key).addEventListener('change',()=>{try{const id=$('ocr-region-field').value;regions[id]=C.region(Object.fromEntries(['x','y','w','h'].map(k=>[k,Number($('ocr-region-'+k).value)/100])));paintRegion();invalidateReview(id);error('ocr-error','');}catch(e){error('ocr-error',e.message);paintRegion();}});
    $('ocr-save-layout').addEventListener('click',()=>{try{localStorage.setItem(layoutKey,JSON.stringify(regions));localStorage.setItem(tuningKey,JSON.stringify(tunings));$('ocr-layout-status').textContent='Read regions and image settings remembered in this browser. The screenshot is not saved.';}catch{$('ocr-layout-status').textContent='Browser storage is unavailable; settings remain for this visit.';}});
    $('ocr-reset-layout').addEventListener('click',()=>{regions=structuredClone(C.defaults);tunings={};try{localStorage.removeItem(layoutKey);localStorage.removeItem(legacyLayoutKey);localStorage.removeItem(tuningKey);}catch{}paintRegion();invalidateReview();$('ocr-layout-status').textContent='Example regions and image settings restored.';});
    const overlay=$('ocr-region-overlay'),point=event=>{const rect=overlay.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};};
    overlay.addEventListener('pointerdown',event=>{if(!image||busy||event.button!==0)return;event.preventDefault();drag=point(event);overlay.setPointerCapture(event.pointerId);});
    overlay.addEventListener('pointermove',event=>{if(!drag)return;const end=point(event),next={x:Math.min(drag.x,end.x),y:Math.min(drag.y,end.y),w:Math.abs(end.x-drag.x),h:Math.abs(end.y-drag.y)};if(next.w*image.naturalWidth<3||next.h*image.naturalHeight<3)return;regions[$('ocr-region-field').value]=C.region(next);paintRegion();});
    overlay.addEventListener('pointerup',()=>{if(drag){drag=null;invalidateReview($('ocr-region-field').value);}});overlay.addEventListener('pointercancel',()=>{drag=null;});
    $('ocr-review-form').addEventListener('submit',event=>{
      event.preventDefault();if(busy||window.MapleUseSlots?.reading())return;
      try{
        if(context.calibration)throw new Error('This is a calibration preview. Remember regions & image settings, close it, and enable Auto screenshots.');
        const current=options.getContext();if(current.stage!==context.stage)throw new Error('The session changed. Close this window and import the screenshot again.');
        syncExpEstimate();
        const values={};for(const field of activeFields()){if(!$('ocr-use-'+field.id).checked)continue;const value=$('ocr-value-'+field.id).value.trim();const parsed=field.id==='map'?MapleMapMatcher.resolve(value)?.label||null:C.parse(field.id,value);if(parsed===null)throw new Error(field.id==='map'?'Choose a map from the MeowDB list, or uncheck Training map.':'Enter a valid '+field.label.toLowerCase()+', or uncheck it.');values[field.id]=parsed;if(['hp','mp'].includes(field.id))values[field.id+'Potion']=$('ocr-potion-'+field.id).value;}
        if(!expOnly()&&window.MapleUseSlots?.ready())values.uses=MapleUseSlots.reviewed();if(!expOnly()&&window.MapleEtcCapture)values.etc=MapleEtcCapture.reviewed();
        if(!Object.keys(values).length)throw new Error('Check at least one field to apply.');
        window.MapleUseSlots?.validate(values.uses);options.apply(values);$('screenshot-dialog').close();
      }catch(e){error('ocr-review-error',e.message);}
    });
  }
  async function sampleProgress({signal,allowPrompt=false}={}){
    if(busy||$('screenshot-dialog').open)throw new Error('Screenshot review is open or a read is already running; sample skipped.');
    if(signal?.aborted)throw new DOMException('Reading cancelled.','AbortError');
    const token=++run,controller=new AbortController();captureController=controller;let rejectAbort;
    const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
    const cancel=()=>{if(token===run){clearImage();stop();}rejectAbort(signal.reason||new DOMException('Reading cancelled.','AbortError'));};signal?.addEventListener('abort',cancel,{once:true});
    let url,img;
    setBusy(true);$('ocr-progress-wrap').hidden=true;
    try{
      const blob=await Promise.race([captureSession.capture({signal:controller.signal,allowPrompt}),aborted]),at=Date.now();
      if(token!==run)throw new DOMException('Reading cancelled.','AbortError');
      captureController=null;url=URL.createObjectURL(blob);img=new Image();img.src=url;await Promise.race([img.decode(),aborted]);
      if(token!==run)throw new DOMException('Reading cancelled.','AbortError');
      image=img;const width=img.naturalWidth,height=img.naturalHeight;
      let inventoryVisible=true;if(!expOnly()){const box=sourceRegion('mesos'),probe=document.createElement('canvas');probe.width=box.w;probe.height=box.h;const ctx=probe.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,box.x,box.y,box.w,box.h,0,0,box.w,box.h);inventoryVisible=C.inventoryVisible(ctx.getImageData(0,0,box.w,box.h).data);probe.width=probe.height=1;}
      const results=await Promise.race([recognize(C.fields.filter(field=>field.numeric&&field.id!=='level'&&(!expOnly()||field.id==='exp')&&(!window.MapleUseSlots?.ready()||!['hp','mp'].includes(field.id))&&(inventoryVisible||field.id!=='mesos')),token,{background:true}),aborted]);
      if(!inventoryVisible)results.mesos={value:null,confidence:0,reason:'Inventory balance box is not visible.'};
      if(token!==run||signal?.aborted)throw new DOMException('Reading cancelled.','AbortError');
      return {results,at,width,height,inventoryVisible,layout:JSON.stringify({regions,tunings,expOnly:expOnly(),uses:expOnly()?undefined:window.MapleUseSlots?.slots().map(r=>({id:r.id,region:r.region}))})};
    }finally{
      signal?.removeEventListener('abort',cancel);if(img)img.src='';if(url)URL.revokeObjectURL(url);
      if(token===run){if(worker)await worker.terminate();worker=null;releaseReadCanvases();for(const item of workerUrls)URL.revokeObjectURL(item);workerUrls=[];captureController=null;clearImage();setBusy(false);}
    }
  }
  window.MapleScreenshot={slotRegion:type=>structuredClone(regions[type]),slotSettings:type=>C.tuning(type,tunings[type]),init,openCalibration:()=>open(true),sampleProgress,stopSharing,sharingActive:()=>captureSession.active()};
})();
