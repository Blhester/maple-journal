'use strict';
const assert=require('node:assert/strict'),M=require('./dist/core.js'),L=require('./dist/live-model.js'),harness=require('./test-screenshot-transfer.cjs');
const epoch=Date.parse('2026-10-20T20:00:00Z');
const start={level:58,exp:100000,mesos:100000,hp:0,mp:0,hpCost:0,mpCost:0,uses:[
  {id:'use-1',itemId:'238',name:'Meat',quantity:100,cost:80},
  {id:'use-2',itemId:'240',name:'Lemon',quantity:100,cost:150},
  {id:'use-3',itemId:'223',name:'Magic Potion',quantity:20,cost:500}
]};
const cp=(ms,exp,mesos,counts,added=[0,0,0])=>({elapsedMs:ms,at:epoch+ms,source:'automatic',end:{level:58,exp,mesos,hp:0,mp:0,hpAdded:0,mpAdded:0,extraExp:0,ledger:[],uses:counts.map((quantity,i)=>({id:start.uses[i].id,quantity,added:added[i]}))}});
// After 30 minutes at 60k EXP/hour, a slow 30 seconds must visibly drop to
// 12k/hour, rather than the nearly unchanged 59,213 session average.
const a=cp(1800000,130000,110000,[90,90,19]),b=cp(1830000,130100,110200,[89,89,19]),c=cp(1860000,131100,null,[88,null,19]),d=cp(1890000,131100,110800,[87,87,18]);
const state={id:'interval-fixture',stage:'running',start,startedAt:epoch,pausedMs:300000,autoPoints:[a,b,c,d],checkpoints:[],ledger:[]};
const view=L.project(state,{now:epoch+2190000});
assert.deepEqual(view.intervalRows.map(r=>r.expHour),[0,60000,12000,120000,0]);
// First costs 2,800; next costs 230 against +200 mesos -> -30 in 30 sec.
assert.equal(view.intervalRows[1].netHour,14400);assert.equal(view.intervalRows[2].netHour,-3600);
assert.equal(view.intervalRows[3].netHour,null);
// Across the unreadable minute: +600 balance - (2*80+2*150+500) = -360.
assert.equal(view.intervalRows[4].netHour,-21600);assert.equal(view.intervalRows[4].netFrom,1830000);
assert.equal(view.intervalRows[4].expFrom,1860000);assert.equal(view.activeMs,1890000,'Wall-clock breaks are excluded');
assert.equal(view.stats.expHour,31100*3600000/1890000,'Headline average remains cumulative');
assert.equal(L.snapshot(state,{now:epoch+2190000}).series[2].exp,30100*3600000/1830000,'Overlay retains its current average graph contract');
const pending={...d,elapsedMs:1920000,preview:true,end:{...d.end,exp:999999,mesos:9999999}};
const withPreview=L.project(state,{preview:pending});assert.deepEqual(withPreview.intervalRows,view.intervalRows,'Pending OCR is not a valid graph endpoint');
assert.equal(withPreview.point.preview,true,'Tracker may still show its marked pending summary');
assert.deepEqual(L.project({...state,autoPoints:[a,b,{...pending}],checkpoints:[a]}).intervalRows,L.project({...state,autoPoints:[a,b]}).intervalRows,'Deduped manual/automatic readings; flagged previews excluded');
const restocked=cp(1920000,132100,111000,[95,86,18],[10,0,0]);assert.equal(L.project({...state,autoPoints:[...state.autoPoints,restocked]}).intervalRows.at(-1).netHour,-13200,'Restock additions are cumulative, not a negative usage rebate');
const warmup=L.project({...state,autoPoints:[cp(120,100001,100002,[100,100,20]),cp(30000,100010,100003,[100,100,20]),cp(60000,100110,100103,[100,100,20])]});assert.deepEqual(warmup.intervalRows.map(r=>r.expHour),[0,0,0,12000]);
const leveledStart={...start,exp:M.expTable[58]-100},leveled=cp(60000,100,100000,[100,100,20]);leveled.end.level=59;
assert.equal(L.project({...state,start:leveledStart,autoPoints:[leveled]}).intervalRows.at(-1).expHour,12000,'Level-up uses cumulative EXP positions');
const h=harness(new Map([['maple-journal-session-v1',JSON.stringify({...state,startedAt:epoch-2190000})]]));const plotted=h.charts.get('live-exp-chart');assert.deepEqual(plotted.rows.map(r=>r.expHour),[0,60000,12000,120000,0],'Real main view passes interval rows to SVG renderer');
assert.equal(h.node('live-exp-hour').textContent,'59,238.1','Main view summary is the session average');
const legacy={...start,uses:undefined,hp:100,mp:100,hpCost:80,mpCost:150};const first={elapsedMs:60000,end:{level:58,exp:101000,mesos:101000,hp:99,mp:99}},second={elapsedMs:90000,end:{level:58,exp:101100,mesos:101100,hp:98,mp:98}};assert.equal(L.project({...state,start:legacy,autoPoints:[first,second]}).intervalRows.at(-1).netHour,-15600,'Legacy two-potion sessions retain costs');
const final=M.calculate(start,d.end,1890000);assert.equal(final.rates.hour.exp,view.stats.expHour);assert.equal(final.net,6810);assert.equal(final.rates.hour.mesos,6810*3600000/1890000);
console.log('Passed: independent interval dips/spikes/zero rates, exact consumable/net costs, gaps and recovery from last valid financial reading, pauses, warmup, level-ups, pending exclusion, legacy supplies, real chart wiring, and unchanged headline/final/overlay averages.');
