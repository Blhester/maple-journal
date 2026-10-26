(function (root) {
  'use strict';
  const catalog = {
    hp: [
      {id:'meat',name:'Meat',cost:80},
      {id:'red',name:'Red Potion',cost:50},
      {id:'orange',name:'Orange Potion',cost:150},
      {id:'white',name:'White Potion',cost:350},
      {id:'apple',name:'Apple',cost:20},
      {id:'fried-chicken',name:'Fried Chicken',cost:60},
      {id:'hot-dog',name:'Hot Dog',cost:180},
      {id:'unagi',name:'Unagi',cost:1000},
      {id:'custom',name:'Custom HP item',cost:0}
    ],
    mp: [
      {id:'lemon',name:'Lemon',cost:150},
      {id:'blue',name:'Blue Potion',cost:220},
      {id:'water',name:'Pure Water',cost:1120},
      {id:'orange-fruit',name:'Orange',cost:50},
      {id:'orange-juice',name:'Orange Juice',cost:540},
      {id:'custom',name:'Custom MP item',cost:0}
    ]
  };
  function integer(value, label) {
    if (value === null || value === undefined || typeof value === 'boolean') throw new Error(label + ' must be a whole number of 0 or more.');
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) throw new Error(label + ' must be a whole number of 0 or more.');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(label + ' must be a safe whole number of 0 or more.');
    return n;
  }
  // Classic launch formulas: https://meowdb.com/msclassic/formulas/leveling
  const expTable = [0];
  const cumulative = [0,0];
  for (let level=1;level<=99;level++) {
    const q=Math.floor(level*level/3);
    expTable[level]=level<=5?(Math.floor(level*level/2)+15)*level:level<=50?(q+19)*q:level<=89?Math.floor(expTable[level-1]*10548/10000):Math.floor(expTable[level-1]*21/10);
    cumulative[level+1]=cumulative[level]+expTable[level];
  }
  function levelNumber(value) {
    const n=integer(value,'Level');
    if(n<1||n>100)throw new Error('Levels must be between 1 and 100.');
    return n;
  }
  function levelPercentPerHour(expHour,level){
    if(level===null||level===undefined||level==='')return null;
    const current=levelNumber(level);if(current===100)return null;
    if(!Number.isFinite(expHour))throw new Error('Invalid EXP hourly rate.');
    return expHour*100/expTable[current];
  }
  function position(level,exp) {
    const n=levelNumber(level), xp=integer(exp,'EXP');
    if((n===100&&xp!==0)||(n<100&&xp>=expTable[n]))throw new Error('At level '+n+', EXP must be '+(n===100?'0.':'between 0 and '+(expTable[n]-1).toLocaleString('en-US')+'.'));
    return cumulative[n]+xp;
  }
  function activeElapsed(session,now=Date.now()) {
    if(!session.startedAt)return 0;
    const endpoint=session.stoppedAt ?? session.pausedAt ?? now;
    return Math.max(0,endpoint-session.startedAt-(session.pausedMs||0));
  }
  function ledgerValue(entry) {
    if(entry.source!=='etc')return integer(entry.value,'Ledger value');
    if(!['loot','income'].includes(entry.kind)||!/^\d{1,10}$/.test(String(entry.itemId)))throw new Error('Invalid ETC loot entry.');
    const quantity=integer(entry.quantity,'ETC quantity'),price=integer(entry.unitPrice,'ETC vendor price');
    if(quantity===0)throw new Error('ETC quantity must be at least 1.');
    const value=quantity*price;
    if(!Number.isSafeInteger(value))throw new Error('ETC value is too large.');
    if(integer(entry.value,'ETC total')!==value)throw new Error('ETC total must match quantity × vendor price.');
    return value;
  }
  function profitRates(result,metric='net') {
    if(!['net','adjustedNet','estimatedNet'].includes(metric))throw new Error('Unknown profit metric.');if(result.expOnly)return {hour:null,ten:null,minute:null};
    return Object.fromEntries([['hour',3600000],['ten',600000],['minute',60000]].map(([key,ms])=>[key,result[metric]*ms/result.durationMs]));
  }
  function ledgerTotals(entries=[]) {
    if(!Array.isArray(entries)||entries.length>1000)throw new Error('The ledger must contain no more than 1,000 entries.');
    const totals={loot:0,income:0,expense:0};
    for(const entry of entries){
      if(!entry||!Object.hasOwn(totals,entry.kind))throw new Error('Unknown ledger entry type.');
      totals[entry.kind]+=ledgerValue(entry);
    }
    if(!Object.values(totals).every(Number.isSafeInteger))throw new Error('Ledger totals are too large.');
    return totals;
  }
  // Generic shortcut supplies are authoritative when present. Legacy HP/MP
  // fields remain readable so existing recordings keep exactly the same totals.
  function cleanUses(rows){
    if(!Array.isArray(rows)||rows.length>12)throw new Error('Track up to 12 use slots.');
    const ids=new Set(),items=new Set();
    return rows.map(row=>{
      if(!row||!/^[a-zA-Z0-9_-]{1,40}$/.test(row.id)||ids.has(row.id))throw new Error('Invalid or duplicate use slot.');ids.add(row.id);
      const itemId=String(row.itemId||'custom');if(!/^(?:[0-9]{1,10}|custom)$/.test(itemId))throw new Error('Invalid use item.');
      if(itemId!=='custom'&&items.has(itemId))throw new Error('Track each item once: duplicate hotkeys share the same inventory count.');items.add(itemId);
      const out={id:row.id,itemId,name:String(row.name||'Custom use item').slice(0,100),quantity:integer(row.quantity,'Starting use quantity'),cost:integer(row.cost,'Use item unit cost')};
      if(row.ocr){const o=row.ocr;if(!['general','quantity-font','exp-font'].includes(o.reader)||!['gray','light','dark','neutral','gold'].includes(o.mode))throw new Error('Invalid use OCR settings.');out.ocr={reader:o.reader,mode:o.mode,invert:!!o.invert};for(const [key,lo,hi]of [['contrast',.5,3],['brightness',-80,80],['threshold',30,240],['chroma',0,255],['scale',2,6]]){if(!Number.isFinite(o[key])||o[key]<lo||o[key]>hi)throw new Error('Invalid use image setting.');out.ocr[key]=o[key];}}
      for(const field of ['region','countRegion'])if(row[field]){const r=row[field];if(!['x','y','w','h'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>1.00001||r.y+r.h>1.00001)throw new Error('Invalid use slot region.');out[field]={x:r.x,y:r.y,w:r.w,h:r.h};}
      return out;
    });
  }
  function cleanUseEnd(start,rows,{partial=false}={}){
    const slots=cleanUses(start.uses);if(!Array.isArray(rows)||rows.length!==slots.length)throw new Error('Review a remaining quantity for every use slot.');
    const byId=new Map(rows.map(row=>[row.id,row]));if(byId.size!==rows.length)throw new Error('Duplicate use reading.');
    return slots.map(slot=>{const row=byId.get(slot.id);if(!row)throw new Error('Missing use reading: '+slot.name);const quantity=partial&&row.quantity===null?null:integer(row.quantity,'Remaining '+slot.name),added=integer(row.added??0,'Added '+slot.name);if(!Number.isSafeInteger(slot.quantity+added))throw new Error('Use quantities are too large.');if(quantity!==null&&quantity>slot.quantity+added)throw new Error('Confirm pickups or restocks for '+slot.name+'.');return {id:slot.id,quantity,added};});
  }
  function useTotals(start,end,ms,{partial=false}={}){
    if(start.uses===undefined)return null;
    const slots=cleanUses(start.uses),rows=cleanUseEnd(start,end.uses,{partial});
    const details=slots.map((slot,i)=>{const row=rows[i],used=row.quantity===null?null:slot.quantity+row.added-row.quantity,cost=used===null?null:used*slot.cost;if(cost!==null&&!Number.isSafeInteger(cost))throw new Error('Use costs are too large.');return {...slot,...row,used,totalCost:cost,perMinute:used===null?null:used*60000/ms,runwayMs:row.quantity===null?null:row.quantity===0?0:used>0?row.quantity*ms/used:null};});
    const cost=details.some(r=>r.totalCost===null)?null:details.reduce((n,r)=>n+r.totalCost,0);if(cost!==null&&!Number.isSafeInteger(cost))throw new Error('Use costs are too large.');return {details,cost};
  }
  function cleanEtcItems(items){
    if(!Array.isArray(items)||items.length>30)throw Error('ETC tracking supports 30 visible item types.');const ids=new Set();return items.map(r=>{const itemId=String(r.itemId);if(!/^\d{1,10}$/.test(itemId)||ids.has(itemId))throw Error('Invalid or duplicate ETC item.');ids.add(itemId);return {itemId,name:String(r.name||'ETC item').slice(0,100),quantity:integer(r.quantity,'ETC count'),unitPrice:integer(r.unitPrice,'ETC vendor price')};});
  }
  function cleanEtc(config){
    if(!config?.enabled)return undefined;const r=config.region;if(!r||!['x','y','w','h'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>1||r.y+r.h>1)throw Error('Invalid ETC inventory region.');
    if(!Array.isArray(config.excluded)||config.excluded.length>331||config.excluded.some(id=>!/^\d{1,10}$/.test(id)))throw Error('Invalid ETC exclusions.');
    const ignoredCells=config.ignoredCells||[];if(!Array.isArray(ignoredCells)||ignoredCells.length>30||ignoredCells.some(i=>!Number.isInteger(i)||i<0||i>=30))throw Error('Invalid ETC ignored cells.');return {enabled:true,ignoredCells:[...new Set(ignoredCells)],region:{x:r.x,y:r.y,w:r.w,h:r.h},baseline:cleanEtcItems(config.baseline),excluded:[...new Set(config.excluded)]};
  }
  function etcLoot(start,end){
    const config=cleanEtc(start.etc);if(!config)return [];
    if(!end.etc)return null;const rows=cleanEtcItems(end.etc),old=new Map(config.baseline.map(r=>[r.itemId,r])),now=new Map(rows.map(r=>[r.itemId,r])),excluded=new Set(config.excluded);
    for(const r of config.baseline)if(!excluded.has(r.itemId)&&(!now.has(r.itemId)||now.get(r.itemId).quantity<r.quantity))return null;
    return rows.filter(r=>!excluded.has(r.itemId)).map(r=>{const initial=old.get(r.itemId),quantity=r.quantity-(initial?.quantity||0),unitPrice=initial?.unitPrice??r.unitPrice;if(quantity<0)return null;const value=quantity*unitPrice;if(!Number.isSafeInteger(value))throw Error('ETC value is too large.');return {source:'etc',itemId:r.itemId,label:initial?.name||r.name,quantity,unitPrice,value,kind:'loot'};}).filter(r=>r&&r.quantity>0);
  }
  function calculate(start, end, durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('The session needs a positive elapsed time.');
    if(start.expOnly===true){const from=levelNumber(start.level),to=levelNumber(end.level);if(to<from)throw Error('Ending level cannot be below starting level.');const exp=position(to,integer(end.exp,'Ending EXP'))-position(from,integer(start.exp,'Starting EXP')),rates=Object.fromEntries([['hour',3600000],['ten',600000],['minute',60000]].map(([key,ms])=>[key,{exp:exp*ms/durationMs,mesos:null}]));return {expOnly:true,exp,durationMs,rates,expPercentHour:levelPercentPerHour(rates.hour.exp,to),net:null,adjustedNet:null,estimatedNet:null,etcDrops:[],ledger:{loot:0,income:0,expense:0}};}
    const values = {};
    for (const key of ['exp','mesos','hp','mp']) values[key] = integer(end[key], 'Ending ' + key);
    const extraExp = integer(end.extraExp ?? 0, 'Level-up EXP');
    const initial={};for(const key of ['exp','mesos','hp','mp','hpCost','mpCost'])initial[key]=integer(start[key],'Starting '+key);
    const hpUsed = initial.hp + integer(end.hpAdded ?? 0, 'HP potions added') - values.hp;
    const mpUsed = initial.mp + integer(end.mpAdded ?? 0, 'MP potions added') - values.mp;
    if (hpUsed < 0 || mpUsed < 0) throw new Error('Ending potions exceed your starting supply. Enter pickups or restocks under Adjustments.');
    const hpCost = hpUsed * initial.hpCost, mpCost = mpUsed * initial.mpCost;
    const gross = values.mesos - initial.mesos;
    const uses=useTotals(start,end,durationMs),supplyCost=uses?uses.cost:hpCost+mpCost;
    const net = gross - supplyCost;
    let exp = values.exp - initial.exp + extraExp;
    const hasLevel=start.level!==undefined&&start.level!==null&&start.level!=='';
    if(hasLevel){
      const from=levelNumber(start.level), to=levelNumber(end.level);
      if(to<from)throw new Error('Ending level cannot be below starting level.');
      if(extraExp!==0)throw new Error('Leave manual level-up EXP at 0 when using starting and ending levels.');
      exp=position(to,values.exp)-position(from,initial.exp);
    }
    if (![hpUsed,mpUsed,hpCost,mpCost,gross,net,exp].every(Number.isSafeInteger)) throw new Error('These totals are too large. Use smaller values.');
    const per = ms => ({exp: exp * ms / durationMs, mesos: net * ms / durationMs});
    const rates = {hour:per(3600000),ten:per(600000),minute:per(60000)};
    if (!Object.values(rates).every(r => Number.isFinite(r.exp) && Number.isFinite(r.mesos))) throw new Error('Rates could not be calculated. Check your elapsed time.');
    const drops=etcLoot(start,end);if(drops===null)throw Error('Review the ending ETC counts or turn off ETC tracking for this run.');const manual=end.ledger||[];if(drops.some(r=>manual.some(e=>e.source==='etc'&&String(e.itemId)===r.itemId)))throw Error('An automatically tracked ETC item is also in the manual loot list. Remove one to avoid double-counting.');const ledger=ledgerTotals([...manual,...drops]);
    const adjustedNet=net+ledger.income-ledger.expense,estimatedNet=adjustedNet+ledger.loot;
    if(![adjustedNet,estimatedNet].every(Number.isSafeInteger))throw new Error('Adjusted totals are too large.');
    return {hpUsed,mpUsed,hpCost,mpCost,gross,net,exp,durationMs,rates,expPercentHour:levelPercentPerHour(rates.hour.exp,hasLevel?end.level:null),ledger,adjustedNet,estimatedNet,supplyCost,uses:uses?.details,etcDrops:drops,
      hpPerMinute:hpUsed*60000/durationMs,mpPerMinute:mpUsed*60000/durationMs,
      supplyCostPerHour:supplyCost*3600000/durationMs,
      supplyShare:gross>0?supplyCost*100/gross:null,
      hpRunwayMs:values.hp===0?0:hpUsed>0?values.hp*durationMs/hpUsed:null,
      mpRunwayMs:values.mp===0?0:mpUsed>0?values.mp*durationMs/mpUsed:null};
  }
  function forecast(end,result,target) {
    const projections=[30,60].map(minutes=>({minutes,exp:result.exp*minutes*60000/result.durationMs,mesos:result.expOnly?null:result.net*minutes*60000/result.durationMs}));
    if(end.level===null||end.level===undefined||end.level==='')return {projections,remaining:null,etaMs:null,reason:'Add starting and ending levels for a leveling estimate.'};
    const current=levelNumber(end.level), to=target?levelNumber(target):Math.min(100,current+1);
    const remaining=Math.max(0,cumulative[to]-position(current,end.exp));
    const etaMs=remaining===0?0:result.exp>0?remaining*result.durationMs/result.exp:null;
    return {projections,remaining,etaMs,target:to,reason:etaMs===null?'A positive EXP pace is needed for an ETA.':current===100?'Level 100 table endpoint reached.':to<=current?'Target already reached.':''};
  }
  function intervals(start,checkpoints,end,durationMs) {
    const points=[...(checkpoints||[])];
    if(end&&durationMs>0)points.push({end,elapsedMs:durationMs,final:true});
    let previous={exp:0,net:0,time:0};const rows=[];
    for(const point of points){
      if(!Number.isFinite(point.elapsedMs)||point.elapsedMs<=previous.time)throw new Error('Checkpoint times must increase.');
      const total=calculate(start,point.end,point.elapsedMs);if(start.expOnly){const span=point.elapsedMs-previous.time;rows.push({from:previous.time,to:point.elapsedMs,exp:total.exp-previous.exp,net:null,expHour:(total.exp-previous.exp)*3600000/span,netHour:null,final:!!point.final});previous={exp:total.exp,net:0,time:point.elapsedMs};continue;}if(start.etc?.enabled)total.net=total.estimatedNet;const span=point.elapsedMs-previous.time;
      rows.push({from:previous.time,to:point.elapsedMs,exp:total.exp-previous.exp,net:total.net-previous.net,expHour:(total.exp-previous.exp)*3600000/span,netHour:(total.net-previous.net)*3600000/span,final:!!point.final});
      previous={exp:total.exp,net:total.net,time:point.elapsedMs};
    }
    return rows;
  }
  function groupMaps(sessions,metric='net') {
    if(!['net','adjustedNet','estimatedNet'].includes(metric))throw new Error('Unknown profit metric.');
    const groups=new Map();
    for(const session of sessions){
      const name=(session.meta?.map||'Unspecified map').trim()||'Unspecified map',key=name.toLocaleLowerCase('en-US');
      const r=calculate(session.start,session.end,activeElapsed(session));
      const g=groups.get(key)||{map:name,runs:0,time:0,exp:0,mesos:0};
      g.runs++;g.time+=r.durationMs;g.exp+=r.exp;if(!r.expOnly){g.mesos+=r[metric];g.financeTime=(g.financeTime||0)+r.durationMs;}groups.set(key,g);
    }
    return [...groups.values()].map(g=>({...g,expHour:g.exp*3600000/g.time,netHour:g.financeTime?g.mesos*3600000/g.financeTime:null})).sort((a,b)=>b.expHour-a.expHour);
  }
  function normalizeProgress(start,points=[],maxTime=Infinity){
    if(!Array.isArray(points)||points.length>5000)throw new Error('Invalid automatic progress list.');let previous=0;
    function inference(point,end){
      if(point.expPercent===undefined)return {};
      const percent=point.expPercent;if(typeof percent!=='string'||!/^(?:\d{1,2}\.\d{2}|100\.00)$/.test(percent))throw Error('Invalid progress EXP percentage.');
      const basis=Number(percent.replace('.','')),expected=end.level===100||basis===10000?0:Number(BigInt(expTable[end.level])*BigInt(basis)/10000n);
      if(end.exp!==expected||end.level===100&&basis!==0&&basis!==10000)throw Error('Progress percentage does not match level and EXP.');
      return {expPercent:percent,...(point.levelInferred===true?{levelInferred:true}:{})};
    }
    return points.map(point=>{
      const elapsedMs=integer(point.elapsedMs,'Progress time'),e=point.end;if(elapsedMs<=previous||elapsedMs>maxTime||!e)throw new Error('Invalid automatic progress timing.');previous=elapsedMs;
      if(start.expOnly){const end={level:levelNumber(e.level),exp:integer(e.exp,'Progress EXP'),mesos:null,hp:null,mp:null,hpAdded:0,mpAdded:0,extraExp:0,ledger:[]};calculate(start,end,elapsedMs);return {elapsedMs,end,source:'automatic',...inference(point,end),...(point.at?{at:integer(point.at,'Progress capture time')}: {})};}
      const end={...(start.etc?{etc:e.etc===null||e.etc===undefined?null:cleanEtcItems(e.etc)}:{}),mesos:e.mesos===null?null:integer(e.mesos,'Progress mesos'),level:levelNumber(e.level),extraExp:0,ledger:[]};
      if(start.etc&&e.etcReadings!==undefined)end.etcReadings=cleanEtcItems(e.etcReadings);
      for(const key of ['exp','hp','mp','hpAdded','mpAdded'])end[key]=['hp','mp'].includes(key)&&e[key]===null?null:integer(e[key]??(['hpAdded','mpAdded'].includes(key)?0:undefined),'Progress '+key);
      if(!start.level||end.level<start.level)throw new Error('Invalid progress level.');position(end.level,end.exp);
      let supplyCost=0;for(const key of ['hp','mp']){const available=start[key]+end[key+'Added'];if(!Number.isSafeInteger(available))throw new Error('Progress supplies are too large.');if(end[key]===null)continue;const used=available-end[key];if(used<0)throw new Error('Progress supplies need confirmed additions.');if(!Number.isSafeInteger(used))throw new Error('Progress supplies are too large.');supplyCost+=used*start[key+'Cost'];}if(!Number.isSafeInteger(supplyCost))throw new Error('Progress cost is too large.');
      if(start.uses!==undefined){end.uses=cleanUseEnd(start,e.uses,{partial:true});useTotals(start,end,elapsedMs,{partial:true});}
      if((!start.etc||etcLoot(start,end)!==null)&&end.mesos!==null&&end.hp!==null&&end.mp!==null&&(!end.uses||end.uses.every(r=>r.quantity!==null)))calculate(start,end,elapsedMs);
      return {elapsedMs,end,source:'automatic',...inference(point,end),...(point.at?{at:integer(point.at,'Progress capture time')}: {})};
    });
  }
  function normalizeSession(raw) {
    if(!raw||typeof raw!=='object')throw new Error('Invalid session record.');
    const startedAt=integer(raw.startedAt,'Start time'),stoppedAt=integer(raw.stoppedAt,'Stop time'),pausedMs=integer(raw.pausedMs??0,'Paused time');
    if(startedAt<=0||stoppedAt<=startedAt||pausedMs>=stoppedAt-startedAt)throw new Error('Invalid session timing.');
    const start={};if(raw.start?.expOnly===true){start.expOnly=true;start.exp=integer(raw.start.exp,'Starting EXP');for(const k of ['mesos','hp','mp','hpCost','mpCost'])start[k]=0;}else for(const k of ['exp','mesos','hp','mp','hpCost','mpCost'])start[k]=integer(raw.start?.[k],'Starting '+k);
    if(!start.expOnly&&raw.start.uses!==undefined)start.uses=cleanUses(raw.start.uses);if(!start.expOnly&&raw.start.etc)start.etc=cleanEtc(raw.start.etc);
    start.level=raw.start.level!==undefined&&raw.start.level!==null&&raw.start.level!==''?levelNumber(raw.start.level):null;
    for(const type of ['hp','mp'])start[type+'Potion']=String(raw.start[type+'Potion']||'custom').slice(0,40);
    function cleanEnd(e){
      if(!e||typeof e!=='object')throw new Error('Missing ending values.');
      if(start.expOnly)return {exp:integer(e.exp,'Ending EXP'),level:levelNumber(e.level),mesos:null,hp:null,mp:null,hpAdded:0,mpAdded:0,extraExp:0,ledger:[]};
      const out={};for(const k of ['exp','mesos','hp','mp'])out[k]=integer(e[k],'Ending '+k);
      for(const k of ['hpAdded','mpAdded','extraExp'])out[k]=integer(e[k]??0,k);
      if(start.uses!==undefined)out.uses=cleanUseEnd(start,e.uses);if(start.etc)out.etc=e.etc===null||e.etc===undefined?null:cleanEtcItems(e.etc);
      out.level=start.level?levelNumber(e.level):null;ledgerTotals(e.ledger||[]);
      out.ledger=(e.ledger||[]).map(item=>({kind:item.kind,value:ledgerValue(item),label:String(item.label||'Untitled').slice(0,100),...(item.source==='etc'?{source:'etc',itemId:String(item.itemId),quantity:integer(item.quantity,'ETC quantity'),unitPrice:integer(item.unitPrice,'ETC vendor price')}: {})}));return out;
    }
    const record={stage:'complete',id:String(raw.id||'run-'+startedAt).slice(0,100),startedAt,stoppedAt,pausedMs,start,end:cleanEnd(raw.end),meta:{map:String(raw.meta?.map||'').slice(0,80),class:String(raw.meta?.class||'').slice(0,80)},checkpoints:[]};
    if(!Array.isArray(raw.checkpoints??[])||(raw.checkpoints?.length||0)>5000)throw new Error('Invalid checkpoint list.');
    record.checkpoints=(raw.checkpoints||[]).map(cp=>({elapsedMs:integer(cp.elapsedMs,'Checkpoint time'),end:cleanEnd(cp.end)}));
    const time=activeElapsed(record);calculate(start,record.end,time);intervals(start,record.checkpoints,record.end,time);if(raw.autoPoints!==undefined){const points=normalizeProgress(start,raw.autoPoints,time);if(points.length)record.autoPoints=points;}return record;
  }
  function mergeHistory(current,incoming) {
    if(!Array.isArray(incoming)||incoming.length>5000)throw new Error('Import up to 5,000 session records at a time.');
    const clean=incoming.map(normalizeSession), records=new Map(current.map(r=>[r.id,r]));
    for(const record of clean)records.set(record.id,record);
    return [...records.values()].sort((a,b)=>b.stoppedAt-a.stoppedAt);
  }
  root.MapleMath = {levelPercentPerHour,cleanEtc,cleanEtcItems,etcLoot,cleanUses,cleanUseEnd,useTotals,catalog,integer,calculate,expTable,cumulative,levelNumber,position,activeElapsed,ledgerValue,ledgerTotals,profitRates,forecast,intervals,groupMaps,normalizeProgress,normalizeSession,mergeHistory};
  if (typeof module !== 'undefined') module.exports = root.MapleMath;
})(typeof window !== 'undefined' ? window : globalThis);
