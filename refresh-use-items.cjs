'use strict';
// Manual, paced refresh. No runtime requests to MeowDB; stop on source errors.
const fs=require('node:fs/promises'),path=require('node:path');
const base='https://meowdb.com',dist=path.join(__dirname,'dist'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url,binary=false){const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'GrindJournal-UseCatalog/1.0 (local catalog refresh)'}});if(!r.ok)throw Error(r.status+' '+url);return binary?Buffer.from(await r.arrayBuffer()):r;}
async function main(){
  const rows=[];for(let page=1;page<=30;page++){const d=await(await get(base+'/msclassic/api/items?type=Use&ossyria=0&locale=en&limit=100&page='+page)).json();if(!Array.isArray(d.items)||typeof d.hasMore!=='boolean')throw Error('Invalid catalog');rows.push(...d.items);if(!d.hasMore)break;if(page===30)throw Error('Pagination limit');await wait(180);}
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Duplicate items');
  await fs.mkdir(path.join(dist,'assets/use'),{recursive:true});const items=[];
  for(const [index,row]of rows.entries()){
    if(row.type!=='Use'||!/^\d+$/.test(String(row.id))||!/^\d+$/.test(String(row.iconKey)))throw Error('Invalid item');
    const icon='assets/use/'+row.iconKey+'.png';let bytes;try{bytes=await fs.readFile(path.join(dist,icon));}catch{bytes=await get(base+'/msclassic/api/assets/icons/'+row.iconKey,true);await wait(120);}
    if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)>256||bytes.readUInt32BE(20)>256||bytes.length>1048576)throw Error('Invalid icon');await fs.writeFile(path.join(dist,icon),bytes);
    let purchasePrice=null;
    if(row.subtype!=='Scroll'&&row.sources?.includes('npc')){
      const html=await(await get(base+'/msclassic/item-db/'+row.id)).text();
      const prices=[...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].filter(m=>/Launch prices/.test(m[0])&&!/Not open in this release/.test(m[0])).map(m=>m[0].replace(/<[^>]+>/g,' ')).map(s=>s.match(/([\d,]+)\s+mesos/)).filter(Boolean).map(m=>Number(m[1].replaceAll(',','')));
      if(prices.length)purchasePrice=Math.min(...prices);await wait(180);
    }
    items.push({id:String(row.id),name:row.displayName||row.name,category:row.displaySubtype||row.subtype||'Use',icon,iconKey:String(row.iconKey),purchasePrice,vendorPrice:JSON.parse(row.stats||'{}').price??null,sourceUrl:base+'/msclassic/item-db/'+row.id});
    if(index%50===0)console.log('Catalog '+(index+1)+' / '+rows.length);
  }
  const data={schemaVersion:1,checkedAt:new Date().toISOString(),source:base+'/msclassic/item-db/use',priceNote:'purchasePrice is the lowest listed open Launch shop price, not NPC sell-back value. Null requires a user-entered replacement cost. Availability may vary. Verify your price.',items};
  await fs.writeFile(path.join(dist,'data/use-items.json'),JSON.stringify(data,null,2)+'\n');await fs.writeFile(path.join(dist,'use-data.js'),'window.MapleUseData='+JSON.stringify(data).replaceAll('<','\\u003c')+';\n');require('./build-use-icons.cjs').build();console.log('Saved '+items.length+' local Use items.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
