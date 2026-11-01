'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),harness=require('./test-screenshot-transfer.cjs'),M=require('./dist/core.js');
const epoch=Date.parse('2026-10-20T20:00:00Z'),row=q=>({itemId:'354',name:'Slime Bubble',unitPrice:50,quantity:q}),value=n=>({value:n,method:'classic-digits'});
const capture=(seconds,quantity)=>({at:epoch+seconds*1000,width:1919,height:1079,layout:'fixed',inventoryVisible:true,results:{level:value(60),exp:value(2000+seconds),mesos:value(10000),hp:value(100),mp:value(100),etc:{readable:true,items:[row(quantity)]}}});
(async()=>{
  let now=epoch+60000,nextId=0,index=0;const jobs=new Map(),clock={now:()=>now,setTimer:(fn,ms)=>{const id=++nextId;jobs.set(id,{fn,due:now+ms});return id;},clearTimer:id=>jobs.delete(id)},reads=[capture(60,20),capture(90,25),capture(120,25)],flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
  const h=harness(new Map(),{progressClock:clock,progressSample:async()=>reads[index++],screenCapture:{supported:()=>true,createSession:()=>({active:()=>true,stop(){}})},setupRuntime:context=>{context.window=context;context.MapleEtcData={items:require('./dist/data/etc-items.json').items};vm.runInNewContext(fs.readFileSync('dist/etc-capture.js','utf8'),context);}});
  for(const [id,n]of Object.entries({'start-level':60,'start-exp':2000,'start-mesos':10000,'start-hp':100,'start-mp':100}))h.node(id).value=n;
  h.node('auto-start').checked=true;h.fire('start-form','submit');assert.equal(h.state().stage,'running');assert.equal(h.state().start.etc.baselinePending,true);
  await flush();assert.equal(index,1);assert.equal(h.state().start.etc.baselinePending,false);assert.deepEqual(h.state().start.etc.baseline.map(r=>[r.itemId,r.quantity]),[['354',20]],'First readable capture establishes existing inventory, not loot');
  async function next(){const [id,job]=[...jobs].sort((a,b)=>a[1].due-b[1].due)[0];jobs.delete(id);now=job.due;h.setTime(new Date(now).toISOString());job.fn();await flush();}
  await next();await next();const points=h.state().autoPoints;assert(points.some(p=>p.end.etc?.find(r=>r.itemId==='354')?.quantity===25),'Later count is confirmed');assert.equal(M.etcLoot(h.state().start,{etc:[row(25)]})[0].value,250,'Only five new bubbles contribute vendor value');
  console.log('Passed: automatic ETC baseline from first readable live capture, persistent starting stock, later confirmed new drops and vendor value.');
})().catch(error=>{console.error(error);process.exitCode=1;});
