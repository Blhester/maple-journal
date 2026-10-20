'use strict';
const fs=require('node:fs'),path=require('node:path');
function build(){
  const directory=path.join(__dirname,'dist'),data=JSON.parse(fs.readFileSync(path.join(directory,'data/maps.json'),'utf8')),ids=new Set();
  if(data.schemaVersion!==1||!Array.isArray(data.maps)||data.maps.length<100)throw new Error('Invalid map catalog.');
  for(const map of data.maps){if(!/^\d{9}$/.test(map.id)||ids.has(map.id)||!map.name||typeof map.street!=='string'||map.sourceUrl!=='https://meowdb.com/msclassic/maps/'+map.id)throw new Error('Invalid map entry.');ids.add(map.id);}
  fs.writeFileSync(path.join(directory,'map-data.js'),'(function(root){const data='+JSON.stringify(data).replaceAll('<','\\u003c')+';root.MapleMapData=data;if(typeof module!=="undefined")module.exports=data;})(typeof window!=="undefined"?window:globalThis);\n');return data;
}
module.exports={build};if(require.main===module)console.log('Validated '+build().maps.length+' map records.');
