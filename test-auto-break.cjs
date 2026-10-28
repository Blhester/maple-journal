'use strict';
const assert=require('node:assert/strict'),M=require('./dist/core.js'),A=require('./dist/auto-progress.js'),harness=require('./test-screenshot-transfer.cjs');
const start={level:30,exp:14000},detector=A.createBreakDetector({start});
const pct=value=>({results:{exp:{value,percent:value,method:'classic-exp-percent'}}});
assert.equal(detector.offer(pct('14.63')).idleCount,1);
assert.equal(detector.offer({results:{exp:{value:null,method:'classic-exp-percent'}}}).valid,false);
assert.equal(detector.offer(pct('14.63')).shouldPause,true,'Only the second readable unchanged EXP capture pauses');
assert.equal(detector.offer(pct('14.63'),{paused:true}).shouldResume,false);
assert.equal(detector.offer(pct('14.64'),{paused:true}).shouldResume,true);
assert.equal(detector.offer(pct('14.64')).idleCount,1);
assert.equal(detector.offer(pct('14.60')).valid,false,'An EXP dip is not evidence of a break');
const rounded=A.createBreakDetector({start:{level:30,exp:14050}});assert.equal(rounded.offer(pct('14.67')).valid,true,'The first HUD percentage may round one step below the reviewed EXP');
const rollover=A.createBreakDetector({start:{level:30,exp:95000}});
assert.equal(rollover.offer(pct('99.30')).gained,true);
assert.equal(rollover.offer(pct('00.20')).gained,true,'A valid level rollover resumes training');
console.log('Passed: readable no-gain count, unreadable and decreasing EXP exclusion, gain resume, and level rollover.');

(async()=>{
  const epoch=Date.parse('2026-10-20T20:00:00Z');let now=epoch,id=0,index=0;const jobs=new Map();
  const clock={now:()=>now,setTimer:(fn,ms)=>{jobs.set(++id,{fn,due:now+ms});return id;},clearTimer:key=>jobs.delete(key)};
  const sequence=['14.63',null,'14.63','14.63','14.64','14.64'];
  const h=harness(new Map(),{progressClock:clock,progressSample:async()=>({at:now,width:1920,height:1080,layout:'fixed',results:{exp:{value:sequence[index],percent:sequence[index++],method:'classic-exp-percent'}}}),screenCapture:{supported:()=>true,createSession:()=>({active:()=>true,stop(){}})}});
  h.node('tracking-mode').value='exp';h.fire('tracking-mode','change');h.applyReview({level:'30',exp:'14000'});h.node('auto-break').checked=true;h.fire('auto-break','change');h.fire('start-form','submit');
  assert.equal(h.state().autoBreakEnabled,true);assert.equal(h.node('wall-time').hidden,true);
  h.node('auto-progress-toggle').checked=true;h.fire('auto-progress-toggle','change');
  const flush=async()=>{for(let i=0;i<45;i++)await Promise.resolve();};await flush();
  async function next(){const [key,job]=[...jobs].sort((a,b)=>a[1].due-b[1].due)[0];now=job.due;h.setTime(new Date(now).toISOString());jobs.delete(key);job.fn();await flush();}
  assert.equal(h.state().autoBreakWatch.idleCount,1,'The initial capture is valid and unchanged');
  await next();assert.equal(h.state().pausedAt,undefined,'Unreadable EXP cannot pause');assert.equal(h.state().autoBreakWatch.idleCount,1);
  await next();assert.equal(h.state().autoBreakPaused,true);assert.equal(h.state().pausedAt,epoch+60000);assert.equal(h.node('timer-state').textContent,'PAUSED');
  const frozen=M.activeElapsed(h.state(),now);await next();assert.equal(M.activeElapsed(h.state(),now),frozen,'The timer freezes while automatic captures continue');
  await next();assert.equal(h.state().autoBreakPaused,false);assert.equal(h.state().pausedAt,null);assert.equal(h.state().pausedMs,60000);assert.equal(M.activeElapsed(h.state(),now),frozen,'The resume capture excludes the entire break');assert.equal(h.node('timer-state').textContent,'RECORDING');
  await next();assert.equal(M.activeElapsed(h.state(),now),frozen+30000);assert.equal(h.state().autoBreakPaused,false);
  h.fire('done-button');assert.equal(jobs.size,0);assert.equal(h.state().pausedMs,60000);
  h.fire('confirm-discard');assert.equal(h.node('auto-break').checked,true,'The setting remains selected for the next run');
  console.log('Passed: real start checkbox, automatic pause/resume, continued captures while paused, unreadable EXP exclusion, active-time math, manual finish and preference retention.');
})().catch(error=>{console.error(error);process.exitCode=1;});
