'use strict';
const fs=require('node:fs'),path=require('node:path');
const source='https://meowdb.com/msclassic/maps';
function extract(html){
  const records=[...html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/g)].map(match=>JSON.parse(match[1])).filter(record=>record[0]===1).map(record=>record[1]).join('');
  let maps;
  function visit(value){if(!value||typeof value!=='object')return;if(Array.isArray(value.maps)&&value.maps[0]?.streetName)maps=value.maps;for(const child of Object.values(value))if(typeof child==='object')visit(child);}
  for(const line of records.split('\n')){let record;try{record=JSON.parse(line.slice(line.indexOf(':')+1));}catch{continue;}visit(record);}
  if(!maps||maps.length<100)throw new Error('The public map catalog format changed; no files were updated.');
  const ids=new Set();return maps.map(row=>{
    if(!/^\d{9}$/.test(row.id)||ids.has(row.id)||typeof row.name!=='string'||typeof row.streetName!=='string')throw new Error('Invalid map source row.');ids.add(row.id);
    return {id:row.id,name:row.displayName||row.name,street:row.displayStreet||row.streetName,region:row.displayRegion||row.region,sourceUrl:source+'/'+row.id};
  }).sort((a,b)=>a.id.localeCompare(b.id));
}
async function main(){
  const response=await fetch(source,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'MapleJournal-CatalogRefresh/1.0 (user-requested map lookup)'}});
  if(!response.ok)throw new Error('Map source request failed: '+response.status);
  const rows=extract(await response.text()),maps=rows.filter(map=>/[a-z]{3}/i.test(map.name)),catalog={schemaVersion:1,source,checkedAt:new Date().toISOString(),scope:'Named maps in MeowDB Classic’s public English map index, including optional Ossyria content. Duplicate display names retain distinct source IDs. Unnamed numeric placeholders are excluded.',sourceMapCount:rows.length,excludedUnnamedIds:rows.filter(map=>!maps.includes(map)).map(map=>map.id),maps};
  fs.writeFileSync(path.join(__dirname,'dist/data/maps.json'),JSON.stringify(catalog,null,2)+'\n');require('./build-maps.cjs').build();console.log('Saved '+maps.length+' MeowDB maps for offline matching.');
}
module.exports={extract};if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
