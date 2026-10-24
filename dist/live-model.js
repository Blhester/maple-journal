(function(root,factory){const api=factory(typeof module==='object'?require('./core.js'):root.MapleMath,typeof module==='object'?require('./auto-progress.js'):root.MapleAutoProgress);root.MapleLiveModel=api;if(typeof module==='object')module.exports=api;})(typeof window==='object'?window:globalThis,function(M,A){
  'use strict';
  function points(state){const unique=new Map();for(const p of [...(state.checkpoints||[]),...(state.autoPoints||[])])if(!p.preview)unique.set(p.elapsedMs,p);return [...unique.values()].sort((a,b)=>a.elapsedMs-b.elapsedMs);}
  // Forecast the live dashboard and stream from validated capture endpoints.
  // Raw checkpoints retain nulls; forecasts never become the next rate anchor.
  function financialProjection(start){
    const anchors=new Map();
    function component(key,label,value,ms,learn,missing,limit=Infinity){
      const prior=anchors.get(key)||{value:0,ms:0,rate:null};
      if(value!==null&&Number.isFinite(value)){
        if(learn){const span=ms-prior.ms,rate=ms>=60000&&span>=1000?(value-prior.value)/span:prior.rate;anchors.set(key,{value,ms,rate:key==='mesos'?rate:rate===null?null:Math.max(0,rate)});}
        return value;
      }
      missing.push({key,label,mode:prior.rate===null?'held':'rate',ageMs:ms-prior.ms});
      return Math.min(limit,Math.max(key==='mesos'?-start.mesos:0,prior.value+(prior.rate??0)*Math.max(0,ms-prior.ms)));
    }
    return function(point,observed,{learn=true}={}){
      const ms=point.elapsedMs,missing=[],e=point.end;
      const gain=component('mesos','meso balance',e.mesos===null?null:e.mesos-start.mesos,ms,learn,missing);
      let cost=0;
      if(start.uses!==undefined){for(const row of observed.uses){const available=start.uses.find(s=>s.id===row.id).quantity+row.added,used=component('use:'+row.id,row.name,row.used,ms,learn,missing,available);cost+=Math.min(available,Math.max(0,used))*row.cost;}}
      else for(const key of ['hp','mp'])cost+=component(key,key.toUpperCase()+' supply',observed[key+'Used'],ms,learn,missing,start[key]+(e[key+'Added']||0))*start[key+'Cost'];
      const etc=component('etc','ETC drops',observed.etcValue,ms,learn,missing),net=gain-cost+etc;
      const amount=value=>Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER,safe=[gain,cost,etc,net].every(amount);
      return {...observed,supplyCost:amount(cost)?cost:null,cashNet:amount(gain-cost)?gain-cost:null,etcValue:amount(etc)?etc:null,net:safe?net:null,netHour:safe?(observed.rateReady?net*3600000/ms:0):null,estimated:missing.length>0,estimatedComponents:missing};
    };
  }
  function financeRows(start,confirmed){const project=financialProjection(start);return confirmed.map(point=>{const observed=A.stats(start,point);return {point,observed,live:project(point,observed)};});}
  function intervalRows(start,confirmed,{estimate=false,financial=null}={}){
    const rows=[{to:0,expHour:0,netHour:0}];
    let expAnchor={value:0,ms:0},netAnchor={value:0,ms:0},plotAnchor={value:0,ms:0};
    const projected=estimate?(financial||financeRows(start,confirmed)):null;
    for(const [i,point]of confirmed.entries()){
      const s=financial?.[i]?.observed||A.stats(start,point),to=point.elapsedMs,live=projected?.[i]?.live,estimated=!!live?.estimated,net=s.net??live?.net??null,from=estimated?plotAnchor:netAnchor;
      if(to<=expAnchor.ms)continue;
      const rate=(gain,from)=>s.rateReady?gain*3600000/(to-from):0;
      rows.push({to,expFrom:expAnchor.ms,netFrom:from.ms,
        expHour:rate(s.exp-expAnchor.value,expAnchor.ms),
        netHour:net===null?null:rate(net-from.value,from.ms),...(estimated?{netEstimated:true}: {})});
      if(net!==null)plotAnchor={value:net,ms:to};
      expAnchor={value:s.exp,ms:to};
      // Missing financial readings leave a graph gap. The next readable one
      // measures the actual active interval since the last valid net reading.
      if(s.net!==null)netAnchor={value:s.net,ms:to};
    }
    return rows;
  }
  function project(state,{preview=null,lastSample=null,now=Date.now()}={}){
    const confirmed=points(state),all=[...confirmed];if(preview&&preview.elapsedMs>(all.at(-1)?.elapsedMs||0))all.push(preview);
    const point=all.at(-1);
    const forecast=financialProjection(state.start),financial=confirmed.map(point=>{const observed=A.stats(state.start,point);return {point,observed,live:forecast(point,observed)};});
    const stats=point?(point.preview?A.stats(state.start,point):financial.at(-1)?.observed):null;
    const liveStats=point?(point.preview?forecast(point,stats,{learn:false}):financial.at(-1)?.live):null;
    const rows=[{to:0,expHour:0,netHour:0},...all.map((p,i)=>{const s=financial[i]?.observed||stats;return {to:p.elapsedMs,expHour:s.expHour,netHour:s.netHour,preview:!!p.preview};})];
    if(lastSample&&!lastSample.mesosReadable&&lastSample.elapsedMs>(rows.at(-1)?.to||0))rows.push({to:lastSample.elapsedMs,expHour:null,netHour:null});
    return {point,stats,liveStats,liveRows:[{to:0,expHour:0,netHour:0},...financial.map(({point,live})=>({to:point.elapsedMs,expHour:live.expHour,netHour:live.netHour}))],confirmedStats:financial.map(({point,live})=>({ms:point.elapsedMs,exp:live.exp,net:live.net})),rows,intervalRows:intervalRows(state.start,confirmed,{financial}),liveIntervalRows:intervalRows(state.start,confirmed,{estimate:true,financial}),confirmed,activeMs:state.start?M.activeElapsed(state,now):0};
  }
  // Explicit allowlist: only averages/gains from validated capture endpoints
  // leave this boundary. Component forecasts match the live dashboard, while
  // pending OCR, raw balances, item identities and counts remain local.
  function baseline(state){
    const view=project(state),p=view.point,s=view.liveStats;
    return {session:String(state.id),ms:p?.elapsedMs||0,exp:s?.exp||0,net:p?s.net:0};
  }
  function snapshot(state,{lastSample=null,now=Date.now(),since=null}={}){
    if(!state.id||!state.start)return null;
    const view=project(state,{now}),s=view.liveStats,p=view.point;
    let phase=state.stage==='complete'?'complete':state.stage==='ending'?'ending':state.pausedAt?'paused':s?.rateReady?'running':'starting';
    let expHour=s?.expHour||0,netHour=p?s.netHour:0,expTotal=s?.exp||0,netTotal=p?s.net:0,rateReady=!!s?.rateReady;
    let rows=view.liveRows,sampleAt=p?.at??state.startedAt;
    if(phase==='complete'){
      const r=M.calculate(state.start,state.end,M.activeElapsed(state));expHour=r.rates.hour.exp;netHour=(state.start.etc?r.estimatedNet:r.net)*3600000/r.durationMs;expTotal=r.exp;netTotal=state.start.etc?r.estimatedNet:r.net;rateReady=true;sampleAt=state.stoppedAt;
      rows=rows.filter(row=>row.to<r.durationMs).concat({to:r.durationMs,expHour,netHour});
    }
    if(since?.session===String(state.id)&&Number.isFinite(since.ms)&&since.ms>=0&&Number.isFinite(since.exp)&&(since.net===null||Number.isFinite(since.net))){
      // Keep the baseline in the tracker. Recalculate from confirmed cumulative
      // gains, including sub-minute readings whose displayed rates were zero.
      const readings=view.confirmedStats.filter(row=>row.ms>since.ms);
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
      rateReady=!!latest&&(latest.ms-since.ms>=60000||phase==='complete');
      if(['starting','running'].includes(phase))phase=rateReady?'running':'starting';
      view.activeMs=Math.max(0,view.activeMs-since.ms);
    }
    const series=rows.filter(row=>row.to>0).slice(-240).map(row=>({ms:row.to,exp:row.expHour,mesos:row.netHour}));
    return {version:1,session:String(state.id),phase,activeMs:view.activeMs,sampleAt,captureAt:lastSample?.usable?lastSample.at:p?.at??state.startedAt,rateReady,expHour,netHour,expTotal,netTotal,series:[{ms:0,exp:0,mesos:0},...series]};
  }
  return {points,intervalRows,project,snapshot,baseline};
});
