'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=__dirname,dist=path.join(root,'dist');
function build(){
  const catalog=JSON.parse(fs.readFileSync(path.join(dist,'data','fm-items.json'),'utf8'));
  if(catalog.schemaVersion!==1||!Array.isArray(catalog.items)||catalog.items.length<2000)throw Error('FM item catalog is missing or incomplete');
  const ids=new Set();
  for(const item of catalog.items){
    if(!/^\d+$/.test(item.id)||ids.has(item.id)||!['Equip','Use','Etc','Setup','Cash'].includes(item.type)||typeof item.name!=='string'||!item.name.trim()||item.sourceUrl!==`https://meowdb.com/msclassic/item-db/${item.id}`)throw Error('Invalid FM item metadata');
    if(item.icon&&(!/^assets\/fm\/\d+\.png$/.test(item.icon)||!fs.existsSync(path.join(dist,item.icon))))throw Error('Missing FM icon: '+item.icon);
    ids.add(item.id);
  }
  fs.writeFileSync(path.join(dist,'fm-data.js'),'window.MapleFmData='+JSON.stringify(catalog).replace(/</g,'\\u003c')+';\n');
  return catalog;
}
if(require.main===module){const catalog=build();console.log(`Built FM item picker with ${catalog.items.length} items.`);}else module.exports={build};
