(function(root,factory){const api=factory(typeof module!=='undefined'?require('./core.js'):root.MapleMath);root.MapleAutoProgress=api;if(typeof module!=='undefined')module.exports=api;})(typeof window!=='undefined'?window:globalThis,function(M){
  'use strict';
  const keys=['level','exp','mesos','hp','mp'];
  const median=values=>{const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
  function fromRead(read,start,elapsedMs){
    const end={hpAdded:0,mpAdded:0,extraExp:0,ledger:[]};
    for(const key of keys){
      const r=read.results[key],consensus=r?.votes>=2&&r.votes>r.readCount/2;
      const font=['classic-exp','classic-digits'].includes(r?.method),trustedText=consensus||(!r?.disagrees&&Number.isFinite(r?.confidence)&&r.confidence>=70);
      if(!r||r.value===null||r.value===undefined||r.needsConfirmation||(!font&&!trustedText))throw new Error('Uncertain '+key+' reading; sample skipped.');
      end[key]=M.integer(r.value,key);
    }
    if(!start.level)throw new Error('Record a starting level before enabling automatic progress.');
    M.position(end.level,end.exp);
    if(end.level<start.level)throw new Error('Level is below the starting level; sample skipped.');
    if(!Number.isSafeInteger(read.at)||!Number.isFinite(elapsedMs)||elapsedMs<=0)throw new Error('Invalid snapshot time.');
    return {end,elapsedMs,at:read.at,source:'automatic'};
  }
  function createFilter({start,anchor}){
    let base=anchor||{end:{...start,hpAdded:0,mpAdded:0,extraExp:0,ledger:[]},elapsedMs:0},pending=null,held=[],rates=[],lastTime=base.elapsedMs;
    function vector(point){return {exp:M.position(point.end.level,point.end.exp),mesos:point.end.mesos,hp:point.end.hp,mp:point.end.mp};}
    function follows(a,b){
      if(b.elapsedMs<=a.elapsedMs)return false;
      const x=vector(a),y=vector(b);
      return y.exp>=x.exp&&y.mesos>=x.mesos&&y.hp<=x.hp&&y.mp<=x.mp;
    }
    function speed(a,b){const x=vector(a),y=vector(b),minutes=(b.elapsedMs-a.elapsedMs)/60000;return Object.fromEntries(Object.keys(x).map(k=>[k,Math.abs(y[k]-x[k])/minutes]));}
    function unusual(point){
      if(rates.length<3)return false;
      const rate=speed(base,point),floor={exp:Math.max(100,(M.expTable[base.end.level]||100)*.02),mesos:5000,hp:10,mp:10};
      return Object.keys(rate).some(k=>{const values=rates.map(r=>r[k]),m=median(values),mad=median(values.map(x=>Math.abs(x-m)));return rate[k]>m*5+mad*6+floor[k];});
    }
    function offer(point){
      if(!Number.isFinite(point.elapsedMs)||point.elapsedMs<=lastTime)throw new Error('Snapshot times must increase.');
      point={...point,end:{...point.end,hpAdded:base.end.hpAdded||0,mpAdded:base.end.mpAdded||0,extraExp:0,ledger:[]}};
      vector(point);lastTime=point.elapsedMs;const accepted=[],rejected=[];
      if(!follows(base,point)){
        held.push(point);if(held.length>4)rejected.push({point:held.shift(),reason:'Unconfirmed change; review a manual checkpoint.'});
        return {accepted,rejected,pending,held:held.length,message:'Reading held: possible OCR error, restock, spend or EXP loss. A return to the prior trend discards it; log a manual checkpoint for a real change.'};
      }
      for(const suspect of held)rejected.push({point:suspect,reason:'Later reading returned to the prior trend.'});held=[];
      if(pending){
        if(!follows(pending,point))rejected.push({point:pending,reason:'Isolated spike or dip contradicted by the next reading.'});
        else if(unusual(pending))rejected.push({point:pending,reason:'Rate is far outside the recent pattern; review manually.'});
        else {
          M.calculate(start,pending.end,pending.elapsedMs);
          rates.push(speed(base,pending));rates=rates.slice(-7);base=pending;accepted.push(pending);
        }
      }
      pending=point;
      return {accepted,rejected,pending,held:0,message:accepted.length?'Checkpoint confirmed. Latest sample is waiting for the next reading.':'Sample waiting for the next reading. No value was guessed or filled in.'};
    }
    function rebase(point){base=point;pending=null;held=[];rates=[];lastTime=point.elapsedMs;}
    return {offer,rebase};
  }
  // One bounded job at a time. Late browser timers take one fresh sample, never
  // replay missed minutes or invent timestamps. Permission is requested only
  // by start(), which must be called directly from the user's toggle gesture.
  function createRecorder({sample,getContext,onSample,onStatus=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,intervalMs=60000,timeoutMs=45000}){
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
        const timeout=new Promise((_,reject)=>{watchdog=setTimer(()=>{const error=new Error('Snapshot reading timed out; this minute was skipped.');controller.abort(error);reject(error);},timeoutMs);});
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
  return {fromRead,createFilter,createRecorder};
});
