const fs=require('node:fs'),path=require('node:path');
const dist=path.join(__dirname,'dist');
const catalog=JSON.parse(fs.readFileSync(path.join(dist,'data','etc-items.json'),'utf8'));
if(!Array.isArray(catalog.items)||!catalog.items.length)throw new Error('ETC catalog is empty.');
const ids=new Set();
for(const item of catalog.items){
  if(!/^\d{1,10}$/.test(String(item.id))||ids.has(String(item.id))||typeof item.name!=='string'||!item.name||!Number.isSafeInteger(item.vendorPrice)||item.vendorPrice<0||item.icon!=='assets/etc/'+item.id+'.png')throw new Error('Invalid ETC catalog item: '+item.id);
  ids.add(String(item.id));
  if(!fs.existsSync(path.join(dist,item.icon)))throw new Error('Missing local icon for '+item.name);
}
const serialize=value=>JSON.stringify(value).replaceAll('<','\\u003c');
fs.writeFileSync(path.join(dist,'etc-data.js'),'window.MapleEtcData='+serialize(catalog)+';\n');
module.exports={catalog,serialize};
if(require.main===module)console.log('Validated '+catalog.items.length+' ETC items and generated the offline catalog script.');
