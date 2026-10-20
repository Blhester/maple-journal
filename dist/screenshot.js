(() => {
  'use strict';
  const $=id=>document.getElementById(id),C=MapleOcrCore,layoutKey='maple-journal-ocr-regions-v1',tuningKey='maple-journal-ocr-tuning-v1',tuningKeys=['mode','contrast','brightness','threshold','chroma','scale','invert'];
  let options,context,image=null,regions=structuredClone(C.defaults),busy=false,worker=null,run=0,objectUrl=null,drag=null;
  let libraryPromise=null,workerUrls=[],tunings={};
  const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;};
  function error(id,message){$(id).textContent=message||'';$(id).hidden=!message;}
  const activeFields=()=>C.fields.filter(field=>context.stage==='setup'||!['map','class'].includes(field.id));
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
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=treatment==='original';ctx.drawImage(small,pad,pad,r.w*scale,r.h*scale);return canvas;
  }
  function processedCrop(id){
    const r=sourceRegion(id),settings=C.tuning(id,tunings[id]),canvas=document.createElement('canvas'),pad=16,scale=C.scaleFor(r.w,r.h,settings.scale);
    // Scale before filtering so the threshold can preserve antialiased strokes.
    const enlarged=document.createElement('canvas');enlarged.width=Math.max(1,Math.round(r.w*scale));enlarged.height=Math.max(1,Math.round(r.h*scale));const ctx=enlarged.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,r.x,r.y,r.w,r.h,0,0,enlarged.width,enlarged.height);
    const pixels=ctx.getImageData(0,0,enlarged.width,enlarged.height);pixels.data.set(C.processPixels(pixels.data,settings));ctx.putImageData(pixels,0,0);
    canvas.width=enlarged.width+pad*2;canvas.height=enlarged.height+pad*2;const out=canvas.getContext('2d');out.fillStyle=settings.invert?'#000':'#fff';out.fillRect(0,0,canvas.width,canvas.height);out.drawImage(enlarged,pad,pad);return canvas;
  }
  function paintTuning(){
    if(!image)return;const id=$('ocr-region-field').value,settings=C.tuning(id,tunings[id]);
    for(const key of tuningKeys){const control=$('ocr-tune-'+key);if(key==='invert')control.checked=settings[key];else control.value=String(settings[key]);if($('ocr-out-'+key))$('ocr-out-'+key).textContent=settings[key]+(key==='contrast'?'×':'');}
    $('ocr-tune-chroma').disabled=busy||settings.mode!=='neutral';$('ocr-tune-threshold').disabled=busy||settings.mode==='gray';
    const canvas=$('ocr-processed'),source=processedCrop(id);canvas.width=source.width;canvas.height=source.height;canvas.getContext('2d').drawImage(source,0,0);
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
    for(const id of ['ocr-read','ocr-read-field','ocr-reset-tuning','ocr-file','ocr-example','ocr-region-field','ocr-save-layout','ocr-reset-layout','ocr-apply',...['x','y','w','h'].map(k=>'ocr-region-'+k),...tuningKeys.map(k=>'ocr-tune-'+k)])$(id).disabled=value;
    for(const button of $('ocr-review-fields').querySelectorAll('button'))button.disabled=value||button.dataset.unsupported==='true';
    MaplePotionPicker.setBusy($('ocr-review-fields'),value);
    if(!value&&image)paintTuning();
    $('ocr-region-overlay').classList.toggle('ocr-reading',value);
  }
  function stop(){
    run++;if(worker){void worker.terminate();worker=null;}for(const url of workerUrls)URL.revokeObjectURL(url);workerUrls=[];setBusy(false);
  }
  function clearImage(){if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;image=null;drag=null;$('ocr-image').removeAttribute('src');for(const id of ['ocr-crop','ocr-processed']){$(id).width=1;$(id).height=1;}$('ocr-region-overlay').replaceChildren();$('ocr-workspace').hidden=true;}
  async function loadImage(file){
    stop();clearImage();error('ocr-error','');invalidateReview();MaplePotionPicker.dispose($('ocr-review-fields'));$('ocr-review-fields').replaceChildren();$('ocr-field-status').textContent='';
    const token=run;
    if(file&&(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)){error('ocr-error','Choose a PNG, JPG, or WebP smaller than 15 MB.');return;}
    const img=new Image();
    try{
      if(file){objectUrl=URL.createObjectURL(file);img.src=objectUrl;}else img.src=$('ocr-guide').querySelector('img').src;
      await img.decode();if(token!==run)return;if(img.naturalWidth<320||img.naturalHeight<200||img.naturalWidth*img.naturalHeight>24000000)throw new Error('Use a screenshot between 320 × 200 and 24 megapixels.');
      image=img;$('ocr-image').src=img.src;$('ocr-workspace').hidden=false;$('ocr-guide').open=false;$('ocr-file-name').textContent=(file?.name||'Capture guide example')+' · '+img.naturalWidth+' × '+img.naturalHeight;paintRegion();
      $('ocr-empty-review').textContent='Check the regions, then read your screenshot. Each field remains editable before applying.';
    }catch(e){if(token===run){clearImage();error('ocr-error','The image could not be opened. '+e.message);}}
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
  async function read(selectedOnly=false){
    if(!image||busy)return;const token=++run,results={},fields=activeFields().filter(field=>!selectedOnly||field.id===$('ocr-region-field').value);error('ocr-error','');error('ocr-review-error','');if(!selectedOnly)invalidateReview();setBusy(true);$('ocr-progress').value=0;$('ocr-progress-text').textContent='Loading local text recognition…';$('ocr-field-status').textContent='';
    let currentField=0,currentPass=0,passCount=1;
    try{
      await loadLibrary();if(token!==run)return;
      const created=await Tesseract.createWorker('eng',1,workerOptions(message=>{if(token===run&&message.status==='recognizing text')$('ocr-progress').value=Math.min(1,(currentField+(currentPass+(message.progress||0))/passCount)/fields.length);}));
      if(token!==run){await created.terminate();return;}worker=created;
      for(const [index,field]of fields.entries()){
        if(token!==run)return;
        currentField=index;if(selectedOnly)tunings[field.id]=C.tuning(field.id,tunings[field.id]);
        $('ocr-progress-text').textContent='Reading '+field.label.toLowerCase()+' · '+(index+1)+' of '+fields.length;
        const variants=field.id==='map'?['white','gray']:field.id==='level'?['orange','white']:field.id==='exp'?['original','neutral']:field.id==='mesos'?['dark','gray']:['hp','mp'].includes(field.id)?['neutral','white','original']:['gray','original'];
        const reads=[];
        const enhanced=selectedOnly||Object.hasOwn(tunings,field.id),modes=field.numeric?['8','7','13']:field.id==='map'?['6','7']:['7','13'];
        const passes=enhanced?modes.map(mode=>({mode,label:'Adjusted image · '+(mode==='8'?'word':mode==='13'?'raw line':mode==='6'?'block':'line')})):variants.map(treatment=>({mode:field.id==='map'?'6':'7',treatment,label:treatment+' · line'}));
        passCount=passes.length;const prepared=enhanced?processedCrop(field.id):null;
        for(const [passIndex,pass]of passes.entries()){
          if(token!==run)return;
          currentPass=passIndex;
          await worker.setParameters({tessedit_pageseg_mode:pass.mode,tessedit_char_whitelist:field.numeric?'0123456789.,':'',user_defined_dpi:'300'});
          const {data}=await worker.recognize(prepared||crop(field.id,pass.treatment));reads.push({text:data.text,confidence:data.confidence,label:pass.label});
        }
        results[field.id]=C.select(field.id,reads);
      }
      if(token!==run)return;showReview(results,selectedOnly);$('ocr-progress-text').textContent='Reading complete. Review every value before applying.';if(selectedOnly)$('ocr-field-status').textContent=fields[0].label+' updated below. Other reviewed values were kept.';
    }catch(e){if(token===run){restoreReview();error('ocr-error','Screenshot reading could not finish. '+e.message+' You can continue with manual entry.');}}
    finally{if(token===run){if(worker)await worker.terminate();worker=null;for(const url of workerUrls)URL.revokeObjectURL(url);workerUrls=[];setBusy(false);}}
  }
  function showReview(results,partial=false){
    const container=$('ocr-review-fields');if(!partial){MaplePotionPicker.dispose(container);container.replaceChildren();}
    for(const field of activeFields()){
      const previous=$('ocr-review-'+field.id);if(partial&&previous&&!results[field.id])continue;
      const result=results[field.id]||C.select(field.id,[]),row=text('div','','ocr-review-field'),header=text('div','','ocr-review-field-heading'),use=document.createElement('input'),label=document.createElement('label');row.id='ocr-review-'+field.id;
      const supported=field.id!=='level'||context.stage==='setup'||!!context.hasLevel;
      use.type='checkbox';use.id='ocr-use-'+field.id;use.checked=result.value!==null&&supported;use.disabled=!supported;label.htmlFor=use.id;label.textContent=field.label;header.append(use,label);
      const check=text('button','View crop','text-button');check.type='button';check.addEventListener('click',()=>{$('ocr-region-field').value=field.id;paintRegion();});header.append(check);row.append(header);
      const input=document.createElement('input');input.id='ocr-value-'+field.id;input.type=field.numeric?'number':'text';input.setAttribute('aria-label','Recognized '+field.label);input.value=result.value??'';input.disabled=!supported;
      if(field.numeric){input.min=field.id==='level'?'1':'0';input.step='1';if(field.id==='level')input.max='100';}else input.maxLength=80;
      input.addEventListener('input',()=>{use.checked=input.value.trim()!==''&&supported;});row.append(input);
      if(result.alternatives?.length){const alternatives=text('div','','ocr-alternatives');alternatives.append(text('span','Other readings: '));for(const value of result.alternatives){const pick=text('button',value,'text-button');pick.type='button';pick.disabled=!supported;pick.dataset.unsupported=String(!supported);pick.setAttribute('aria-label','Use '+value+' for '+field.label);pick.addEventListener('click',()=>{input.value=value;use.checked=supported;});alternatives.append(pick);}row.append(alternatives);}
      if(['hp','mp'].includes(field.id)){
        const supply=text('label','Count belongs to '),select=document.createElement('select');select.id='ocr-potion-'+field.id;select.setAttribute('aria-label',field.id.toUpperCase()+' supply in screenshot');select.replaceChildren(...MapleMath.catalog[field.id].map(item=>new Option(item.name,item.id)));select.value=previous?.querySelector('#ocr-potion-'+field.id)?.value||context[field.id+'Potion'];select.disabled=context.stage!=='setup';supply.append(select);row.append(supply);
      }
      row.append(text('small',!supported?'Starting level was not recorded. Keep using the manual level-up adjustment.':result.value===null?'No number or text found. Type it here or leave this field unchecked.':result.disagrees?'Readings differ. Check the enlarged crop carefully.':['hp','mp'].includes(field.id)?'Detected count is included. Choose the matching item and edit the number if needed.':result.confidence<70?'Small text: check the enlarged crop before applying.':'Review this value before applying.','ocr-review-note'));
      const details=document.createElement('details');details.className='ocr-raw';details.append(text('summary','Recognized text'),text('p',result.raw||'No text recognized'));row.append(details);if(previous){MaplePotionPicker.dispose(previous);previous.replaceWith(row);}else container.append(row);
    }
    $('ocr-review-form').hidden=false;$('ocr-empty-review').hidden=true;
    for(const field of ['hp','mp']){const select=$('ocr-potion-'+field);if(select)MaplePotionPicker.enhance(select,field);}
    MaplePotionPicker.syncAll();MaplePotionPicker.setBusy(container,busy);
  }
  function open(){
    context=options.getContext();if(!['setup','ending'].includes(context.stage))return;
    stop();clearImage();$('ocr-file').value='';$('ocr-file-name').textContent='PNG, JPG, or WebP · up to 15 MB';$('ocr-review-form').hidden=true;$('ocr-guide').open=true;
    $('ocr-context').textContent=context.stage==='setup'?'Fill your starting values from a screenshot taken before training.':'Fill ending values from your final screenshot. Map and class stay as recorded at the start.';
    $('ocr-region-field').replaceChildren(...activeFields().map(field=>new Option(field.label,field.id)));$('ocr-region-field').value='exp';error('ocr-error','');error('ocr-review-error','');$('screenshot-dialog').showModal();
  }
  function init(config){
    options=config;drawGuide();
    try{const saved=JSON.parse(localStorage.getItem(layoutKey));if(saved)for(const field of C.fields)regions[field.id]=C.region(saved[field.id]);}catch{regions=structuredClone(C.defaults);}
    try{const saved=JSON.parse(localStorage.getItem(tuningKey));if(saved)for(const field of C.fields)if(saved[field.id])tunings[field.id]=C.tuning(field.id,saved[field.id]);}catch{tunings={};}
    $('screenshot-start').addEventListener('click',open);$('screenshot-end').addEventListener('click',open);
    $('ocr-close').addEventListener('click',()=>$('screenshot-dialog').close());$('screenshot-dialog').addEventListener('close',()=>{stop();clearImage();$('ocr-file').value='';$('ocr-file-name').textContent='PNG, JPG, or WebP · up to 15 MB';MaplePotionPicker.dispose($('ocr-review-fields'));$('ocr-review-fields').replaceChildren();});
    $('ocr-file').addEventListener('change',event=>{if(event.target.files[0])void loadImage(event.target.files[0]);});$('ocr-example').addEventListener('click',()=>void loadImage(null));$('ocr-read').addEventListener('click',()=>void read());$('ocr-read-field').addEventListener('click',()=>void read(true));$('ocr-cancel').addEventListener('click',()=>{stop();$('ocr-progress-text').textContent='Reading cancelled. You can retry or enter values manually.';$('ocr-field-status').textContent=restoreReview()?'Reading cancelled. Other values were kept.':'Reading cancelled. You can retry or enter values manually.';});
    $('ocr-region-field').addEventListener('change',()=>{paintRegion();$('ocr-field-status').textContent='';});
    for(const key of tuningKeys)$('ocr-tune-'+key).addEventListener('input',()=>{const id=$('ocr-region-field').value;tunings[id]=C.tuning(id,Object.fromEntries(tuningKeys.map(k=>[k,k==='invert'?$('ocr-tune-'+k).checked:k==='mode'?$('ocr-tune-'+k).value:Number($('ocr-tune-'+k).value)])));paintTuning();invalidateReview(id);$('ocr-field-status').textContent='Preview updated. Re-read this field to update its value.';});
    $('ocr-reset-tuning').addEventListener('click',()=>{const id=$('ocr-region-field').value;delete tunings[id];paintTuning();invalidateReview(id);$('ocr-field-status').textContent='Default image settings restored for this field.';});
    for(const key of ['x','y','w','h'])$('ocr-region-'+key).addEventListener('change',()=>{try{const id=$('ocr-region-field').value;regions[id]=C.region(Object.fromEntries(['x','y','w','h'].map(k=>[k,Number($('ocr-region-'+k).value)/100])));paintRegion();invalidateReview(id);error('ocr-error','');}catch(e){error('ocr-error',e.message);paintRegion();}});
    $('ocr-save-layout').addEventListener('click',()=>{try{localStorage.setItem(layoutKey,JSON.stringify(regions));localStorage.setItem(tuningKey,JSON.stringify(tunings));$('ocr-layout-status').textContent='Read regions and image settings remembered in this browser. The screenshot is not saved.';}catch{$('ocr-layout-status').textContent='Browser storage is unavailable; settings remain for this visit.';}});
    $('ocr-reset-layout').addEventListener('click',()=>{regions=structuredClone(C.defaults);tunings={};try{localStorage.removeItem(layoutKey);localStorage.removeItem(tuningKey);}catch{}paintRegion();invalidateReview();$('ocr-layout-status').textContent='Example regions and image settings restored.';});
    const overlay=$('ocr-region-overlay'),point=event=>{const rect=overlay.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};};
    overlay.addEventListener('pointerdown',event=>{if(!image||busy||event.button!==0)return;event.preventDefault();drag=point(event);overlay.setPointerCapture(event.pointerId);});
    overlay.addEventListener('pointermove',event=>{if(!drag)return;const end=point(event),next={x:Math.min(drag.x,end.x),y:Math.min(drag.y,end.y),w:Math.abs(end.x-drag.x),h:Math.abs(end.y-drag.y)};if(next.w*image.naturalWidth<3||next.h*image.naturalHeight<3)return;regions[$('ocr-region-field').value]=C.region(next);paintRegion();});
    overlay.addEventListener('pointerup',()=>{if(drag){drag=null;invalidateReview($('ocr-region-field').value);}});overlay.addEventListener('pointercancel',()=>{drag=null;});
    $('ocr-review-form').addEventListener('submit',event=>{
      event.preventDefault();if(busy)return;
      try{
        const current=options.getContext();if(current.stage!==context.stage)throw new Error('The session changed. Close this window and import the screenshot again.');
        const values={};for(const field of activeFields()){if(!$('ocr-use-'+field.id).checked)continue;const value=$('ocr-value-'+field.id).value.trim();const parsed=C.parse(field.id,value);if(parsed===null)throw new Error('Enter a valid '+field.label.toLowerCase()+', or uncheck it.');values[field.id]=parsed;if(['hp','mp'].includes(field.id))values[field.id+'Potion']=$('ocr-potion-'+field.id).value;}
        if(!Object.keys(values).length)throw new Error('Check at least one field to apply.');
        options.apply(values);$('screenshot-dialog').close();
      }catch(e){error('ocr-review-error',e.message);}
    });
  }
  window.MapleScreenshot={init};
})();
