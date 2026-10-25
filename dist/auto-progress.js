(function(root,factory){const api=factory(typeof module!=='undefined'?require('./core.js'):root.MapleMath);root.MapleAutoProgress=api;if(typeof module!=='undefined')module.exports=api;})(typeof window!=='undefined'?window:globalThis,function(M){
  'use strict';
  const keys=['level','exp','mesos','hp','mp'];
  const median=values=>{const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
  function readableResult(r){const consensus=r?.votes>=2&&r.votes>r.readCount/2,font=['classic-exp','classic-exp-percent','classic-digits'].includes(r?.method),trusted=consensus||(!r?.disagrees&&Number.isFinite(r?.confidence)&&r.confidence>=70);return !!r&&r.value!==null&&r.value!==undefined&&!r.needsConfirmation&&(font||trusted);}
  function fromRead(read,start,elapsedMs){
    const end={hpAdded:0,mpAdded:0,extraExp:0,ledger:[]};
    for(const key of keys){
      if(start.uses!==undefined&&['hp','mp'].includes(key)){end[key]=0;continue;}
      const r=read.results[key],readable=readableResult(r);
      // An unreadable supply must not discard good EXP. Keep unknowns explicit;
      // raw net stays unknown. The separate live projection can estimate the gap.
      if(['mesos','hp','mp'].includes(key)){try{end[key]=readable&&(key!=='mesos'||read.inventoryVisible!==false)?M.integer(r.value,key):null;}catch{end[key]=null;}continue;}
      if(!readable)throw new Error('Uncertain '+key+' reading; sample skipped.');
      end[key]=M.integer(r.value,key);
    }
    if(start.uses!==undefined){end.uses=start.uses.map(slot=>{const r=read.results.uses?.find(r=>r.id===slot.id),v=r?.result;let quantity=null;try{if(readableResult(v))quantity=M.integer(v.value,'Use count');}catch{}return {id:slot.id,quantity,added:0};});}
    if(start.etc){end.etc=null;end.etcReadings=[];try{const rows=read.results.etc?.items||[];end.etcReadings=M.cleanEtcItems(rows.filter(r=>r.quantity!==null&&r.quantity!==undefined));if(read.results.etc?.readable)end.etc=M.cleanEtcItems(rows);}catch{end.etcReadings=[];}}
    if(!start.level)throw new Error('Record a starting level before enabling automatic progress.');
    M.position(end.level,end.exp);
    if(end.level<start.level)throw new Error('Level is below the starting level; sample skipped.');
    if(!Number.isSafeInteger(read.at)||!Number.isFinite(elapsedMs)||elapsedMs<=0)throw new Error('Invalid snapshot time.');
    return {end,elapsedMs,at:read.at,source:'automatic'};
  }
  function createFilter({start,anchor,mesoAnchor,etcAnchor=[]}){
    let base=anchor||{end:{...start,hpAdded:0,mpAdded:0,extraExp:0,ledger:[]},elapsedMs:0},pending=null,held=[],rates=[],lastTime=base.elapsedMs,mesoBase=mesoAnchor||(base.end.mesos===null?{end:{...start},elapsedMs:0}:base),mesoRates=[],etcBase=new Map([...(start.etc?.baseline||[]),...etcAnchor,...(base.end.etcReadings||[]),...(Array.isArray(base.end.etc)?base.end.etc:[])].map(r=>[r.itemId,r]));
    // Keep trend anchors across missing counts, without copying old quantities
    // into a new snapshot or inventing a supply cost.
    let supplyBase={hp:base.end.hp??mesoAnchor?.end.hp??start.hp,mp:base.end.mp??mesoAnchor?.end.mp??start.mp};
    const useIds=(start.uses||[]).map(r=>r.id);
    for(const slot of start.uses||[])supplyBase['use:'+slot.id]=base.end.uses?.find(r=>r.id===slot.id)?.quantity??slot.quantity;
    function vector(point){return {exp:M.position(point.end.level,point.end.exp),hp:point.end.hp,mp:point.end.mp,...Object.fromEntries(useIds.map(id=>['use:'+id,point.end.uses?.find(r=>r.id===id)?.quantity??null]))};}
    function follows(a,b){
      if(b.elapsedMs<=a.elapsedMs)return false;
      const x=vector(a),y=vector(b);
      return y.exp>=x.exp&&['hp','mp',...useIds.map(id=>'use:'+id)].every(k=>y[k]===null||y[k]<=(x[k]??supplyBase[k]));
    }
    function speed(a,b){const x=vector(a),y=vector(b),minutes=(b.elapsedMs-a.elapsedMs)/60000;return Object.fromEntries(Object.keys(x).filter(k=>x[k]!==null&&y[k]!==null).map(k=>[k,Math.abs(y[k]-x[k])/minutes]));}
    function unusual(point){
      if(rates.length<3)return false;
      const rate=speed(base,point),floor={exp:Math.max(100,(M.expTable[base.end.level]||100)*.02),mesos:5000,hp:10,mp:10};
      return Object.keys(rate).some(k=>{const values=rates.map(r=>r[k]).filter(Number.isFinite);if(values.length<3)return false;const m=median(values),mad=median(values.map(x=>Math.abs(x-m)));return rate[k]>m*5+mad*6+(floor[k]??10);});
    }
    function offer(point){
      if(!Number.isFinite(point.elapsedMs)||point.elapsedMs<=lastTime)throw new Error('Snapshot times must increase.');
      point={...point,end:{...point.end,hpAdded:base.end.hpAdded||0,mpAdded:base.end.mpAdded||0,extraExp:0,ledger:[]}};
      if(start.uses!==undefined)point.end.uses=M.cleanUseEnd(start,(point.end.uses||[]).map(r=>({...r,added:base.end.uses?.find(b=>b.id===r.id)?.added||0})),{partial:true});
      vector(point);lastTime=point.elapsedMs;const accepted=[],rejected=[];
      if(!follows(base,point)){
        held.push(point);if(held.length>4)rejected.push({point:held.shift(),reason:'Unconfirmed change; review a manual checkpoint.'});
        return {preview:null,accepted,rejected,pending,held:held.length,message:'Reading held: possible OCR error, restock, spend or EXP loss. A return to the prior trend discards it; log a manual checkpoint for a real change.'};
      }
      for(const suspect of held)rejected.push({point:suspect,reason:'Later reading returned to the prior trend.'});held=[];
      if(pending){
        if(!follows(pending,point))rejected.push({point:pending,reason:'Isolated spike or dip contradicted by the next reading.'});
        else if(unusual(pending))rejected.push({point:pending,reason:'Rate is far outside the recent pattern; review manually.'});
        else {
          let mesos=pending.end.mesos,mesosNote='';
          if(mesos===null||point.end.mesos===null){mesos=null;mesosNote='Inventory mesos not readable in both confirming captures.';}
          else if(mesos<mesoBase.end.mesos||point.end.mesos<mesos){mesos=null;mesosNote='Mesos spike, decrease or spend needs another reading or manual validation.';}
          else if(mesoRates.length>=3){const rate=(mesos-mesoBase.end.mesos)*60000/(pending.elapsedMs-mesoBase.elapsedMs),m=median(mesoRates),mad=median(mesoRates.map(x=>Math.abs(x-m)));if(rate>m*5+mad*6+5000){mesos=null;mesosNote='Mesos rate is outside the recent pattern; validate manually.';}}
          const confirmed={...pending,end:{...pending.end,mesos,hp:point.end.hp===null?null:pending.end.hp,mp:point.end.mp===null?null:pending.end.mp},mesosNote};if(start.uses!==undefined)confirmed.end.uses=pending.end.uses.map(r=>({...r,quantity:point.end.uses.find(x=>x.id===r.id)?.quantity===null?null:r.quantity}));
          if(start.etc){
            const a=pending.end.etcReadings||pending.end.etc||[],b=new Map((point.end.etcReadings||point.end.etc||[]).map(r=>[r.itemId,r])),excluded=new Set(start.etc.excluded);
            const valid=a.filter(r=>!excluded.has(r.itemId)&&r.quantity>=(etcBase.get(r.itemId)?.quantity||0)&&(b.get(r.itemId)?.quantity??-1)>=r.quantity);
            const ids=new Set(valid.map(r=>r.itemId)),complete=pending.end.etc&&point.end.etc&&[...etcBase.values(),...a].every(r=>excluded.has(r.itemId)||ids.has(r.itemId));
            confirmed.end.etc=complete?pending.end.etc:null;
            if(pending.end.etcReadings!==undefined||!complete)confirmed.end.etcReadings=valid;
            for(const row of valid)etcBase.set(row.itemId,row);
          }stats(start,confirmed);
          if(mesos!==null){mesoRates.push((mesos-mesoBase.end.mesos)*60000/(pending.elapsedMs-mesoBase.elapsedMs));mesoRates=mesoRates.slice(-7);mesoBase=confirmed;}
          rates.push(speed(base,confirmed));rates=rates.slice(-7);base=confirmed;for(const k of ['hp','mp'])if(confirmed.end[k]!==null)supplyBase[k]=confirmed.end[k];for(const row of confirmed.end.uses||[])if(row.quantity!==null)supplyBase['use:'+row.id]=row.quantity;accepted.push(confirmed);
        }
      }
      pending=point;
      const preview={...point,end:{...point.end,mesos:point.end.mesos!==null&&point.end.mesos>=mesoBase.end.mesos?point.end.mesos:null},preview:true};
      const missing=start.uses!==undefined?point.end.uses.filter(r=>r.quantity===null).map(r=>start.uses.find(s=>s.id===r.id)?.name||r.id):['hp','mp'].filter(k=>point.end[k]===null);
      return {preview,accepted,rejected,pending,held:0,message:(accepted.length?'Progress confirmed. Latest sample is waiting for the next reading.':'Sample waiting for the next reading. No value was guessed or filled in.')+(missing.length?' EXP continues; '+missing.map(k=>k.toUpperCase()).join('/')+' unreadable. Live financial estimates use the last validated rate or value; raw counts stay unknown.':'')};
    }
    function rebase(point){base=point;etcBase=new Map([...(start.etc?.baseline||[]),...(point.end.etcReadings||[]),...(Array.isArray(point.end.etc)?point.end.etc:[])].map(r=>[r.itemId,r]));supplyBase={hp:point.end.hp,mp:point.end.mp};pending=null;held=[];rates=[];lastTime=point.elapsedMs;mesoBase=point;mesoRates=[];for(const slot of start.uses||[])supplyBase['use:'+slot.id]=point.end.uses?.find(r=>r.id===slot.id)?.quantity??slot.quantity;}
    return {offer,rebase};
  }
  function stats(start,point){
    const e=point.end,ms=point.elapsedMs;if(!Number.isFinite(ms)||ms<=0)throw new Error('Invalid progress time.');
    const exp=start.level?M.position(e.level,e.exp)-M.position(start.level,start.exp):M.integer(e.exp,'EXP')-M.integer(start.exp,'Starting EXP')+M.integer(e.extraExp??0,'Extra EXP');
    const hpUsed=e.hp===null?null:M.integer(start.hp,'HP')+M.integer(e.hpAdded??0,'HP added')-M.integer(e.hp,'HP remaining'),mpUsed=e.mp===null?null:M.integer(start.mp,'MP')+M.integer(e.mpAdded??0,'MP added')-M.integer(e.mp,'MP remaining');
    if((hpUsed!==null&&hpUsed<0)||(mpUsed!==null&&mpUsed<0))throw new Error('Confirm supply restocks with a manual checkpoint.');
    let supplyCost=hpUsed===null||mpUsed===null?null:hpUsed*M.integer(start.hpCost,'HP price')+mpUsed*M.integer(start.mpCost,'MP price');
    if(!Number.isSafeInteger(exp)||(supplyCost!==null&&!Number.isSafeInteger(supplyCost)))throw new Error('Progress totals are too large.');
    const uses=M.useTotals(start,e,ms,{partial:true});if(uses)supplyCost=uses.cost;
    const cashNet=e.mesos===null||supplyCost===null?null:M.integer(e.mesos,'Mesos')-M.integer(start.mesos,'Starting mesos')-supplyCost;
    const drops=M.etcLoot(start,e),etcValue=drops===null?null:drops.reduce((sum,r)=>sum+r.value,0),net=cashNet===null||etcValue===null?null:cashNet+etcValue;
    if(net!==null&&!Number.isSafeInteger(net))throw new Error('Progress totals are too large.');
    const remaining=!start.level?null:e.level===100?0:M.expTable[e.level]-e.exp;
    // The immediate startup snapshot can be only milliseconds after validation.
    // Keep live rates at their starting zero until a full active minute has
    // been observed; tiny OCR differences must not become huge hourly spikes.
    const rateReady=ms>=60000;
    const hpPerMinute=hpUsed===null||!rateReady?null:hpUsed*60000/ms,mpPerMinute=mpUsed===null||!rateReady?null:mpUsed*60000/ms;
    const runway=(count,used)=>count===null?null:count===0?0:rateReady&&used>0?count*ms/used:null;
    return {cashNet,etcValue,etcDrops:drops,uses:uses?.details,exp,expHour:rateReady?exp*3600000/ms:0,expPercentHour:M.levelPercentPerHour(rateReady?exp*3600000/ms:0,start.level?e.level:null),net,netHour:net===null?null:rateReady?net*3600000/ms:0,rateReady,hpUsed,mpUsed,hpPerMinute,mpPerMinute,hpRunwayMs:runway(e.hp,hpUsed),mpRunwayMs:runway(e.mp,mpUsed),supplyCost,remaining,etaMs:remaining===0?0:rateReady&&remaining!==null&&exp>0?remaining*ms/exp:null};
  }
  // One bounded job at a time. Late browser timers take one fresh sample, never
  // replay missed minutes or invent timestamps. Permission is requested only
  // by start(), which must be called directly from the user's toggle gesture.
  function createRecorder({sample,getContext,onSample,onStatus=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,intervalMs=30000,timeoutMs=45000}){
    let enabled=false,timer=null,job=null,generation=0,sessionId=null;
    function status(message,extra={}){onStatus({enabled,inFlight:!!job,message,...extra});}
    function schedule(due=now()+intervalMs){clearTimer(timer);if(enabled){timer=setTimer(()=>void run(false),Math.max(0,due-now()));status(undefined,{due});}}
    function stop(message='Automatic screenshots are off.'){
      enabled=false;generation++;clearTimer(timer);timer=null;job?.abort();job=null;status(message);
    }
    async function run(allowPrompt){
      if(!enabled||job)return;
      const context=getContext();if(!context.running||context.sessionId!==sessionId){stop('Automatic screenshots stopped with the session.');return;}
      if(context.paused){schedule();status('Paused with the session. No screenshots are taken during breaks.');return;}
      const token=generation,controller=new AbortController(),started=now();job=controller;status('Capturing and reading progress locally…');let watchdog;
      try{
        const cancelled=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));
        const timeout=new Promise((_,reject)=>{watchdog=setTimer(()=>{const error=new Error('Snapshot reading timed out; this sample was skipped.');controller.abort(error);reject(error);},timeoutMs);});
        const result=await Promise.race([sample({signal:controller.signal,allowPrompt}),timeout,cancelled]);
        if(token!==generation||!enabled)return;
        const current=getContext();if(current.running&&!current.paused&&current.sessionId===context.sessionId)onSample(result);
      }catch(error){if(token===generation&&enabled){if(error.name==='NotAllowedError'||error.name==='CaptureSourceError'){stop(error.message);return;}status(error.message||'This sample was skipped.');}}
      finally{clearTimer(watchdog);if(token===generation){job=null;if(enabled){const due=started+intervalMs;schedule(due>now()?due:now()+intervalMs);}}}
    }
    function start(){if(enabled)return;enabled=true;sessionId=getContext().sessionId;generation++;void run(true);}
    function cancelPending(){generation++;job?.abort();job=null;schedule();}
    return {start,stop,cancelPending,active:()=>enabled};
  }
  return {fromRead,createFilter,createRecorder,stats};
});
