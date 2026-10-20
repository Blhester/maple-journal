const assert=require('node:assert/strict'),fs=require('node:fs'),M=require('./dist/core.js'),catalog=require('./dist/data/potion-icons.json');
const keys=new Set();
for(const item of catalog.items){
  const key=item.kind+':'+item.key,supply=M.catalog[item.kind]?.find(s=>s.id===item.key);assert(supply);assert.equal(supply.name,item.name);assert(!keys.has(key));keys.add(key);
  assert.equal(item.icon,'assets/potions/'+item.key+'.png');assert.equal(item.sourceUrl,'https://meowdb.com/msclassic/item-db/'+item.id);assert.equal(item.iconSource,'https://meowdb.com/msclassic/api/assets/icons/'+item.iconKey);
  const bytes=fs.readFileSync('./dist/'+item.icon);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert(bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(16)<=256);assert(bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(20)<=256);
}
for(const type of ['hp','mp'])for(const item of M.catalog[type])assert.equal(keys.has(type+':'+item.id),item.id!=='custom');
assert.equal(catalog.items.length,13);assert.equal(M.catalog.hp.find(i=>i.id==='meat').cost,80);assert.equal(M.catalog.mp.find(i=>i.id==='lemon').cost,150);
console.log('Passed: all named supplies have unique, correctly mapped local PNGs and source metadata; custom entries remain generic and costs are preserved.');
