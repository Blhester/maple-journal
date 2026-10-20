'use strict';
const assert=require('node:assert/strict');
require('./build-maps.cjs').build();
const M=require('./dist/map-matcher.js'),data=require('./dist/data/maps.json'),select=(...texts)=>M.select(texts.map(text=>({text,label:'test OCR'})));
assert(data.maps.length>=400);assert.equal(new Set(data.maps.map(map=>map.id)).size,data.maps.length);
for(const map of data.maps)assert.equal(M.resolve(map.street+' · '+map.name).label,map.street+' · '+map.name);
const perion=select('Victoria Roar - Ferien');assert.equal(perion.value,'Victoria Road · Perion');assert.equal(perion.needsConfirmation,true);assert.ok(perion.raw.includes('Ferien'));
assert.equal(M.resolve('Victoria Roar - Ferien'),null);assert.equal(M.resolve('Perion').label,'Victoria Road · Perion');
assert.equal(select('not a real town','Victoria Road\nPerion').value,'Victoria Road · Perion');
assert.equal(select('Dungeon\nAnt Tunnel IV','[iimgeon\nAnt Tammel IV').value,'Dungeon · Ant Tunnel IV');
for(const suffix of ['I','II','III','IV'])assert.equal(select('Dungeon\nAnt Tunnel '+suffix).value,'Dungeon · Ant Tunnel '+suffix);
const unclear=select('Dungeon\nAnt Tunnel');assert.equal(unclear.needsConfirmation,true);assert.equal(unclear.candidates.length,2);
for(const texts of [[],[''],['x'],['zzqx abcdef'],['Victoria Road']])assert.equal(select(...texts).value,null);
for(const texts of [['Victoria Roar - Ferien'],['Dungeon\nAnt Tunnel'],['zzqx abcdef'],['Victoria Road\nPerion'],['Hidden Stret - Pig Bech']]){const result=select(...texts);assert(result.candidates.length<=2);for(const candidate of result.candidates)assert.equal(M.resolve(candidate.label).label,candidate.label);}
assert.equal(select('MINI MAP\nVictoria Road\nPerion').value,'Victoria Road · Perion');
assert.equal(select('Victoria Road: Perion').value,select('Victoria Road - Perion').value);
assert.equal(select('Victoria Road · Perion').needsConfirmation,false);
assert.equal(M.lookup('perion')[0].label,'Victoria Road · Perion');assert(M.lookup('ant tunnel').length<=5);assert.equal(M.lookup('Victoria Roar - Ferien')[0].label,'Victoria Road · Perion');
console.log('Passed: MeowDB map catalog, all canonical labels, Ferien correction, either OCR reading, numeric map suffixes, ambiguous/empty rejection, and catalog-only suggestions.');
