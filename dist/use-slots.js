(() => {
  'use strict';
  const M=MapleMath,items=MapleUseData.items,$=id=>document.getElementById(id),clone=structuredClone;
  let options,review=null,reviewImage=null,drawing=null,quantityReader=null,reviewGeneration=0,useReading=false,readerBusy=()=>false;
  const el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
  const button=(label,action)=>{const b=el('button',label,'secondary');b.type='button';b.addEventListener('click',action);return b;};
  const itemFor=id=>items.find(i=>i.id===id);
  const imageFor=id=>{const item=itemFor(id),n=el(item?'img':'span',item?'':'?','use-item-icon');if(item){n.src=item.icon;n.alt='';n.width=n.height=32;}return n;};
  const defaultRegion=i=>({x:(1415+i*50)/1919,y:933/1079,w:49/1919,h:49/1079});
  function legacy(start){return ['hp','mp'].map((k,i)=>{const old=M.catalog[k].find(r=>r.id===start[k+'Potion']),item=items.find(r=>r.name===old?.name);return {id:'use-'+(i+1),itemId:item?.id||'custom',name:item?.name||old?.name||'Custom item',cost:start[k+'Cost'],quantity:start[k],region:defaultRegion(i),ocr:MapleScreenshot.slotSettings(k),countRegion:MapleScreenshot.slotRegion(k)};});}
  function state(){return options.getState();}
  function slots(){return state().stage==='setup'?state().useDraft:state().start?.uses||[];}
  function commit(){options.changed();}
  function init(config){
    options={...config,readQuantity:quantityReader};document.body.classList.add('generic-uses');
    const s=state();if(s.start&&!s.start.expOnly&&s.start.uses===undefined){s.start.uses=legacy(s.start);const convert=e=>{if(e)e.uses=s.start.uses.map((r,i)=>({id:r.id,quantity:e[i?'mp':'hp'],added:e[(i?'mp':'hp')+'Added']||0}));};convert(s.end);for(const p of [...(s.checkpoints||[]),...(s.autoPoints||[])])convert(p.end);for(const e of [s.end,...(s.checkpoints||[]).map(p=>p.end),...(s.autoPoints||[]).map(p=>p.end)])if(e)e.hp=e.mp=e.hpAdded=e.mpAdded=0;s.start.hp=s.start.mp=s.start.hpCost=s.start.mpCost=0;}
    if(!s.useDraft)s.useDraft=s.start?.uses?clone(s.start.uses):legacy({hp:0,mp:0,hpCost:Number($('hp-cost').value)||80,mpCost:Number($('mp-cost').value)||150,hpPotion:$('hp-potion').value,mpPotion:$('mp-potion').value});
    $('use-add').addEventListener('click',()=>{if(slots().length>=12)return;slots().push({id:'use-'+Date.now().toString(36),itemId:'custom',name:'Custom use item',cost:null,quantity:0});render();commit();});
    render();
  }
  function picker(host,row,onChange){
    const wrap=el('div',undefined,'use-search'),label=el('label','Use item'),search=el('input'),selected=el('div',undefined,'use-selected'),list=el('div',undefined,'use-search-results');search.type='search';search.placeholder='Search all Use items…';search.value=row.name;search.setAttribute('aria-label','Search item for '+row.id);list.hidden=true;list.setAttribute('role','listbox');
    const paintSelected=()=>{selected.replaceChildren(imageFor(row.itemId),el('span',row.name));};paintSelected();
    function choose(item){row.itemId=item.id;row.name=item.name;row.cost=item.purchasePrice;search.value=item.name;list.hidden=true;paintSelected();onChange();}
    function results(){list.replaceChildren();const q=search.value.toLowerCase(),found=items.filter(i=>(i.name+' '+i.category).toLowerCase().includes(q)).slice(0,30);for(const i of found){const b=button('',()=>choose(i));b.setAttribute('role','option');b.append(imageFor(i.id),el('span',i.name+' · '+i.category));list.append(b);}list.append(button('Custom use item',()=>choose({id:'custom',name:'Custom use item',purchasePrice:null})));list.hidden=false;}
    search.addEventListener('input',results);search.addEventListener('focus',()=>{search.select();results();});search.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();list.hidden=true;search.value=row.name;}if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('button')?.focus();}});wrap.addEventListener('focusout',()=>setTimeout(()=>{if(!wrap.contains(document.activeElement)){list.hidden=true;search.value=row.name;}},0));label.append(search);wrap.append(selected,label,list);host.append(wrap);
  }
  function number(host,label,value,change,{required=true}={}){const l=el('label',label),n=el('input');n.type='number';n.min='0';n.step='1';n.value=value??'';n.required=required;n.addEventListener('input',()=>change(n.value));l.append(n);host.append(l);return n;}
  function editor(host,rows,{running=false,reviewing=false}={}){
    host.replaceChildren();for(const [index,row]of rows.entries()){
      const card=el(reviewing?'details':'div',undefined,'use-slot-card'),head=el('div',undefined,'use-slot-heading');let summary;const paintSummary=()=>{if(summary)summary.replaceChildren(imageFor(row.itemId),el('strong',row.name),el('span',row.include===false?'Not included':row.quantity===null?'N/A':row.quantity+' left'));};if(reviewing){summary=el('summary',undefined,'use-detected-summary');paintSummary();card.append(summary);}head.append(el('strong','Use slot '+(index+1)));card.append(head);
      if(!running&&(!reviewing||state().stage==='setup'))head.append(button('Remove',()=>{rows.splice(index,1);if(reviewing)renderReview();else {render();commit();}}));
      const priceWrap=el('div',undefined,'use-fields');let price,includeControl,note;const noteText=()=>itemFor(row.itemId)?.purchasePrice===null||row.itemId==='custom'?'Enter your replacement cost; no verified shop purchase price is available.':'Editable purchase cost. Confirm the price you actually pay.';const save=()=>{if(reviewing)return;if(running){try{const validated=M.cleanUses(rows);state().start.uses=validated;$('use-current-status').textContent='Use item correction saved.';commit();options.refresh?.();}catch(e){$('use-current-status').textContent=e.message;}}else commit();};
      picker(card,row,()=>{price.value=row.cost??'';if(note)note.textContent=noteText();paintSummary();save();});
      if(!running)number(priceWrap,reviewing?'Count in screenshot':'Starting quantity',row.quantity,v=>{row.quantity=v;if(reviewing){row.include=v!=='';if(includeControl)includeControl.checked=row.include;paintSummary();}else commit();},{required:!reviewing});
      price=number(priceWrap,'Cost per item (mesos)',row.cost,v=>{row.cost=v;save();});
      note=el('small',noteText(),'form-note');card.append(priceWrap,note);
      if(!row.region)card.append(el('small','Manual counts until you choose a shortcut region in screenshot review.','form-note'));
      if(reviewing){const settings=el('details'),summary=el('summary','Improve this count'),ocr=row.ocr=MapleOcrCore.tuning('hp',row.ocr||{}),readerLabel=el('label','Count reader'),select=el('select');for(const [value,label]of [['quantity-font','Classic shortcut digits'],['general','General text OCR'],['exp-font','Classic EXP digits']])select.append(new Option(label,value));select.value=ocr.reader;const changed=()=>{row.quantity=null;row.include=false;renderReview();$('use-review-status').textContent='Count settings changed. Read this count again.';};select.addEventListener('change',()=>{row.ocr.reader=select.value;changed();});readerLabel.append(select);settings.append(summary,readerLabel);if(ocr.reader==='general'){const modeLabel=el('label','Text color'),mode=el('select');for(const value of ['neutral','light','dark','gray','gold'])mode.append(new Option(value,value));mode.value=ocr.mode;mode.addEventListener('change',()=>{row.ocr.mode=mode.value;changed();});modeLabel.append(mode);settings.append(modeLabel);for(const [key,min,max,step]of [['contrast',.5,3,.1],['brightness',-80,80,1],['threshold',30,240,1],['chroma',0,255,1],['scale',2,6,1]]){const label=el('label',key),range=el('input');range.type='range';range.min=min;range.max=max;range.step=step;range.value=ocr[key];range.addEventListener('change',()=>{row.ocr[key]=Number(range.value);changed();});label.append(range);settings.append(label);}const label=el('label','Invert colors'),invert=el('input');invert.type='checkbox';invert.checked=ocr.invert;invert.addEventListener('change',()=>{row.ocr.invert=invert.checked;changed();});label.prepend(invert);settings.append(label);}card.append(settings);const keep=el('label',undefined,'use-include'),check=el('input');includeControl=check;check.type='checkbox';check.checked=row.include!==false;check.addEventListener('change',()=>{row.include=check.checked;paintSummary();});keep.append(check,document.createTextNode('Include this count'));card.append(keep);head.prepend(imageFor(row.itemId));head.append(button('Choose shortcut region',()=>{drawing=row.id;$('use-region-tools').open=true;paintCanvas();$('use-region-canvas').scrollIntoView({block:'center'});$('use-region-help').textContent='Drag around this entire shortcut cell, including its icon and bottom quantity.';}));if(row.suggestions?.length){const suggestions=el('div',undefined,'use-suggestions');suggestions.append(el('small','Icon suggestions · choose to confirm'));for(const suggestion of row.suggestions){const item=itemFor(suggestion.id);if(!item)continue;const b=button(item.name+(suggestion.strong?' · close match':' · possible match'),()=>{row.itemId=item.id;row.name=item.name;row.cost=item.purchasePrice;renderReview();});b.prepend(imageFor(item.id));suggestions.append(b);}card.append(suggestions);}card.append(button('Read this count again',async()=>{if(useReading||readerBusy())return;useReading=true;try{row.quantity=(await options.readQuantity(reviewImage,row.region,row.ocr,row.countRegion))?.value??null;row.include=row.quantity!==null;renderReview();}catch(e){$('use-review-status').textContent=e.message;}finally{useReading=false;}}));}
      host.append(card);
    }
  }
  function endRows(prefix){const s=state(),key=prefix==='cp'?'useCheckpointDraft':'useEndDraft';if(!s[key]){const last=(prefix!=='cp'&&s.end?.uses)||MapleLiveModel.points(s).at(-1)?.end.uses;s[key]=slots().map(r=>({id:r.id,quantity:last?.find(x=>x.id===r.id)?.quantity??'',added:last?.find(x=>x.id===r.id)?.added||0}));}return s[key];}
  function endEditor(host,prefix){host.replaceChildren();for(const row of endRows(prefix)){const slot=slots().find(s=>s.id===row.id),card=el('div',undefined,'use-slot-end');card.append(imageFor(slot.itemId),el('strong',slot.name));number(card,'Remaining quantity',row.quantity,v=>{row.quantity=v;commit();});number(card,'Added since start',row.added,v=>{row.added=v;commit();});host.append(card);}}
  function render(){
    if(!options)return;const s=state();if(s.start?.expOnly||s.stage==='setup'&&s.expOnly){for(const id of ['use-setup','use-current','use-cp-list','use-end-list']){$(id).hidden=true;for(const n of $(id).querySelectorAll('input,select,button'))n.disabled=true;}return;}const setup=s.stage==='setup';for(const id of ['use-cp-list','use-end-list'])$(id).hidden=false;$('use-setup').hidden=!setup;$('use-current').hidden=!['running','ending'].includes(s.stage);
    editor($('use-setup-list'),s.useDraft||[]);if(!setup&&s.start?.uses){editor($('use-current-list'),clone(s.start.uses),{running:true});endEditor($('use-end-list'),'end');endEditor($('use-cp-list'),'cp');}
    $('use-add').disabled=(s.useDraft?.length||0)>=12;
  }
  function starting(){return M.cleanUses(slots());}
  function ending(prefix){return M.cleanUseEnd(state().start,endRows(prefix));}
  function reset(){const s=state();s.useDraft=clone(slots()).map(r=>({...r,quantity:0}));delete s.useEndDraft;delete s.useCheckpointDraft;}
  function paintStats(result,host){const node=$(host);node.replaceChildren();for(const r of result||[]){const d=el('div',undefined,'use-stat');d.append(imageFor(r.itemId),el('strong',r.name),el('span',r.quantity===null?'N/A':Number(r.quantity).toLocaleString()+' left'));const ready=host!=='live-use-stats'||r.ready!==false,rate=r.used===null?'Unreadable count':!ready?'Gathering first minute':r.used===0?'No use recorded':(r.perMinute).toFixed(2)+'/min · '+(r.runwayMs===0?'Empty':Math.ceil(r.runwayMs/60000)+' min left');d.append(el('small',rate));if(host==='result-use-stats')d.append(el('span',r.used+' used × '+r.cost+' = '+r.totalCost.toLocaleString()+' mesos'));node.append(d);}}
  function paintLive(stats){paintStats(stats?.uses?.map(r=>({...r,ready:stats.rateReady}))||slots().map(r=>({...r,used:0,ready:false,perMinute:0})),'live-use-stats');}
  function validate(rows){if(!rows)return;M.cleanUses(rows.map(r=>({...r,quantity:r.quantity===null?0:r.quantity})));if(state().stage!=='setup'&&(rows.length!==slots().length||rows.some(r=>!slots().some(s=>s.id===r.id))))throw Error('Review the existing slots for this run.');}
  function apply(rows){validate(rows);if(!rows)return;const s=state();if(s.stage==='setup'){const old=s.useDraft||[];s.useDraft=rows.map(row=>({...row,quantity:row.quantity===null?old.find(r=>r.id===row.id)?.quantity??'':row.quantity}));M.cleanUses(s.useDraft.map(r=>({...r,quantity:r.quantity===''?0:r.quantity})));}else {const existing=clone(s.start.uses);for(const row of rows){const slot=existing.find(r=>r.id===row.id);if(!slot)throw Error('Only starting slots can be read during a run.');slot.itemId=row.itemId;slot.name=row.name;slot.cost=M.integer(row.cost,'Use cost');slot.region=row.region;slot.ocr=row.ocr;slot.countRegion=row.countRegion;}M.cleanUses(existing);const previous=endRows('end');s.start.uses=existing;s.useEndDraft=rows.map(r=>({id:r.id,quantity:r.quantity===null?previous.find(x=>x.id===r.id)?.quantity??'':M.integer(r.quantity,'Use count'),added:previous.find(x=>x.id===r.id)?.added||0}));}render();}
  function pixels(image,r,size=48){if(!r)throw Error('Choose a shortcut region first.');const c=el('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,r.x*image.naturalWidth,r.y*image.naturalHeight,r.w*image.naturalWidth,r.h*image.naturalHeight,0,0,size,size);const p=ctx.getImageData(0,0,size,size);c.width=c.height=1;return p;}
  async function scan(image,readQuantity,{isCurrent=()=>true,onStatus=()=>{}}={}){
    const c=el('canvas'),scale=Math.min(1,960/image.naturalWidth);c.width=Math.round(image.naturalWidth*scale);c.height=Math.round(image.naturalHeight*scale);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height);const data=ctx.getImageData(0,0,c.width,c.height);c.width=c.height=1;
    const boxes=MapleIconMatcher.cells(data.data,data.width,data.height),rows=[],seen=new Set(),existing=slots(),ids=new Set(existing.map(r=>r.id));
    const freshId=i=>{let id='use-detected-'+i;while(ids.has(id))id+='-new';ids.add(id);return id;};
    for(const [i,box]of boxes.entries()){
      onStatus('Reading shortcut '+(i+1)+' of '+boxes.length+' · matching icon and count…');await new Promise(r=>setTimeout(r,0));if(!isCurrent())return [];
      const p=pixels(image,box),matches=MapleIconMatcher.rank(p.data,p.width,p.height,MapleUseIcons),best=matches[0],alternative=matches.find(m=>m.iconKey!==best?.iconKey);
      // A readable count alone cannot turn a skill or an empty key into a Use
      // item. We need both a distinct catalog icon match and a usable count.
      if(!best||!(best.strong||(best.score<60&&(alternative?.score??255)-best.score>8)))continue;
      const item=itemFor(best.id);if(!item||seen.has(item.id))continue;const old=existing.find(r=>r.itemId===item.id),result=await readQuantity(image,box,old?.ocr);
      if(!isCurrent())return [];if(result?.value===null||result?.value===undefined||result.value===''||result.needsConfirmation)continue;
      if(rows.length>=12)break;seen.add(item.id);rows.push({...old,id:old?.id||freshId(i),itemId:item.id,name:item.name,cost:old?.cost??item.purchasePrice,region:box,countRegion:undefined,quantity:result.value,include:true,result,suggestions:matches});
    }
    return rows;
  }
  async function read(image,readQuantity,{match=false,isCurrent=()=>true,onStatus=()=>{}}={}){
    const found=match?await scan(image,readQuantity,{isCurrent,onStatus}):null;if(match&&state().stage==='setup')return found;
    const rows=clone(slots());for(const row of rows){
      if(!isCurrent())return [];const hit=found?.find(r=>r.itemId===row.itemId);if(hit){Object.assign(row,{...hit,id:row.id});continue;}
      if(!row.region){row.quantity=null;row.include=false;row.result={value:null};continue;}
      // Retain explicit/manual regions for custom items and icons the catalog
      // cannot identify. A current run must preserve every starting cost basis.
      const result=await readQuantity(image,row.region,row.ocr,row.countRegion);row.quantity=result?.value??null;row.include=row.quantity!==null&&!result?.needsConfirmation;row.result=result;
    }
    return rows;
  }
  function paintCanvas(){
    const c=$('use-region-canvas');if(!reviewImage)return;const offset=Math.floor(reviewImage.naturalHeight*.55);c.width=reviewImage.naturalWidth;c.height=reviewImage.naturalHeight-offset;const ctx=c.getContext('2d');ctx.drawImage(reviewImage,0,offset,c.width,c.height,0,0,c.width,c.height);ctx.lineWidth=Math.max(2,c.width/600);ctx.font=Math.max(14,c.width/85)+'px sans-serif';
    for(const [i,r]of review.entries())if(r.region){const b=r.region,x=b.x*c.width,y=b.y*reviewImage.naturalHeight-offset;ctx.strokeStyle=r.id===drawing?'#ffcd70':'#b8d398';ctx.fillStyle=ctx.strokeStyle;ctx.strokeRect(x,y,b.w*c.width,b.h*reviewImage.naturalHeight);ctx.fillText(String(i+1),x,Math.max(16,y-3));}
  }
  function renderReview(){editor($('use-review-list'),review,{reviewing:true});paintCanvas();}
  function mountReview(image,rows){
    reviewGeneration++;reviewImage=image;review=clone(rows);$('use-review').hidden=false;renderReview();$('use-review-status').textContent=reviewMessage(rows.filter(r=>r.include!==false&&r.quantity!==null).length);
  }
  function reviewed(){if(!review)return undefined;return review.map(row=>({...row,quantity:row.include===false?null:row.quantity}));}
  async function detect(){
    if(!reviewImage||useReading||readerBusy())return;useReading=true;const status=$('use-review-status'),b=$('use-detect'),generation=reviewGeneration;b.disabled=true;
    try{
      const found=await read(reviewImage,options.readQuantity,{match:true,isCurrent:()=>!!reviewImage&&generation===reviewGeneration,onStatus:value=>{status.textContent=value;}});if(generation!==reviewGeneration)return;
      review=found;
      renderReview();status.textContent=reviewMessage(review.filter(r=>r.include!==false&&r.quantity!==null).length);
    }catch(e){status.textContent='Could not detect shortcuts: '+e.message;}finally{b.disabled=false;useReading=false;}
  }
  function reviewMessage(count){return count?'Detected '+count+' counted Use items across all shortcut slots. Check each item, count and cost before applying. Duplicate hotkeys are tracked once.':state().stage==='setup'?'No counted Use icons matched. Skills, empty cells and unreadable counts are omitted. Add an item manually on the starting form if needed.':'No readable tracked items matched. Existing slots stay unknown until corrected; new items require a starting baseline.';}
  function bindReview(readQuantity,isBusy=()=>false){readerBusy=isBusy;
    quantityReader=readQuantity;if(options)options.readQuantity=readQuantity;$('use-detect').addEventListener('click',()=>void detect());
    $('use-save-regions').addEventListener('click',()=>{try{for(const row of review||[]){const target=slots().find(s=>s.id===row.id);if(target){target.region=row.region;target.ocr=row.ocr;target.countRegion=row.countRegion;}}commit();$('use-review-status').textContent='Shortcut regions remembered for automatic captures. Counts were not applied.';}catch(e){$('use-review-status').textContent=e.message;}});
    const c=$('use-region-canvas');let down=null;const point=e=>{const b=c.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:.55+Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))*.45};};c.addEventListener('pointerdown',e=>{if(!drawing||!review||e.button!==0)return;e.preventDefault();down=point(e);c.setPointerCapture(e.pointerId);});c.addEventListener('pointerup',e=>{if(!down)return;const p=point(e),r={x:Math.min(p.x,down.x),y:Math.min(p.y,down.y),w:Math.abs(p.x-down.x),h:Math.abs(p.y-down.y)};down=null;if(r.w*c.width<15||r.h*reviewImage.naturalHeight<15)return;const row=review.find(r=>r.id===drawing);row.region=r;delete row.countRegion;row.quantity=null;const crop=pixels(reviewImage,r);row.suggestions=MapleIconMatcher.rank(crop.data,crop.width,crop.height,MapleUseIcons);renderReview();$('use-review-status').textContent='Region updated. Read this count again, then choose the matching item suggestion.';});c.addEventListener('pointercancel',()=>{down=null;});
  }
  function clearReview(){reviewGeneration++;review=null;reviewImage=null;drawing=null;if($('use-review')){$('use-review').hidden=true;$('use-region-canvas').width=$('use-region-canvas').height=1;$('use-review-list').replaceChildren();}}
  window.MapleUseSlots={reading:()=>useReading,ready:()=>!!options,validate,detect,init,render,starting,ending,slots,apply,reset,paintLive,paintStats,read,mountReview,reviewed,bindReview,clearReview};
})();
