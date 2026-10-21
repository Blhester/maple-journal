'use strict';
const assert=require('node:assert/strict');

// Expected answers are fixed, hand-calculated fixtures. Do not derive them with
// the production rate helpers: an incorrect conversion must fail these tests.
const start={level:null,exp:10000,mesos:100000,hp:100,mp:100,hpCost:80,mpCost:150,hpPotion:'meat',mpPotion:'lemon'};
const shell=(quantity,kind='loot')=>({source:'etc',itemId:'348',label:'Snail Shell',quantity,unitPrice:3,kind,value:quantity*3});
const fixtures=[
  {
    name:'30 active minutes, five-minute break, potion consumption, unsold ETC and cash adjustments',
    startedAt:'2026-10-20T20:00:00.000Z',stoppedAt:'2026-10-20T20:35:00.000Z',pausedMs:300000,
    start,end:{exp:40000,mesos:148100,hp:80,mp:90,ledger:[shell(2000),{kind:'income',label:'Other sale',value:2000},{kind:'expense',label:'Other expense',value:500}]},
    // Balance +48,100; Meat 20*80=1,600; Lemons 10*150=1,500.
    // Original 45,000; cash 45,000+2,000-500=46,500; ETC 2,000*3=6,000.
    expected:{ms:1800000,gross:48100,hpUsed:20,mpUsed:10,hpCost:1600,mpCost:1500,loot:6000,income:2000,expense:500,net:45000,adjustedNet:46500,estimatedNet:52500,
      rates:{net:{hour:90000,ten:15000,minute:1500},adjustedNet:{hour:93000,ten:15500,minute:1550},estimatedNet:{hour:105000,ten:17500,minute:1750}},
      expRates:{hour:60000,ten:10000,minute:1000}}
  },
  {
    name:'15 minutes 30 seconds across midnight, added supplies and unsold ETC',
    startedAt:'2026-10-20T23:55:00.000Z',stoppedAt:'2026-10-21T00:10:30.000Z',pausedMs:0,
    start,end:{exp:25500,mesos:105400,hp:110,mp:120,hpAdded:20,mpAdded:30,ledger:[shell(310),{kind:'income',label:'Other sale',value:620}]},
    // 15.5 minutes, not 15.30. Used 100+20-110=10 HP and 100+30-120=10 MP.
    // Original 5,400-800-1,500=3,100; cash 3,720; total 3,720+930=4,650.
    expected:{ms:930000,gross:5400,hpUsed:10,mpUsed:10,hpCost:800,mpCost:1500,loot:930,income:620,expense:0,net:3100,adjustedNet:3720,estimatedNet:4650,
      rates:{net:{hour:12000,ten:2000,minute:200},adjustedNet:{hour:14400,ten:2400,minute:240},estimatedNet:{hour:18000,ten:3000,minute:300}},
      expRates:{hour:60000,ten:10000,minute:1000}}
  },
  {
    name:'ETC sold after the ending balance goes into cash exactly once',
    startedAt:'2026-10-20T20:00:00.000Z',stoppedAt:'2026-10-20T20:30:00.000Z',pausedMs:0,
    start,end:{exp:40000,mesos:148100,hp:80,mp:90,ledger:[shell(2000,'income'),{kind:'income',label:'Other sale',value:2000},{kind:'expense',label:'Other expense',value:500}]},
    expected:{ms:1800000,gross:48100,hpUsed:20,mpUsed:10,hpCost:1600,mpCost:1500,loot:0,income:8000,expense:500,net:45000,adjustedNet:52500,estimatedNet:52500,
      rates:{net:{hour:90000,ten:15000,minute:1500},adjustedNet:{hour:105000,ten:17500,minute:1750},estimatedNet:{hour:105000,ten:17500,minute:1750}},
      expRates:{hour:60000,ten:10000,minute:1000}}
  },
  {
    name:'subsecond timing: 62.5 seconds, with full precision retained',
    startedAt:'2026-10-20T20:00:00.250Z',stoppedAt:'2026-10-20T20:01:02.750Z',pausedMs:0,
    start,end:{exp:10125,mesos:101250,hp:100,mp:100},
    expected:{ms:62500,gross:1250,hpUsed:0,mpUsed:0,hpCost:0,mpCost:0,loot:0,income:0,expense:0,net:1250,adjustedNet:1250,estimatedNet:1250,
      rates:{net:{hour:72000,ten:12000,minute:1200},adjustedNet:{hour:72000,ten:12000,minute:1200},estimatedNet:{hour:72000,ten:12000,minute:1200}},
      expRates:{hour:7200,ten:1200,minute:120}}
  },
  {
    name:'negative profit remains negative in every period, including loot-inclusive profit',
    startedAt:'2026-10-20T20:00:00.000Z',stoppedAt:'2026-10-20T20:02:00.000Z',pausedMs:0,
    start,end:{exp:12000,mesos:100000,hp:99,mp:99,ledger:[shell(76)]},
    expected:{ms:120000,gross:0,hpUsed:1,mpUsed:1,hpCost:80,mpCost:150,loot:228,income:0,expense:0,net:-230,adjustedNet:-230,estimatedNet:-2,
      rates:{net:{hour:-6900,ten:-1150,minute:-115},adjustedNet:{hour:-6900,ten:-1150,minute:-115},estimatedNet:{hour:-60,ten:-10,minute:-1}},
      expRates:{hour:60000,ten:10000,minute:1000}}
  },
  {
    name:'zero profit over one hour',
    startedAt:'2026-10-20T20:00:00.000Z',stoppedAt:'2026-10-20T21:00:00.000Z',pausedMs:0,
    start,end:{exp:70000,mesos:100000,hp:100,mp:100},
    expected:{ms:3600000,gross:0,hpUsed:0,mpUsed:0,hpCost:0,mpCost:0,loot:0,income:0,expense:0,net:0,adjustedNet:0,estimatedNet:0,
      rates:{net:{hour:0,ten:0,minute:0},adjustedNet:{hour:0,ten:0,minute:0},estimatedNet:{hour:0,ten:0,minute:0}},
      expRates:{hour:60000,ten:10000,minute:1000}}
  },
  {
    name:'repeating decimal rates are rounded only for display',
    startedAt:'2026-10-20T20:00:00.000Z',stoppedAt:'2026-10-20T20:15:30.000Z',pausedMs:0,
    start,end:{exp:25500,mesos:110000,hp:100,mp:100},
    expected:{ms:930000,gross:10000,hpUsed:0,mpUsed:0,hpCost:0,mpCost:0,loot:0,income:0,expense:0,net:10000,adjustedNet:10000,estimatedNet:10000,
      rates:{net:{hour:38709.67741935484,ten:6451.612903225807,minute:645.1612903225806},adjustedNet:{hour:38709.67741935484,ten:6451.612903225807,minute:645.1612903225806},estimatedNet:{hour:38709.67741935484,ten:6451.612903225807,minute:645.1612903225806}},
      displayed:{hour:'38,709.68',ten:'6,451.61',minute:'645.16'},expRates:{hour:60000,ten:10000,minute:1000}}
  }
];

