(function(root,factory){const api=factory(typeof module==='object'?require('./core.js'):root.MapleMath,typeof module==='object'?require('./auto-progress.js'):root.MapleAutoProgress);root.MapleLiveModel=api;if(typeof module==='object')module.exports=api;})(typeof window==='object'?window:globalThis,function(M,A){
  'use strict';
  function points(state){const unique=new Map();for(const p of [...(state.checkpoints||[]),...(state.autoPoints||[])])if(!p.preview)unique.set(p.elapsedMs,p);return [...unique.values()].sort((a,b)=>a.elapsedMs-b.elapsedMs);}
  function etcTotals(state){const rows=new Map((state.start?.etc?.baseline||[]).map(r=>[r.itemId,r]));for(const p of points(state))for(const r of p.end.etcReadings||p.end.etc||[])rows.set(r.itemId,r);return [...rows.values()];}
  // Forecast the live dashboard and stream from validated capture endpoints.
  // Raw checkpoints retain nulls; forecasts never become the next rate anchor.
  function financialProjection(start){
    if(start.expOnly)return (point,observed)=>observed;
    const anchors=new Map(),etcItems=new Map((start.etc?.baseline||[]).map(r=>[r.itemId,r])),initialEtc=new Map(etcItems);
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
      let etc=0;
      if(start.etc?.enabled){
        const current=new Map((e.etcReadings||e.etc||[]).map(r=>[r.itemId,r])),known=new Map(etcItems),gaps=[];
        for(const row of current.values())if(!known.has(row.itemId)){known.set(row.itemId,row);if(learn)etcItems.set(row.itemId,row);}
        for(const [id,item]of known){if(!M.isTrackedEtc(start.etc,id))continue;const row=current.get(id),initial=initialEtc.get(id)?.quantity||0,quantity=row&&row.quantity>=initial?row.quantity-initial:null,price=initialEtc.get(id)?.unitPrice??item.unitPrice;etc+=component('etc:'+id,'ETC drops',quantity===null?null:quantity*price,ms,learn,gaps);}
        if(gaps.length||e.etc===null)missing.push({key:'etc',label:'ETC drops',mode:gaps.some(r=>r.mode==='rate')?'rate':'held',ageMs:gaps.length?Math.max(...gaps.map(r=>r.ageMs)):0});
      }
      const net=gain-cost+etc;
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
  function resetMarker(state,now=Date.now()){
    return {kind:'next-reading',session:String(state.id),at:now,ms:M.activeElapsed(state,now)};
  }
  function validReset(state,r){return r?.kind==='next-reading'&&r.session===String(state.id)&&Number.isSafeInteger(r.at)&&r.at>=state.startedAt&&Number.isSafeInteger(r.ms)&&r.ms>=0;}
  function afterReset(state,r,{final=false,finance=false}={}){
    const all=finance&&Array.isArray(state.counterFinancePoints)?[...points(state).filter(p=>p.source!=='automatic'),...state.counterFinancePoints].sort((a,b)=>a.elapsedMs-b.elapsedMs):points(state);if(final&&state.stage==='complete'&&state.end){const ms=M.activeElapsed(state);while(all.at(-1)?.elapsedMs>=ms)all.pop();all.push({end:state.end,elapsedMs:ms,at:state.stoppedAt,source:'reviewed'});}
    return all.filter(p=>p.elapsedMs>r.ms&&(!Number.isFinite(p.at)||p.at>r.at));
  }
  function counterTime(state,now=Date.now()){
    if(!validReset(state,state.counterReset))return M.activeElapsed(state,now);
    const first=[afterReset(state,state.counterReset)[0],afterReset(state,state.counterReset,{finance:true})[0]].filter(Boolean).sort((a,b)=>a.elapsedMs-b.elapsedMs)[0];return first?Math.max(0,M.activeElapsed(state,now)-first.elapsedMs):0;
  }
  function financeStart(start,point){
    const e=point.end,out={...start,level:e.level,exp:e.exp,mesos:e.mesos,hp:e.hp,mp:e.mp};
    if(start.uses)out.uses=start.uses.map(row=>({...row,quantity:e.uses.find(r=>r.id===row.id).quantity}));
    if(start.etc){const current=new Map((e.etc||[]).map(r=>[r.itemId,r])),original=new Map(start.etc.baseline.map(r=>[r.itemId,r]));out.etc={...start.etc,baseline:[...new Map([...start.etc.baseline,...(e.etc||[])].map(r=>[r.itemId,r])).values()].map(row=>({...row,quantity:current.get(row.itemId)?.quantity??row.quantity,unitPrice:original.get(row.itemId)?.unitPrice??row.unitPrice}))};}
    return out;
  }
  function relativePoint(point,anchor){
    const e=point.end,a=anchor.end,end={...e,ledger:[],extraExp:(e.extraExp||0)-(a.extraExp||0),hpAdded:(e.hpAdded||0)-(a.hpAdded||0),mpAdded:(e.mpAdded||0)-(a.mpAdded||0)};
    if(e.uses)end.uses=e.uses.map(r=>({...r,added:r.added-(a.uses.find(x=>x.id===r.id)?.added||0)}));
    return {...point,end,elapsedMs:point.elapsedMs-anchor.elapsedMs};
  }
  // A reset never seeds a baseline from old readings or financial forecasts.
  // EXP and complete net-finance observations establish independent origins.
  function counters(state,{now=Date.now(),reset=state.counterReset,final=false,...options}={}){
    if(!validReset(state,reset))return project(state,{now,...options});
    const expPoints=afterReset(state,reset,{final}),financePoints=state.start.expOnly?[]:afterReset(state,reset,{final,finance:true}),expAnchor=expPoints[0],financeAnchor=financePoints.find(p=>A.stats(state.start,p).net!==null),finance=financeAnchor?financeStart(state.start,financeAnchor):null,forecast=finance?financialProjection(finance):null;
    const expByTime=new Map(expPoints.map(p=>[p.elapsedMs,p])),financeByTime=new Map(financePoints.map(p=>[p.elapsedMs,p]));
    const timeline=new Map([...financePoints,...expPoints].map(p=>[p.elapsedMs,p])),fresh=[...timeline.values()].sort((a,b)=>a.elapsedMs-b.elapsedMs),anchor=fresh[0],origin=anchor?.elapsedMs??reset.ms,activeMs=anchor?Math.max(0,M.activeElapsed(state,now)-origin):0,liveRows=[],interval=[],financial=[];let latest=null,previousExp={value:0,ms:expAnchor?expAnchor.elapsedMs-origin:0},expStats=null,live=null,observed=null,expPoint=null;
    for(const p of fresh){
      const ms=p.elapsedMs-origin,ep=expByTime.get(p.elapsedMs),fp=financeByTime.get(p.elapsedMs);
      if(ep){const span=ep.elapsedMs-expAnchor.elapsedMs,exp=state.start.level?M.position(ep.end.level,ep.end.exp)-M.position(expAnchor.end.level,expAnchor.end.exp):ep.end.exp+(ep.end.extraExp||0)-expAnchor.end.exp-(expAnchor.end.extraExp||0),ready=span>=60000||ep.source==='reviewed'&&span>0,expHour=ready&&span>0?exp*3600000/span:0,remaining=ep.end.level===100?0:ep.end.level?M.expTable[ep.end.level]-ep.end.exp:null;expStats={exp,expHour,expPercentHour:M.levelPercentPerHour(expHour,ep.end.level),remaining,etaMs:remaining===0?0:ready&&expHour>0&&remaining!==null?remaining*3600000/expHour:null,expRateReady:ready};expPoint=ep;}
      if(finance&&fp&&fp.elapsedMs>=financeAnchor.elapsedMs){const relative=relativePoint(fp,financeAnchor);observed=A.stats(finance,{...relative,elapsedMs:Math.max(1,relative.elapsedMs)});if(fp.source==='reviewed'&&relative.elapsedMs>0)observed={...observed,rateReady:true,netHour:observed.net===null?null:observed.net*3600000/relative.elapsedMs};live=forecast(relative,observed);financial.push({point:relative,observed,live});}
      latest={...(live||{}),exp:expStats?.exp??null,expHour:expStats?.expHour??null,expPercentHour:expStats?.expPercentHour??null,remaining:expStats?.remaining??null,etaMs:expStats?.etaMs??null,rateReady:!!expStats?.expRateReady||!!observed?.rateReady,expRateReady:!!expStats?.expRateReady,net:state.start.expOnly?null:live?.net??null,netHour:state.start.expOnly?null:live?.netHour??null,cashNet:live?.cashNet??null,etcValue:live?.etcValue??null,supplyCost:live?.supplyCost??null,estimated:!!live?.estimated,estimatedComponents:live?.estimatedComponents||[],financeReady:!!live,financeRateReady:!!observed?.rateReady,financeMs:financeAnchor&&fp?Math.max(0,fp.elapsedMs-financeAnchor.elapsedMs):null};
      liveRows.push({to:ms,expHour:ep?latest.expHour:null,netHour:fp?latest.netHour:null});
      interval.push({to:ms,expFrom:previousExp.ms,expHour:ep?(expStats.expRateReady&&ms>previousExp.ms?(expStats.exp-previousExp.value)*3600000/(ms-previousExp.ms):0):null,netHour:null});if(ep)previousExp={value:expStats.exp,ms};
    }
    const financeIntervals=finance?intervalRows(finance,financial.map(r=>r.point),{estimate:true,financial}):[],offset=financeAnchor?financeAnchor.elapsedMs-origin:0;
    const financeByOffset=new Map(financeIntervals.map(r=>[r.to+offset,r]));
    for(const row of interval){const f=financeByOffset.get(row.to);if(f)Object.assign(row,{netHour:f.netHour,netFrom:(f.netFrom||0)+offset,...(f.netEstimated?{netEstimated:true}:{})});}
    if(!interval.length)interval.push({to:0,expHour:0,netHour:null});
    const current=fresh.at(-1),financePoint=financePoints.at(-1);
    return {reset,point:current?{...current,end:{...(financePoint?.end||current.end),level:expPoint?.end.level??null,exp:expPoint?.end.exp??null}}:null,stats:latest,liveStats:latest,confirmed:fresh,activeMs,liveRows:liveRows.length?liveRows:[{to:0,expHour:0,netHour:null}],rows:interval,intervalRows:interval,liveIntervalRows:interval,financeAnchor,expPoint,anchor};
  }
  function counterSnapshot(state,{now,lastSample,reset}){
    const view=counters(state,{now,reset,final:true}),s=view.liveStats,p=view.point,phase=state.stage==='complete'?'complete':state.stage==='ending'?'ending':state.pausedAt?'paused':s?.rateReady?'running':'starting';
    let etaMs=s?.etaMs??null;if(etaMs!==null&&p&&phase!=='complete')etaMs=Math.max(0,etaMs-Math.max(0,M.activeElapsed(state,now)-(view.expPoint?.elapsedMs??p.elapsedMs)));
    if(!Number.isFinite(etaMs)||etaMs>Number.MAX_SAFE_INTEGER)etaMs=null;
    const origin=view.liveRows[0]?.to===0?view.liveRows[0]:{to:0,expHour:0,netHour:null},rows=[origin,...view.liveRows.filter(r=>r.to>0).slice(-240)];
    return {expOnly:state.start.expOnly===true,expPercentHour:s?s.expPercentHour:M.levelPercentPerHour(0,state.start.level),etaMs,version:1,session:String(state.id),phase,activeMs:view.anchor?view.activeMs:null,sampleAt:p?.at??reset.at,captureAt:lastSample?.usable&&lastSample.at>reset.at?lastSample.at:p?.at??reset.at,rateReady:!!s?.rateReady,expHour:s?s.expHour:0,netHour:s?.netHour??null,expTotal:s?s.exp:0,netTotal:s?.net??null,series:rows.map(r=>({ms:r.to,exp:r.expHour,mesos:r.netHour}))};
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
    let reset=validReset(state,state.counterReset)?state.counterReset:null;
    if(validReset(state,since)&&(!reset||since.at>=reset.at))reset=since;
    else if(since&&since.kind!=='next-reading'&&Number.isFinite(since.ms)&&reset&&since.ms>reset.ms)reset=null;
    if(reset)return counterSnapshot(state,{now,lastSample,reset});
    const view=project(state,{now}),s=view.liveStats,p=view.point,captureActiveMs=view.activeMs;
    let phase=state.stage==='complete'?'complete':state.stage==='ending'?'ending':state.pausedAt?'paused':s?.rateReady?'running':'starting';
    let expHour=s?.expHour||0,netHour=p?s.netHour:0,expTotal=s?.exp||0,netTotal=p?s.net:0,rateReady=!!s?.rateReady;
    let rows=view.liveRows,sampleAt=p?.at??state.startedAt;
    if(phase==='complete'){
      const r=M.calculate(state.start,state.end,M.activeElapsed(state));expHour=r.rates.hour.exp;netHour=state.start.expOnly?null:(state.start.etc?r.estimatedNet:r.net)*3600000/r.durationMs;expTotal=r.exp;netTotal=state.start.etc?r.estimatedNet:r.net;rateReady=true;sampleAt=state.stoppedAt;
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
    const current=phase==='complete'?state.end:p?.end,level=current?.level||state.start.level,expPercentHour=M.levelPercentPerHour(expHour,level),remaining=level===100?0:!Number.isInteger(level)?null:current?M.expTable[level]-current.exp:null;let etaMs=remaining===0?0:rateReady&&expHour>0&&remaining!==null?remaining*3600000/expHour:null;if(etaMs!==null&&phase!=='complete'&&p)etaMs=Math.max(0,etaMs-Math.max(0,captureActiveMs-p.elapsedMs));
    if(!Number.isFinite(etaMs)||etaMs>Number.MAX_SAFE_INTEGER)etaMs=null;
    if(state.start.expOnly){netHour=netTotal=null;rows=rows.map(r=>({...r,netHour:null}));}
    return {expOnly:state.start.expOnly===true,expPercentHour,etaMs,version:1,session:String(state.id),phase,activeMs:view.activeMs,sampleAt,captureAt:lastSample?.usable?lastSample.at:p?.at??state.startedAt,rateReady,expHour,netHour,expTotal,netTotal,series:[{ms:0,exp:0,mesos:0},...series]};
  }
  return {points,etcTotals,intervalRows,project,snapshot,baseline,resetMarker,counterTime,counters};
});
