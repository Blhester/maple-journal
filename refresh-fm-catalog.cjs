/* Refresh the offline Free Market item picker from MeowDB's public Classic API.
 * Run manually: node refresh-fm-catalog.cjs
 */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const root=__dirname,base='https://meowdb.com',types=['Equip','Use','Etc','Setup','Cash'];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url,binary=false){
  for(let attempt=0;attempt<3;attempt++){
    const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'MapleJournal-FMCatalogRefresh/1.0 (offline item picker)'}});
    if([401,403,429].includes(response.status))throw Error(`MeowDB refused the refresh: ${response.status} ${url}`);
    if(response.ok){
      if(!binary)return response.json();
      const data=Buffer.from(await response.arrayBuffer());
      if(!response.headers.get('content-type')?.startsWith('image/png')||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`Invalid PNG: ${url}`);
      return data;
    }
    if(response.status<500||attempt===2)throw Error(`MeowDB request failed: ${response.status} ${url}`);
    await pause(500*(attempt+1));
  }
}
async function main(){
  const items=[],seen=new Set(),iconKeys=new Set(),counts={};
  for(const type of types){
    const count=await request(`${base}/msclassic/api/items/count?type=${type}&ossyria=1`);let fetched=0;
    for(let page=1;page<=100;page++){
      const data=await request(`${base}/msclassic/api/items?type=${type}&ossyria=1&page=${page}&limit=100&locale=en`);
      if(!Array.isArray(data.items))throw Error('Unexpected item response');
      for(const row of data.items){
        if(row.type!==type||!Number.isSafeInteger(row.id)||seen.has(row.id))throw Error('Unexpected or duplicate item');
        seen.add(row.id);fetched++;
        const name=String(row.displayName||row.name||'').trim(),iconKey=/^\d+$/.test(String(row.iconKey||''))?String(row.iconKey):null;
        if(!name)continue;
        if(iconKey)iconKeys.add(iconKey);
        items.push({id:String(row.id),name,type,subtype:String(row.displaySubtype||row.subtype||''),icon:iconKey?`assets/fm/${iconKey}.png`:null,sourceUrl:`${base}/msclassic/item-db/${row.id}`});
      }
      if(!data.hasMore)break;
      if(page===100)throw Error('Item pagination did not terminate');
      await pause(120);
    }
    if(fetched!==count.total)throw Error(`${type} count changed during refresh: expected ${count.total}, received ${fetched}`);
    counts[type]=fetched;
    console.log(`${type}: ${fetched} items`);
  }
  const iconDir=path.join(root,'dist','assets','fm');await fs.mkdir(iconDir,{recursive:true});
  const keys=[...iconKeys];let next=0,downloaded=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(next<keys.length){
      const key=keys[next++],file=path.join(iconDir,key+'.png');
      try{await fs.access(file);continue;}catch{}
      const bytes=await request(`${base}/msclassic/api/assets/icons/${key}`,true);
      await fs.writeFile(file,bytes);downloaded++;await pause(80);
    }
  }));
  items.sort((a,b)=>a.name.localeCompare(b.name,'en')||a.type.localeCompare(b.type)||Number(a.id)-Number(b.id));
  const catalog={schemaVersion:1,checkedAt:new Date().toISOString(),source:`${base}/msclassic/item-db`,scope:'MeowDB Classic Equip, Use, Etc, Setup and Cash items with Ossyria enabled. Names and icons only; player market prices are entered by the user.',counts,items};
  await fs.writeFile(path.join(root,'dist','data','fm-items.json'),JSON.stringify(catalog)+'\n');
  console.log(`Saved ${items.length} searchable items, ${iconKeys.size} icons (${downloaded} downloaded).`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