function verifyRateFixtures(M=require('./dist/core.js')){
  const display=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
  const near=(actual,expected,label)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-8,`${label}: expected ${expected}, got ${actual}`);
  for(const fixture of fixtures){
    const expected=fixture.expected;
    const session={id:fixture.name,stage:'complete',startedAt:Date.parse(fixture.startedAt),stoppedAt:Date.parse(fixture.stoppedAt),pausedMs:fixture.pausedMs,start:structuredClone(fixture.start),end:structuredClone(fixture.end),checkpoints:[]};
    // Exercise the same timing -> totals -> selected profit rates chain as the UI,
    // then repeat through history validation and a JSON backup/restore round trip.
    const restored=M.mergeHistory([],JSON.parse(JSON.stringify([session])))[0];
    for(const [path,record]of [['session',session],['restored history',restored]]){
      const label=`${fixture.name} / ${path}`;
      const elapsed=M.activeElapsed(record,Date.parse('2026-10-22T00:00:00.000Z'));
      assert.equal(elapsed,expected.ms,label+' / elapsed');
      const result=M.calculate(record.start,record.end,elapsed);
      for(const key of ['gross','hpUsed','mpUsed','hpCost','mpCost','net','adjustedNet','estimatedNet'])assert.equal(result[key],expected[key],label+' / '+key);
      for(const key of ['loot','income','expense'])assert.equal(result.ledger[key],expected[key],label+' / '+key);
      for(const metric of ['net','adjustedNet','estimatedNet']){
        const rates=M.profitRates(result,metric);
        for(const period of ['hour','ten','minute']){
          near(rates[period],expected.rates[metric][period],label+' / '+metric+' / '+period);
          if(metric==='net')near(result.rates[period].mesos,expected.rates.net[period],label+' / original result / '+period);
          if(expected.displayed)assert.equal(display.format(rates[period]),expected.displayed[period],label+' / displayed '+period);
        }
        // Map comparison uses the selected metric's hourly value as well.
        near(M.groupMaps([record],metric)[0].netHour,expected.rates[metric].hour,label+' / map comparison / '+metric);
      }
      for(const period of ['hour','ten','minute'])near(result.rates[period].exp,expected.expRates[period],label+' / EXP / '+period);
    }
  }
  console.log('Passed: 7 hand-calculated rate fixtures covering fixed timestamps, pauses, potion additions/costs, ETC quantity/value and sale status, cash adjustments, fractional seconds/minutes, losses, zero profit, display rounding, JSON/history and map comparisons.');
}

module.exports=verifyRateFixtures;
if(require.main===module)verifyRateFixtures();
