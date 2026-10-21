'use strict';
const assert=require('node:assert/strict'),A=require('./dist/auto-progress.js'),M=require('./dist/core.js');
const start={level:58,exp:100000,mesos:10000,hp:100,mp:100,hpCost:80,mpCost:150,hpPotion:'meat',mpPotion:'lemon'};
const point=(minute,values={})=>({elapsedMs:minute*60000,at:Date.parse('2026-10-20T20:00:00Z')+minute*60000,end:{...start,exp:start.exp+minute*1000,mesos:start.mesos+minute*1000,hp:100-minute*5,mp:100-minute*5,hpAdded:0,mpAdded:0,extraExp:0,ledger:[],...values}});
const read=(at,values={})=>({at,width:1919,height:1079,layout:'fixed',results:Object.fromEntries(['level','exp','mesos','hp','mp'].map(k=>[k,{value:String(({...start,...values})[k]),confidence:90,disagrees:false}]))});
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function clock(){
  let time=Date.parse('2026-10-20T20:00:00Z'),id=0;const jobs=new Map();
  return {now:()=>time,setTimer:(fn,ms)=>{jobs.set(++id,{fn,due:time+ms});return id;},clearTimer:id=>jobs.delete(id),jobs,
    advance:async(ms,onTime=()=>{})=>{const end=time+ms;for(;;){const next=[...jobs].sort((a,b)=>a[1].due-b[1].due)[0];if(!next||next[1].due>end)break;time=next[1].due;onTime(time);jobs.delete(next[0]);next[1].fn();await flush();}time=end;onTime(time);await flush();},
    jump:ms=>{time+=ms;},fireNext:async()=>{const next=[...jobs].sort((a,b)=>a[1].due-b[1].due)[0];jobs.delete(next[0]);next[1].fn();await flush();}};
}
const filter=A.createFilter({start});
assert.equal(filter.offer(point(1)).accepted.length,0,'First sample waits for confirmation');
assert.equal(filter.offer(point(2,{hp:150})).held,1,'Unexpected increase is held, never turned into a restock');
const recovered=filter.offer(point(3));assert.equal(recovered.accepted[0].end.hp,95);assert.equal(recovered.rejected[0].point.end.hp,150);
const steady=filter.offer(point(4));assert.equal(steady.accepted[0].end.hp,85);assert.equal(steady.accepted[0].elapsedMs,180000);
assert.equal(M.calculate(start,steady.accepted[0].end,180000).net,-450,'Confirmed checkpoint uses original costs and exact capture time');
for(const [key,spike]of [['hp',10],['mp',10],['exp',900000]]){
  const f=A.createFilter({start});f.offer(point(1,{[key]:spike}));const result=f.offer(point(2));
  assert.equal(result.accepted.length,0,key+' spike never accepted');assert.equal(result.rejected.length,1,key+' isolated spike rejected');
  assert.equal(f.offer(point(3)).accepted[0].elapsedMs,120000);
}
const restock=A.createFilter({start});restock.offer(point(1));restock.offer(point(2,{hp:150}));assert.equal(restock.offer(point(3,{hp:145})).accepted.length,0,'Persistent increase needs manual confirmation');
const manual=point(3,{hp:145,hpAdded:60});restock.rebase(manual);restock.offer(point(4,{hp:140}));const afterRestock=restock.offer(point(5,{hp:135}));assert.equal(afterRestock.accepted[0].end.hpAdded,60);assert.equal(afterRestock.accepted[0].end.hp,140);M.calculate(start,afterRestock.accepted[0].end,240000);
const levelStart={...start,exp:M.expTable[58]-500},levels=A.createFilter({start:levelStart});levels.offer(point(1,{level:59,exp:500}));assert.equal(levels.offer(point(2,{level:59,exp:1500})).accepted[0].end.level,59,'Level-up uses cumulative EXP');
const learned=A.createFilter({start});for(let m=1;m<=5;m++)learned.offer(point(m));learned.offer(point(6,{mesos:1000000}));const unusual=learned.offer(point(7,{mesos:1001000}));assert.equal(unusual.accepted.length,1);assert.equal(unusual.accepted[0].end.mesos,null);assert.match(unusual.accepted[0].mesosNote,/rate/i);
assert.throws(()=>filter.offer(point(4)),/increase/);assert.throws(()=>filter.offer(point(2)),/increase/);
const valid=read(point(1).at);assert.equal(A.fromRead(valid,start,60000).end.hp,100);
for(const bad of [null,undefined,'bad','-1']){const input=structuredClone(valid);input.results.hp.value=bad;assert.throws(()=>A.fromRead(input,start,60000));}
for(const change of [{confidence:20},{disagrees:true},{needsConfirmation:true},{confidence:NaN}]){const input=structuredClone(valid);Object.assign(input.results.mesos,change);assert.equal(A.fromRead(input,start,60000).end.mesos,null);}
const agreement=structuredClone(valid);Object.assign(agreement.results.level,{confidence:20,disagrees:true,votes:2,readCount:3});A.fromRead(agreement,start,60000);
const font=structuredClone(valid);Object.assign(font.results.hp,{confidence:0,method:'classic-digits'});A.fromRead(font,start,60000);
assert.throws(()=>A.fromRead(valid,{...start,level:null},60000),/starting level/);
console.log('Passed: automatic read quality gates, one-sample confirmation, exact 100→95→150→85 rejection, spikes/dips in each metric, real restock rebase, level-ups, learned rate outliers, missing values and non-increasing times.');
(async()=>{
  const c=clock(),calls=[],results=[],statuses=[];let context={running:true,paused:false,sessionId:'one'};
  const recorder=A.createRecorder({...c,getContext:()=>context,sample:async options=>{calls.push(options);return calls.length;},onSample:x=>results.push(x),onStatus:s=>statuses.push(s)});
  recorder.start();await flush();assert.equal(calls.length,1);assert.equal(calls[0].allowPrompt,true);await c.advance(29999);assert.equal(calls.length,1,'No second screenshot before 30 seconds');await c.advance(1);assert.equal(calls.length,2);assert.equal(calls[1].allowPrompt,false);assert.deepEqual(results,[1,2]);
  context.paused=true;recorder.cancelPending();await c.advance(120000);assert.equal(calls.length,2,'No screenshots during breaks');context.paused=false;await c.advance(30000);assert.equal(calls.length,3);
  recorder.stop();await c.advance(120000);assert.equal(calls.length,3);assert.equal(c.jobs.size,0);
  const lateClock=clock();let resolve;const lateResults=[],late=A.createRecorder({...lateClock,getContext:()=>context,sample:()=>new Promise(r=>{resolve=r;}),onSample:r=>lateResults.push(r)});late.start();late.stop();resolve('late');await flush();assert.deepEqual(lateResults,[]);assert.equal(lateClock.jobs.size,0);
  const slowClock=clock(),signals=[],slow=A.createRecorder({...slowClock,getContext:()=>context,sample:({signal})=>{signals.push(signal);return new Promise(()=>{});},onSample:()=>assert.fail('Timed-out result accepted')});slow.start();await slowClock.advance(45000);assert(signals[0].aborted);assert.equal(signals.length,1);await slowClock.advance(29999);assert.equal(signals.length,1,'No overlap or immediate catch-up after a slow read');await slowClock.advance(1);assert.equal(signals.length,2,'Timeout schedules one next sample, never overlaps');slow.stop();await flush();assert.equal(slowClock.jobs.size,0,'Stop removes an in-flight timeout even if a worker never resolves');
  const delayedClock=clock(),delayedCalls=[],delayed=A.createRecorder({...delayedClock,getContext:()=>context,sample:async()=>{delayedCalls.push(1);},onSample(){}});delayed.start();await flush();delayedClock.jump(600000);await delayedClock.fireNext();assert.equal(delayedCalls.length,2,'Throttled timer samples once instead of replaying ten missed minutes');delayed.stop();
  const deniedClock=clock(),denied=A.createRecorder({...deniedClock,getContext:()=>context,sample:async()=>{throw new DOMException('Permission denied','NotAllowedError');},onSample(){}});denied.start();await flush();assert.equal(denied.active(),false);assert.equal(deniedClock.jobs.size,0);
  const changedClock=clock();let changedContext={...context};const changed=A.createRecorder({...changedClock,getContext:()=>changedContext,sample:async()=>1,onSample(){}});changed.start();await flush();changedContext={...context,sessionId:'two'};await changedClock.advance(30000);assert.equal(changed.active(),false,'A new session requires a new opt-in');
  console.log('Passed: exact 30-second scheduling, first-use permission only, pause/resume, stop/late-result cancellation, 45-second deadline, no overlapping jobs, no catch-up burst and permission-denial shutdown.');

  // Real app controller -> OCR results -> filter -> stored checkpoints -> final
  // rendered rates. Only the screen/OCR boundary and clock are test doubles.
  const harness=require('./test-screenshot-transfer.cjs'),appClock=clock();let index=0,connected=true,onChange;
  const samples=[point(1),point(2,{hp:150}),point(3),point(4)].map((p,i)=>({...p,at:point(1).at+i*30000,elapsedMs:60000+i*30000}));
  const h=harness(new Map(),{progressClock:appClock,progressSample:async()=>{const p=samples[index++];return read(p.at,p.end);},screenCapture:{supported:()=>true,createSession:options=>{onChange=options.onChange;return {active:()=>connected,stop:()=>{connected=false;onChange(false);}};}}});
  h.applyReview(start);h.fire('start-form','submit');h.fire('auto-calibrate');assert.equal(h.node('screenshot-dialog').open,true);assert.equal(h.node('ocr-apply').hidden,true);assert.match(h.node('ocr-context').textContent,/calibration/);h.fire('ocr-close');await appClock.advance(60000,t=>h.setTime(new Date(t).toISOString()));h.node('auto-progress-toggle').checked=true;h.fire('auto-progress-toggle','change');await flush();
  await appClock.advance(90000,t=>h.setTime(new Date(t).toISOString()));
  const checkpoints=h.state().checkpoints;assert.equal(checkpoints.length,2);assert.deepEqual(checkpoints.map(p=>p.end.hp),[95,85]);assert.equal(checkpoints[1].elapsedMs,120000);assert(h.state().autoLog.some(item=>item.status==='Discarded'&&item.values.hp===150));
  h.fire('done-button');assert.equal(connected,false);assert.equal(h.node('auto-progress-toggle').checked,false);assert.equal(h.node('end-hp').value,'85');assert.match(h.node('screenshot-applied').textContent,/review/i);
  // Final manual review has a different snapshot and correctly overrides the
  // older confirmed checkpoint. Two and a half active minutes, 4k gross, 20 of each pot.
  h.applyReview(samples[3].end,'end');h.fire('end-form','submit');assert.equal(h.node('end-error').textContent,'');assert.equal(h.node('mesos-hour').textContent,'-14,400');assert.equal(h.node('mesos-ten').textContent,'-2,400');assert.equal(h.node('mesos-minute').textContent,'-240');
  assert.equal(appClock.jobs.size,0);assert.equal(h.saved().checkpoints.length,2);
  console.log('Passed: real periodic app integration discards 150, persists only confirmed checkpoints at capture times, stops screen sharing on Done, prefills human review, and uses final reviewed values for known hourly/10-minute/minute rates.');
})().catch(error=>{console.error(error);process.exitCode=1;});
