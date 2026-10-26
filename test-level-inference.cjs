'use strict';
const assert=require('node:assert/strict'),A=require('./dist/auto-progress.js'),M=require('./dist/core.js'),C=require('./dist/ocr-core.js'),L=require('./dist/live-model.js'),P=require('./dist/overlay-protocol.js'),harness=require('./test-screenshot-transfer.cjs');
const epoch=Date.parse('2026-10-20T20:00:00Z');
const start={expOnly:true,level:58,exp:1076660,mesos:0,hp:0,mp:0,hpCost:0,mpCost:0}; // 99.00%, floored from the level table
function read(percent,index){return {at:epoch+index*30000,width:1919,height:1079,layout:'fixed',results:{exp:{value:percent,percent,method:'classic-exp-percent'}}};}
function stream(initial=start){const filter=A.createFilter({start:initial});let n=0;return {filter,offer:p=>filter.offerRead(read(p,++n),n*30000)};}
const f=stream();let r=f.offer('99.50');assert.equal(r.point.end.level,58);assert.equal(r.accepted.length,0);
r=f.offer('1.00');assert.equal(r.point.end.level,59);assert.equal(r.point.end.exp,11471);assert.equal(r.accepted[0].end.level,58,'Last pre-level capture is confirmed first');
r=f.offer('1.50');const leveled=r.accepted[0];assert.equal(leveled.end.level,59);assert.equal(leveled.end.exp,11471);assert.equal(leveled.expPercent,'1.00');assert.equal(A.stats(start,leveled).expHour,1340820,'22,347 EXP over one active minute');
assert.equal(A.stats(start,leveled).expPercentHour,1340820*100/1147132);
for(const percent of ['0.00','0.01','5.00']){const s=stream();assert.equal(s.offer(percent).point.end.level,59);assert.equal(s.offer('5.01').accepted[0].end.level,59);}
assert.throws(()=>stream().offer('5.01'),/manual checkpoint/,'Never infer from an ambiguous larger drop');
assert.throws(()=>stream({...start,exp:Number(C.percentExp(58,'98.99'))}).offer('0.00'),/manual checkpoint/,'98.99% is below the rollover threshold');
assert.equal(stream({...start,exp:Number(C.percentExp(58,'99.00'))}).offer('0.00').point.end.level,59,'Floored EXP round-trips the 99.00% starting threshold');
for(const highPct of ['99.00','99.50','99.99']){const rollover=stream();rollover.offer(highPct);assert.equal(rollover.offer('0.01').point.end.level,59);assert.equal(rollover.offer('0.02').accepted[0].end.level,59);}
const spike=stream();spike.offer('1.00');r=spike.offer('99.50');assert.equal(r.point.end.level,58);assert.equal(r.accepted.length,0);assert.equal(r.rejected.length,1);assert.equal(spike.offer('99.60').accepted[0].end.level,58,'Returning to the old percentage rejects an isolated false rollover');
const high=stream({...start,exp:Number(C.percentExp(58,'50.00'))});high.offer('99.50');r=high.offer('50.10');assert.equal(r.point.end.level,58);assert.equal(r.accepted.length,0);assert.equal(r.rejected.length,1,'An isolated 99% spike does not add a level');
const learned=stream({...start,exp:Number(C.percentExp(58,'50.00'))});for(const p of ['50.10','50.20','50.30','50.40','99.50'])learned.offer(p);assert.throws(()=>learned.offer('1.00'),/manual checkpoint/,'A learned outlier cannot supply rollover evidence');assert.equal(learned.offer('50.50').point.end.level,58);
const complete=stream({...start,exp:Number(C.percentExp(58,'98.00'))});complete.offer('100.00');r=complete.offer('100.00');assert.equal(r.accepted[0].end.level,59);assert.equal(r.point.end.level,59);const hundred=r.accepted[0];r=complete.offer('0.50');assert.equal(r.point.end.level,59,'100% followed by low EXP never increments twice');r=complete.offer('1.00');assert.equal(r.accepted[0].end.level,59);
const restored=M.normalizeProgress(start,JSON.parse(JSON.stringify([hundred])),120000);assert.equal(restored[0].expPercent,'100.00');assert.equal(restored[0].levelInferred,true);
const reload=A.createFilter({start,anchor:restored[0]});assert.equal(reload.offerRead(read('100.00',3),90000).point.end.level,59);assert.equal(reload.offerRead(read('0.50',4),120000).point.end.level,59);
const nextLevel=A.createFilter({start,anchor:restored[0]});nextLevel.offerRead(read('99.10',3),90000);r=nextLevel.offerRead(read('100.00',4),120000);assert.equal(r.point.end.level,60,'A new level can complete after leaving the prior 100% marker');
for(const bad of ['100.01','101.00','-1.00','1.0','1','NaN',null])assert.throws(()=>stream().offer(bad),/Uncertain EXP/);
const uncertain=read('1.00',1);uncertain.results.exp.needsConfirmation=true;assert.throws(()=>A.createFilter({start}).offerRead(uncertain,30000),/Uncertain EXP/);
const endpoint=stream({...start,level:99,exp:Number(C.percentExp(99,'99.00'))});endpoint.offer('0.00');assert.equal(endpoint.offer('0.00').accepted[0].end.level,100);assert.throws(()=>endpoint.offer('1.00'),/supported table endpoint/);
const falseEndpoint=stream({...start,level:99,exp:Number(C.percentExp(99,'99.00'))});falseEndpoint.offer('0.00');assert.equal(falseEndpoint.offer('99.50').point.end.level,99,'A false rollover at the table endpoint can recover');
const manual=stream();manual.filter.rebase({end:{...start,level:60,exp:Number(C.percentExp(60,'10.00'))},elapsedMs:60000});assert.equal(manual.filter.offerRead(read('10.10',3),90000).point.end.level,60,'A manual checkpoint resets the trusted level');
assert.throws(()=>M.normalizeProgress(start,[{...hundred,expPercent:'101.00'}]),/percentage/);assert.throws(()=>M.normalizeProgress(start,[{...hundred,expPercent:'1.00'}]),/does not match/);
const fullStart={...start,expOnly:false,mesos:10000,hp:100,mp:100,hpCost:80,mpCost:150};const full=A.createFilter({start:fullStart});
const financial=(p,i)=>({...read(p,i),inventoryVisible:true,results:{...read(p,i).results,mesos:{value:11000+i*1000,confidence:95},hp:{value:100-i,method:'classic-digits'},mp:{value:100-i,method:'classic-digits'}}});
full.offerRead(financial('0.00',1),30000);const fullPoint=full.offerRead(financial('1.00',2),60000).accepted[0];assert.equal(fullPoint.end.level,59);assert.equal(A.stats(fullStart,fullPoint).net,1770);assert.equal(A.stats(fullStart,fullPoint).netHour,0,'Existing first-minute rate rule remains');
assert.equal(M.normalizeProgress(fullStart,[fullPoint])[0].expPercent,'0.00','Full tracking also retains inference across restore');
console.log('Passed: percentage rollover thresholds, independent level-table EXP/rates, provisional/contradicted transitions, exact/repeated 100%, endpoint, manual rebasing, invalid reads, full finances, and reload metadata.');

