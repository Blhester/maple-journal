(function(root,factory){const api=factory(typeof module==='object'?require('./core.js'):root.MapleMath,typeof module==='object'?require('./auto-progress.js'):root.MapleAutoProgress);root.MapleLiveModel=api;if(typeof module==='object')module.exports=api;})(typeof window==='object'?window:globalThis,function(M,A){
  'use strict';
  function points(state){const unique=new Map();for(const p of [...(state.checkpoints||[]),...(state.autoPoints||[])])if(!p.preview)unique.set(p.elapsedMs,p);return [...unique.values()].sort((a,b)=>a.elapsedMs-b.elapsedMs);}
  function project(state,{preview=null,lastSample=null,now=Date.now()}={}){
    const confirmed=points(state),all=[...confirmed];if(preview&&preview.elapsedMs>(all.at(-1)?.elapsedMs||0))all.push(preview);
    const point=all.at(-1),stats=point?A.stats(state.start,point):null;
    const rows=[{to:0,expHour:0,netHour:0},...all.map(p=>{const s=A.stats(state.start,p);return {to:p.elapsedMs,expHour:s.expHour,netHour:s.netHour,preview:!!p.preview};})];
    if(lastSample&&!lastSample.mesosReadable&&lastSample.elapsedMs>(rows.at(-1)?.to||0))rows.push({to:lastSample.elapsedMs,expHour:null,netHour:null});
    return {point,stats,rows,confirmed,activeMs:state.start?M.activeElapsed(state,now):0};
  }
  // Explicit allowlist: neither the running session nor its raw values leave
  // this boundary. Calling without preview gives confirmed-only stream data.
  function snapshot(state,{lastSample=null,now=Date.now()}={}){
    if(!state.id||!state.start)return null;
    const view=project(state,{now}),s=view.stats,p=view.point;
    let phase=state.stage==='complete'?'complete':state.stage==='ending'?'ending':state.pausedAt?'paused':s?.rateReady?'running':'starting';
    let expHour=s?.expHour||0,netHour=p?(p.end.mesos===null?null:s.netHour):0,expTotal=s?.exp||0,netTotal=p?s.net:0,rateReady=!!s?.rateReady;
    let rows=view.rows,sampleAt=p?.at??state.startedAt;
    if(lastSample?.mesosReadable===false){netHour=null;netTotal=null;}
    if(phase==='complete'){
      const r=M.calculate(state.start,state.end,M.activeElapsed(state));expHour=r.rates.hour.exp;netHour=r.rates.hour.mesos;expTotal=r.exp;netTotal=r.net;rateReady=true;sampleAt=state.stoppedAt;
      rows=rows.filter(row=>row.to<r.durationMs).concat({to:r.durationMs,expHour,netHour});
    }
    const series=rows.filter(row=>row.to>0).slice(-240).map(row=>({ms:row.to,exp:row.expHour,mesos:row.netHour}));
    return {version:1,session:String(state.id),phase,activeMs:view.activeMs,sampleAt,captureAt:lastSample?.usable?lastSample.at:p?.at??state.startedAt,rateReady,expHour,netHour,expTotal,netTotal,series:[{ms:0,exp:0,mesos:0},...series]};
  }
  return {points,project,snapshot};
});
