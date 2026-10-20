const fs=require('node:fs'),path=require('node:path'),M=require('./dist/core.js');
const dist=path.join(__dirname,'dist'),potionCatalog=JSON.parse(fs.readFileSync(path.join(dist,'data','potion-icons.json'),'utf8')),keys=new Set();
for(const item of potionCatalog.items){
  const supply=M.catalog[item.kind]?.find(supply=>supply.id===item.key),key=item.kind+':'+item.key;
  if(!supply||item.key==='custom'||supply.name!==item.name||keys.has(key)||item.icon!=='assets/potions/'+item.key+'.png'||!/^\d+$/.test(item.id)||!/^\d+$/.test(item.iconKey))throw new Error('Invalid potion icon mapping: '+key);
  const bytes=fs.readFileSync(path.join(dist,item.icon));if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Invalid potion PNG: '+item.name);keys.add(key);
}
for(const type of ['hp','mp'])for(const item of M.catalog[type])if(item.id!=='custom'&&!keys.has(type+':'+item.id))throw new Error('Missing potion icon: '+item.name);
const serialize=value=>JSON.stringify(value).replaceAll('<','\\u003c');
fs.writeFileSync(path.join(dist,'potion-data.js'),'window.MaplePotionData='+serialize(potionCatalog)+';\n');
module.exports={potionCatalog,serialize};
if(require.main===module)console.log('Validated '+keys.size+' potion icons and generated their offline metadata.');