(async()=>{
  let now=epoch,index=0,id=0;const jobs=new Map(),samples=[read('99.50',1),read('1.00',2),read('1.50',3),read('2.00',4)],clock={now:()=>now,setTimer:(fn,ms)=>{jobs.set(++id,{fn,due:now+ms});return id;},clearTimer:id=>jobs.delete(id)},flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
  const h=harness(new Map(),{progressClock:clock,progressSample:async()=>samples[index++],screenCapture:{supported:()=>true,createSession:()=>({active:()=>true,stop(){}})}});
  h.node('tracking-mode').value='exp';h.fire('tracking-mode','change');h.applyReview(start);h.fire('start-form','submit');now=epoch+30000;h.setTime(new Date(now).toISOString());h.node('auto-progress-toggle').checked=true;h.fire('auto-progress-toggle','change');await flush();
  assert.equal(h.state().autoPoints?.length||0,0);assert.equal(h.overlayFeed.snapshot().expHour,0,'Pending readings stay out of the stream');
  async function next(){const [key,task]=[...jobs].sort((a,b)=>a[1].due-b[1].due)[0];now=task.due;h.setTime(new Date(now).toISOString());jobs.delete(key);task.fn();await flush();}
  await next();assert.equal(h.state().autoPoints[0].end.level,58);assert.equal(h.overlayFeed.snapshot().expHour,0,'Unconfirmed level-up stays private');
  await next();assert.equal(h.state().autoPoints[1].end.level,59);assert.equal(h.overlayFeed.snapshot().expHour,1340820);assert.equal(h.overlayFeed.snapshot().expPercentHour,1340820*100/1147132);
  const wire=P.select(h.overlayFeed.snapshot(),{...P.defaults,mesos:false,expPercent:true,eta:true});P.validate(wire);assert(!Object.hasOwn(wire,'expPercent'));assert(!JSON.stringify(wire).includes('levelInferred'),'Raw OCR inference metadata stays local');
  const reload=harness(h.storage);assert.equal(reload.state().autoPoints[1].expPercent,'1.00');assert.equal(reload.state().autoPoints[1].end.level,59);
  await next();assert.equal(index,4,'30-second sampling continues across the level-up');h.fire('done-button');assert.equal(h.node('end-level').value,'59','Final form uses the inferred confirmed level');
  h.node('end-level').value='59';h.node('end-exp').value='22942';h.fire('end-form','submit');assert.equal(h.node('end-error').textContent,'');assert.equal(M.normalizeSession(h.saved()).autoPoints[1].expPercent,'1.00');assert.equal(jobs.size,0);
  console.log('Passed: actual automatic app flow without level OCR, confirmed-only stream EXP/%/ETA, continued 30-second sampling, restored level, final review and JSON preservation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
