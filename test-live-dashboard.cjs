'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),A=require('./dist/auto-progress.js'),M=require('./dist/core.js'),C=require('./dist/ocr-core.js'),harness=require('./test-screenshot-transfer.cjs');
const start={level:58,exp:100000,mesos:10000,hp:100,mp:100,hpCost:80,mpCost:150,hpPotion:'meat',mpPotion:'lemon'},epoch=Date.parse('2026-10-20T20:00:00Z');
const point=(minute,mesos)=>({elapsedMs:minute*60000,at:epoch+minute*60000,end:{level:58,exp:100000+minute*1000,mesos,hp:100-minute*5,mp:100-minute*5,hpAdded:0,mpAdded:0,extraExp:0,ledger:[]},source:'automatic'});
const capture=p=>({at:p.at,width:1919,height:1079,layout:'fixed',inventoryVisible:p.end.mesos!==null,results:Object.fromEntries(['level','exp','mesos','hp','mp'].map(k=>[k,{value:p.end[k]===null?null:String(p.end[k]),confidence:90,disagrees:false}]))});
const f=A.createFilter({start});let result=f.offer(point(1,null));assert.equal(A.stats(start,result.preview).expHour,60000);assert.equal(A.stats(start,result.preview).netHour,null);
result=f.offer(point(2,null));assert.equal(result.accepted.length,1);assert.equal(result.accepted[0].end.mesos,null);
result=f.offer(point(3,13000));assert.equal(result.accepted[0].end.mesos,null);assert.equal(A.stats(start,result.preview).netHour,-9000);
result=f.offer(point(4,14000));assert.equal(result.accepted[0].end.mesos,13000);assert.equal(A.stats(start,result.accepted[0]).net,-450);
const spike=A.createFilter({start});spike.offer(point(1,9000000));const recovered=spike.offer(point(2,12000));assert.equal(recovered.accepted.length,1);assert.equal(recovered.accepted[0].end.mesos,null,'Mesos spike rejected independently of EXP');assert.equal(A.stats(start,recovered.accepted[0]).expHour,60000);
for(const bad of [null,undefined,'bad','-3']){const read=capture(point(1,null));read.results.mesos.value=bad;assert.equal(A.fromRead(read,start,60000).end.mesos,null);}
const hidden=capture(point(1,11000));hidden.inventoryVisible=false;assert.equal(A.fromRead(hidden,start,60000).end.mesos,null,'Scenery digits are not a balance if inventory cue is absent');
const zeroStart={...start,mesos:0},zeroFilter=A.createFilter({start:zeroStart});zeroFilter.offer(point(1,0));assert.equal(zeroFilter.offer(point(2,0)).accepted[0].end.mesos,0,'A real zero stays zero');
assert.equal(A.stats(start,point(2,null)).supplyCost,2300);
const startupEnd={...start,hpAdded:0,mpAdded:0,extraExp:0,ledger:[]};
for(const ms of [1,120,1000,59999,60000]){
  const s=A.stats(start,{end:startupEnd,elapsedMs:ms});assert.equal(s.exp,0);assert.equal(s.net,0);assert.equal(s.expHour,0);assert.equal(s.netHour,0);assert.equal(s.rateReady,ms===60000);
}
const twoMesos={...startupEnd,mesos:10002},tiny=A.stats(start,{end:twoMesos,elapsedMs:120});
assert.equal(tiny.net,2,'Detected changes remain visible as totals');assert.equal(tiny.netHour,0,'Do not annualize two mesos over a 120 ms startup capture');assert.equal(tiny.etaMs,null);
assert.equal(A.stats(start,{end:twoMesos,elapsedMs:60000}).netHour,120,'A full-minute reading uses the actual starting balance');
assert.equal(A.stats(start,{end:{...startupEnd,mesos:null},elapsedMs:120}).netHour,null,'Unreadable mesos still means N/A during warmup');
assert.equal(A.stats(start,{end:{...startupEnd,mesos:9980},elapsedMs:60000}).netHour,-1200);
assert.equal(M.calculate(start,twoMesos,120).rates.hour.mesos,60000,'Final reviewed short-session calculation stays exact');
// Real screenshot pixels test the pale inventory-box cue; dark scenery is not
// considered an open inventory, independently of any OCR digit hallucination.
const {decode}=require('./lib/png-rgba.cjs'),image=decode(fs.readFileSync('dist/assets/ocr-example.png'));
function crop(x,y,w,h){const data=new Uint8ClampedArray(w*h*4);for(let row=0;row<h;row++)data.set(image.data.subarray(((y+row)*image.width+x)*4,((y+row)*image.width+x+w)*4),row*w*4);return data;}
assert.equal(C.inventoryVisible(crop(1608,597,197,16)),true);assert.equal(C.inventoryVisible(crop(500,500,197,16)),false);assert.equal(C.inventoryVisible(new Uint8ClampedArray(16)),false);
console.log('Passed: partial EXP tracking, independent mesos rejection/recovery, null versus zero, known net/supply rates and real screenshot inventory visibility cues.');
(async()=>{
  const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};let now=epoch,id=0,index=0;const jobs=new Map(),samples=[point(1,null),point(2,null),point(3,13000),point(4,14000),point(5,null)].map((p,i)=>({...p,at:epoch+60000+i*30000,elapsedMs:60000+i*30000}));
  const clock={now:()=>now,setTimer:(fn,ms)=>{jobs.set(++id,{fn,due:now+ms});return id;},clearTimer:id=>jobs.delete(id)};
  const h=harness(new Map(),{progressClock:clock,progressSample:async()=>capture(samples[index++]),screenCapture:{supported:()=>true,createSession:()=>({active:()=>true,stop(){}})}});
  h.applyReview(start);h.fire('start-form','submit');assert.equal(h.node('start-form').hidden,true,'Starting input form is hidden throughout training');assert.equal(h.node('live-dashboard').hidden,false);
  now=epoch+60000;h.setTime(new Date(now).toISOString());h.node('auto-progress-toggle').checked=true;h.fire('auto-progress-toggle','change');await flush();
  assert.equal(h.node('live-exp-hour').textContent,'60,000');assert.equal(h.node('live-mesos-hour').textContent,'N/A');assert.match(h.node('live-quality').textContent,/pending/);assert.equal(h.state().autoPoints,undefined,'Provisional point not persisted as confirmed');
  assert.equal(h.overlayFeed.snapshot().expHour,0,'The stream feed does not publish the pending first OCR result');
  async function next(){const task=[...jobs].sort((a,b)=>a[1].due-b[1].due)[0];now=task[1].due;h.setTime(new Date(now).toISOString());jobs.delete(task[0]);task[1].fn();await flush();}
  await next();assert.equal(h.state().autoPoints.length,1);assert.equal(h.state().checkpoints.length,0);assert.equal(h.charts.get('live-exp-chart').rows.length,3);assert(h.charts.get('live-mesos-chart').rows.filter(row=>row.to>0).every(row=>row.netHour===null),'The validated time-zero baseline is zero; unreadable captured balances remain gaps');
  assert.equal(h.overlayFeed.snapshot().expHour,60000);assert.equal(h.overlayFeed.snapshot().netHour,null,'Confirmed feed preserves unreadable mesos');assert.equal(h.overlayFeed.snapshot().series.length,2,'Pending second sample stays off the stream graph');
  await next();await next();assert.equal(h.state().autoPoints.length,3);assert.equal(h.state().checkpoints.length,1);assert.equal(h.node('live-mesos-hour').textContent,'-14,400');assert.equal(h.node('live-net-total').textContent,'-600 net mesos · after use-item costs');assert.equal(h.node('live-supply-cost').textContent,'4,600 mesos');
  await next();assert.equal(h.node('live-mesos-hour').textContent,'N/A','Latest missing balance never shows a stale previous net rate');assert.equal(h.node('live-exp-hour').textContent,'100,000');assert.equal(h.state().autoPoints.at(-1).end.mesos,null);
  const restored=harness(h.storage);assert.equal(restored.node('start-form').hidden,true);assert.equal(restored.node('live-exp-hour').textContent,'96,000');assert.equal(restored.node('live-mesos-hour').textContent,'N/A');assert.equal(restored.node('auto-progress-toggle').checked,false);
  h.fire('done-button');assert.equal(h.node('live-dashboard').hidden,true);assert.equal(h.node('end-mesos').value,'','Unreadable balance stays blank for final validation');assert.equal(h.node('end-exp').value,'104000');
  h.applyReview(point(5,15000).end,'end');h.fire('end-form','submit');assert.equal(h.node('end-error').textContent,'');assert.equal(h.node('mesos-hour').textContent,'-15,000');assert.equal(jobs.size,0);
  const clean=M.normalizeSession(h.saved());assert.equal(clean.autoPoints.length,4);assert.equal(clean.autoPoints[0].end.mesos,null);assert.equal(clean.autoPoints[2].end.mesos,13000);assert.deepEqual(M.normalizeSession(JSON.parse(JSON.stringify(clean))),clean);
  for(const invalid of [{...clean,autoPoints:{}},{...clean,autoPoints:[{...point(1,null),elapsedMs:99999999}]},{...clean,autoPoints:[point(2,null),point(1,null)]},{...clean,autoPoints:[{...point(1,null),end:{...point(1,null).end,hpAdded:Number.MAX_SAFE_INTEGER}}]}])assert.throws(()=>M.normalizeSession(invalid));
  let autoStartCalls=0;const automatic=harness(new Map(),{progressClock:clock,progressSample:async()=>{autoStartCalls++;throw new DOMException('Test permission denied','NotAllowedError');},screenCapture:{supported:()=>true,createSession:()=>({active:()=>false,stop(){}})}});automatic.applyReview(start);automatic.node('auto-start').checked=true;automatic.fire('start-form','submit');await flush();assert.equal(autoStartCalls,1,'Initial validation can start capture directly from the submit gesture');assert.equal(automatic.node('start-form').hidden,true);assert.equal(automatic.node('auto-progress-toggle').checked,false,'Permission denial leaves a usable dashboard');assert.equal(jobs.size,0);
  // Real startup submit + immediate screenshot + 30-second captures through the first minute.
  // A startup point must stay zero even after it becomes confirmed or reloads.
  for(const initialDifference of [0,2]){
    let t=epoch,nextId=0,reads=0;const timers=new Map(),startupClock={now:()=>t,setTimer:(fn,ms)=>{timers.set(++nextId,{fn,due:t+ms});return nextId;},clearTimer:id=>timers.delete(id)};
    const startup=harness(new Map(),{progressClock:startupClock,progressSample:async()=>{
      const first=reads++===0;if(first)t=epoch+120;startup.setTime(new Date(t).toISOString());
      return capture({at:t,end:{...startupEnd,mesos:first?10000+initialDifference:initialDifference?11000:10000,exp:!first&&initialDifference?101000:100000}});
    },screenCapture:{supported:()=>true,createSession:()=>({active:()=>true,stop(){}})}});
    startup.applyReview(start);startup.node('auto-start').checked=true;startup.fire('start-form','submit');
    assert.equal(startup.node('live-exp-hour').textContent,'0');assert.equal(startup.node('live-mesos-hour').textContent,'0');await flush();
    assert.equal(startup.node('live-mesos-hour').textContent,'0');assert.equal(startup.node('live-exp-hour').textContent,'0');assert.match(startup.node('live-quality').textContent,/first minute/);
    assert(startup.charts.get('live-mesos-chart').rows.every(row=>row.netHour===0),'Baseline and immediate capture cannot spike');assert.equal(startup.state().start.mesos,10000);
    const task=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];assert.equal(task[1].due,epoch+30000);t=task[1].due;startup.setTime(new Date(t).toISOString());timers.delete(task[0]);task[1].fn();await flush();
    assert.equal(startup.node('live-mesos-hour').textContent,'0','30-second samples still respect the first-minute warmup');assert.equal(startup.node('live-exp-hour').textContent,'0');
    const rows=startup.charts.get('live-mesos-chart').rows;assert.deepEqual(rows.slice(0,2).map(row=>row.netHour),[0,0],'Confirmed startup point cannot reintroduce the old spike');assert.equal(rows[0].to,0);assert.equal(startup.state().autoPoints.length,1,'Synthetic origin is not a checkpoint');
    const reload=harness(startup.storage);assert.equal(reload.node('live-mesos-hour').textContent,'0');assert(reload.charts.get('live-mesos-chart').rows.every(row=>row.netHour===0));
    const minuteTask=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];assert.equal(minuteTask[1].due,epoch+60000);t=minuteTask[1].due;startup.setTime(new Date(t).toISOString());timers.delete(minuteTask[0]);minuteTask[1].fn();await flush();
    assert.equal(startup.node('live-mesos-hour').textContent,initialDifference?'60,000':'0');assert.equal(startup.node('live-exp-hour').textContent,initialDifference?'60,000':'0');
    startup.node('auto-progress-toggle').checked=false;startup.fire('auto-progress-toggle','change');assert.equal(timers.size,0);
  }
  // SVG rendering uses actual history chart code: null gaps aren't connected,
  // previews are hollow/dashed, and no undefined or nonfinite SVG coordinates.
  const chart=harness(new Map(),{realHistory:true});chart.history.lineChart(chart.node('live-mesos-chart'),[{to:60000,netHour:10},{to:120000,netHour:null},{to:180000,netHour:20},{to:240000,netHour:25,preview:true}],'netHour',{live:true});
  const tree=chart.node('live-mesos-chart').children[0],all=[];function visit(node){all.push(node);for(const child of node.children||[])visit(child);}visit(tree);
  assert.equal(all.filter(node=>node.tag==='circle').length,3);assert.equal(all.filter(node=>node.tag==='polyline').length,0,'Missing mesos breaks the solid line');assert(all.some(node=>node.attributes?.class==='trend-line live-preview-line'));assert(all.some(node=>node.attributes?.class==='trend-dot live-preview-dot'));for(const node of all)for(const value of Object.values(node.attributes||{}))assert(!/NaN|Infinity|undefined/.test(value));
  console.log('Passed: real live dashboard updates each capture, hides inputs, shows pending rates and honest N/A, persists partial confirmed points, restores safely, preserves final calculations/JSON, and renders finite SVG graphs with explicit gaps and previews.');
})().catch(error=>{console.error(error);process.exitCode=1;});
