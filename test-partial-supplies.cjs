'use strict';
const assert=require('node:assert/strict'),A=require('./dist/auto-progress.js'),C=require('./dist/ocr-core.js'),M=require('./dist/core.js'),harness=require('./test-screenshot-transfer.cjs');
const epoch=Date.parse('2026-10-20T20:00:00Z'),start={level:58,exp:Number(C.percentExp(58,'50.00')),mesos:10000,hp:100,mp:100,hpCost:80,mpCost:150,hpPotion:'meat',mpPotion:'lemon'};
function read(index,hp,mp){return {at:epoch+index*30000,width:1919,height:1079,layout:'fixed',inventoryVisible:true,results:{level:{value:'58',confidence:90},exp:C.convertPercent({value:(50+index/100).toFixed(2),method:'classic-exp-percent'},58),mesos:{value:String(10000+index*1000),confidence:90},hp:{value:hp===null?null:String(hp),method:'classic-digits'},mp:{value:mp===null?null:String(mp),method:'classic-digits'}}};}
for(const key of ['hp','mp'])for(const bad of [null,undefined,'bad','-1']){
  const r=read(2,99,99);r.results[key].value=bad;
  const p=A.fromRead(r,start,60000);assert.equal(p.end[key],null);assert.equal(A.stats(start,p).expHour,13020);assert.equal(A.stats(start,p).netHour,null);assert.equal(A.stats(start,p).supplyCost,null);
}
for(const key of ['hp','mp'])for(const quality of [{confidence:0,method:'text'},{needsConfirmation:true},{disagrees:true,confidence:99,method:'text'}]){
  const r=read(2,99,99);Object.assign(r.results[key],quality);assert.equal(A.fromRead(r,start,60000).end[key],null);
}
// A missing count is never treated as zero, nor as a reset of the last known
// supply baseline that would silently allow a real restock after a gap.
const f=A.createFilter({start}),p=(i,hp)=>A.fromRead(read(i,hp,100-i),start,i*30000);
f.offer(p(1,95));f.offer(p(2,94));f.offer(p(3,null));f.offer(p(4,null));assert.equal(f.offer(p(5,150)).held,1);assert.equal(f.offer(p(6,90)).preview.end.hp,90);
const zero=A.stats(start,A.fromRead(read(2,0,0),start,60000));assert.equal(zero.hpUsed,100);assert.equal(zero.mpUsed,100);assert.equal(zero.supplyCost,23000,'An actual zero count remains readable');

(async()=>{
  const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};let now=epoch,id=0,index=0;const jobs=new Map(),samples=[read(1,null,99),read(2,null,98),read(3,95,97),read(4,94,96),read(5,93,null)];
  const clock={now:()=>now,setTimer:(fn,ms)=>{jobs.set(++id,{fn,due:now+ms});return id;},clearTimer:id=>jobs.delete(id)};
  const h=harness(new Map(),{progressClock:clock,progressSample:async()=>samples[index++],screenCapture:{supported:()=>true,createSession:()=>({active:()=>true,stop(){}})}});
  h.applyReview(start);h.fire('start-form','submit');now=epoch+30000;h.setTime(new Date(now).toISOString());h.node('auto-progress-toggle').checked=true;h.fire('auto-progress-toggle','change');await flush();
  assert.equal(index,1);assert.equal(h.node('live-hp').textContent,'N/A Meat');assert.equal(h.node('live-mesos-hour').textContent,'N/A');assert.match(h.node('auto-progress-status').textContent,/HP unreadable/);
  async function next(){const task=[...jobs].sort((a,b)=>a[1].due-b[1].due)[0];now=task[1].due;h.setTime(new Date(now).toISOString());jobs.delete(task[0]);task[1].fn();await flush();}
  await next();assert.equal(h.node('live-exp-hour').textContent,'13,020');assert.equal(h.node('live-supply-cost').textContent,'N/A');assert.equal(h.state().autoPoints.length,1);assert.equal(h.state().autoPoints[0].end.hp,null);assert.equal(h.state().checkpoints.length,0);assert.equal(h.overlayFeed.snapshot().netHour,null);
  const restored=harness(h.storage);assert.equal(restored.state().stage,'running');assert.equal(restored.state().autoPoints[0].end.hp,null);assert.equal(restored.node('live-hp').textContent,'N/A Meat');assert.equal(restored.node('live-mesos-hour').textContent,'N/A');
  await next();assert.equal(h.state().autoPoints.length,2);assert.equal(h.overlayFeed.snapshot().expHour,13020,'Confirmed percentage EXP reaches the stream while HP is unreadable');assert.equal(h.overlayFeed.snapshot().netHour,null);
  await next();assert.equal(h.node('live-mesos-hour').textContent,'87,600');assert.equal(h.state().checkpoints.length,1);assert.equal(h.overlayFeed.snapshot().netHour,86000,'Net recovers from actual complete supply readings and original prices');assert(h.charts.get('live-mesos-chart').rows.some(row=>row.to>0&&row.netHour===null));
  await next();assert.equal(index,5,'Unreadable supplies never stop 30-second sampling');assert.equal(h.node('live-mp').textContent,'N/A Lemon');assert.equal(h.node('live-mesos-hour').textContent,'N/A');assert.equal(h.overlayFeed.snapshot().netHour,null);assert.equal(h.state().checkpoints.length,1);
  h.fire('done-button');assert.equal(h.node('end-mp').value,'','Missing counts stay blank for final review');
  h.applyReview({level:58,exp:Number(C.percentExp(58,'50.05')),mesos:15000,hp:93,mp:95},'end');h.fire('end-form','submit');assert.equal(h.node('end-error').textContent,'');assert.equal(h.node('mesos-hour').textContent,'88,560');assert.equal(jobs.size,0);
  const clean=M.normalizeSession(h.saved());assert.equal(clean.autoPoints.length,4);assert.equal(clean.autoPoints[0].end.hp,null);assert.equal(clean.autoPoints[3].end.mp,null);assert.deepEqual(M.normalizeSession(JSON.parse(JSON.stringify(clean))),clean);
  for(const value of [undefined,'',-1])assert.throws(()=>M.normalizeProgress(start,[{...clean.autoPoints[0],end:{...clean.autoPoints[0].end,hp:value}}],150000));
  console.log('Passed: missing HP/MP never blocks percentage EXP, 30-second captures continue, unknown costs/net remain N/A with graph gaps, confirmed feed and cost recovery agree, restock gates survive gaps, null counts survive reload/JSON, and final reviewed rates stay exact.');
})().catch(error=>{console.error(error);process.exitCode=1;});
