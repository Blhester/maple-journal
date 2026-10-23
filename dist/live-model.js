(function(root,factory){const api=factory(typeof module==='object'?require('./core.js'):root.MapleMath,typeof module==='object'?require('./auto-progress.js'):root.MapleAutoProgress);root.MapleLiveModel=api;if(typeof module==='object')module.exports=api;})(typeof window==='object'?window:globalThis,function(M,A){
  'use strict';
  function points(state){const unique=new Map();for(const p of [...(state.checkpoints||[]),...(state.autoPoints||[])])if(!p.preview)unique.set(p.elapsedMs,p);return [...unique.values()].sort((a,b)=>a.elapsedMs-b.elapsedMs);}
  function intervalRows(start,confirmed){
    const rows=[{to:0,expHour:0,netHour:0}];
    let expAnchor={value:0,ms:0},netAnchor={value:0,ms:0};
    for(const point of confirmed){
      const s=A.stats(start,point),to=point.elapsedMs;
      if(to<=expAnchor.ms)continue;
      const rate=(gain,from)=>s.rateReady?gain*3600000/(to-from):0;
      rows.push({to,expFrom:expAnchor.ms,netFrom:netAnchor.ms,
        expHour:rate(s.exp-expAnchor.value,expAnchor.ms),
        netHour:s.net===null?null:rate(s.net-netAnchor.value,netAnchor.ms)});
      expAnchor={value:s.exp,ms:to};
      // Missing financial readings leave a graph gap. The next readable one
      // measures the actual active interval since the last valid net reading.
      if(s.net!==null)netAnchor={value:s.net,ms:to};
    }
    return rows;
  }
  function project(state,{preview=null,lastSample=null,now=Date.now()}={}){
    const confirmed=points(state),all=[...confirmed];if(preview&&preview.elapsedMs>(all.at(-1)?.elapsedMs||0))all.push(preview);
    const point=all.at(-1),stats=point?A.stats(state.start,point):null;
    const rows=[{to:0,expHour:0,netHour:0},...all.map(p=>{const s=A.stats(state.start,p);return {to:p.elapsedMs,expHour:s.expHour,netHour:s.netHour,preview:!!p.preview};})];
    if(lastSample&&!lastSample.mesosReadable&&lastSample.elapsedMs>(rows.at(-1)?.to||0))rows.push({to:lastSample.elapsedMs,expHour:null,netHour:null});
    return {point,stats,rows,intervalRows:intervalRows(state.start,confirmed),confirmed,activeMs:state.start?M.activeElapsed(state,now):0};
  }
  // Explicit allowlist: neither the running session nor its raw values leave
  // this boundary. Calling without preview gives confirmed-only stream data.
  function baseline(state){
    const p=points(state).at(-1),s=p?A.stats(state.start,p):null;
    return {session:String(state.id),ms:p?.elapsedMs||0,exp:s?.exp||0,net:p?s.net:0};
  }
  function snapshot(state,{lastSample=null,now=Date.now(),since=null}={}){
    if(!state.id||!state.start)return null;
    const view=project(state,{now}),s=view.stats,p=view.point;
    let phase=state.stage==='complete'?'complete':state.stage==='ending'?'ending':state.pausedAt?'paused':s?.rateReady?'running':'starting';
    let expHour=s?.expHour||0,netHour=p?(p.end.mesos===null?null:s.netHour):0,expTotal=s?.exp||0,netTotal=p?s.net:0,rateReady=!!s?.rateReady;
    let rows=view.rows,sampleAt=p?.at??state.startedAt;
    if(lastSample?.mesosReadable===false){netHour=null;netTotal=null;}
    if(phase==='complete'){
      const r=M.calculate(state.start,state.end,M.activeElapsed(state));expHour=r.rates.hour.exp;netHour=(state.start.etc?r.estimatedNet:r.net)*3600000/r.durationMs;expTotal=r.exp;netTotal=state.start.etc?r.estimatedNet:r.net;rateReady=true;sampleAt=state.stoppedAt;
      rows=rows.filter(row=>row.to<r.durationMs).concat({to:r.durationMs,expHour,netHour});
    }
    if(since?.session===String(state.id)&&Number.isFinite(since.ms)&&since.ms>=0&&Number.isFinite(since.exp)&&(since.net===null||Number.isFinite(since.net))){
      // Keep the baseline in the tracker. Recalculate from confirmed cumulative
      // gains, including sub-minute readings whose displayed rates were zero.
      const readings=view.confirmed.map(point=>{const value=A.stats(state.start,point);return {ms:point.elapsedMs,exp:value.exp,net:value.net};}).filter(row=>row.ms>since.ms);
      if(phase==='complete'){
        const ms=M.activeElapsed(state);readings.splice(0,readings.length,...readings.filter(row=>row.ms<ms),...(ms>since.ms?[{ms,exp:expTotal,net:netTotal}]:[]));
      }
      // An unreadable balance at reset needs a fresh known balance before
      // counting mesos again; never treat N/A as a zero balance.
      const anchor=since.net===null?readings.find(row=>row.net!==null):{ms:since.ms,net:since.net};
      const rate=(value,ms)=>value===null?null:ms>0&&(ms>=60000||phase==='complete')?value*3600000/ms:0;
      rows=readings.map(row=>({to:row.ms-since.ms,expHour:rate(row.exp-since.exp,row.ms-since.ms),netHour:row.net===null||!anchor||row.ms<anchor.ms?null:rate(row.net-anchor.net,row.ms-anchor.ms)}));
      const latest=readings.at(-1);expTotal=latest?latest.exp-since.exp:0;netTotal=!anchor||latest?.net===null?null:latest?latest.net-anchor.net:0;
      expHour=rows.at(-1)?.expHour??0;netHour=rows.length?rows.at(-1).netHour:since.net===null?null:0;
      if(phase!=='complete'&&lastSample?.mesosReadable===false){netHour=null;netTotal=null;}
      rateReady=!!latest&&(latest.ms-since.ms>=60000||phase==='complete');
      if(['starting','running'].includes(phase))phase=rateReady?'running':'starting';
      view.activeMs=Math.max(0,view.activeMs-since.ms);
    }
    const series=rows.filter(row=>row.to>0).slice(-240).map(row=>({ms:row.to,exp:row.expHour,mesos:row.netHour}));
    return {version:1,session:String(state.id),phase,activeMs:view.activeMs,sampleAt,captureAt:lastSample?.usable?lastSample.at:p?.at??state.startedAt,rateReady,expHour,netHour,expTotal,netTotal,series:[{ms:0,exp:0,mesos:0},...series]};
  }
  return {points,intervalRows,project,snapshot,baseline};
});
