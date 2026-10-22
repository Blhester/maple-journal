'use strict';
const assert=require('node:assert/strict'),A=require('./dist/auto-progress.js'),M=require('./dist/core.js'),harness=require('./test-screenshot-transfer.cjs');
const start={level:60,exp:100000,mesos:10000,hp:100,mp:200,hpCost:80,mpCost:150,hpPotion:'meat',mpPotion:'lemon'},end={level:60,exp:110000,mesos:15000,hp:80,mp:150,hpAdded:0,mpAdded:0},point={end,elapsedMs:600000};
const s=A.stats(start,point);assert.equal(s.hpPerMinute,2);assert.equal(s.mpPerMinute,5);assert.equal(s.hpRunwayMs,2400000);assert.equal(s.mpRunwayMs,1800000);
const paused=M.activeElapsed({startedAt:1000,stoppedAt:901000,pausedMs:300000});assert.equal(paused,600000);assert.equal(A.stats(start,{end,elapsedMs:paused}).hpRunwayMs,2400000,'Breaks cannot inflate supply runway');
assert.equal(A.stats(start,{end:{...end,hp:180,hpAdded:100},elapsedMs:600000}).hpRunwayMs,5400000,'Restocks add remaining stock, not negative consumption');
for(const [remaining,used,rate,runway]of [[100,0,0,null],[0,100,10,0],[null,null,null,null]]){const value=A.stats(start,{end:{...end,hp:remaining},elapsedMs:600000});assert.equal(value.hpUsed,used);assert.equal(value.hpPerMinute,rate);assert.equal(value.hpRunwayMs,runway);}
const partial=A.stats(start,{end:{...end,hp:null},elapsedMs:600000});assert.equal(partial.mpRunwayMs,1800000);assert.equal(partial.netHour,null);
const warm=A.stats(start,{end,elapsedMs:30000});assert.equal(warm.hpPerMinute,null);assert.equal(warm.hpRunwayMs,null);
const state={id:'runway-test',stage:'running',startedAt:Date.parse('2026-10-20T20:00:00Z'),pausedMs:0,start,checkpoints:[{...point,source:'automatic'}],ledger:[]},h=harness(new Map([['maple-journal-session-v1',JSON.stringify(state)]]));assert.equal(h.node('live-hp-drain').textContent,'2/min · 40 min left');assert.equal(h.node('live-mp-drain').textContent,'5/min · 30 min left');
console.log('Passed: exact independent HP/MP drain and runway, pauses, restocks, no-use, empty/unknown supplies, warmup, and live dashboard labels.');
