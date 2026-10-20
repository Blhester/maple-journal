/* Refresh the checked-in, offline ETC catalog from MeowDB's public Classic API.
 * Run manually: node refresh-etc-catalog.cjs
 * No third-party packages, account, API key, or runtime network dependency.
 */
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const base='https://meowdb.com';
const root=__dirname;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url,binary=false){
  for(let attempt=0;attempt<3;attempt++){
    const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'MapleJournal-CatalogRefresh/1.0 (user-requested local item lookup)'}});
    // Do not evade denied access, authentication, or throttling.
    if([401,403,429].includes(response.status))throw new Error(`Source refused access: ${response.status} ${url}`);
    if(response.ok){
      if(binary){
        if(!(response.headers.get('content-type')||'').startsWith('image/png'))throw new Error(`Expected PNG: ${url}`);
        const data=Buffer.from(await response.arrayBuffer());
        if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error(`Invalid PNG: ${url}`);
        return data;
      }
      return response.json();
    }
    if(response.status<500||attempt===2)throw new Error(`Source request failed: ${response.status} ${url}`);
    await wait(500*(attempt+1));
  }
}
async function main(){
  const count=await request(`${base}/msclassic/api/items/count?type=Etc&ossyria=0`);
  const rows=[];
  for(let page=1;page<=100;page++){
    const result=await request(`${base}/msclassic/api/items?type=Etc&ossyria=0&page=${page}&limit=100&locale=en`);
    if(!Array.isArray(result.items))throw new Error('Unexpected item response.');
    rows.push(...result.items);
    if(!result.hasMore)break;
    if(page===100)throw new Error('Pagination did not terminate.');
    await wait(150);
  }
  if(rows.length!==count.total)throw new Error(`Catalog changed during refresh: expected ${count.total}, received ${rows.length}; rerun.`);
  const ids=new Set(),items=[],excluded=[];
  for(const row of rows){
    if(row.type!=='Etc'||!Number.isSafeInteger(row.id)||ids.has(row.id))throw new Error('Unexpected or duplicate item.');
    ids.add(row.id);
    const stats=typeof row.stats==='string'?JSON.parse(row.stats):row.stats;
    if(!Number.isSafeInteger(stats?.price)||stats.price<0||!/^\d+$/.test(String(row.iconKey))){excluded.push(row.id);continue;}
    const item={id:String(row.id),name:row.displayName||row.name,vendorPrice:stats.price,icon:`assets/etc/${row.id}.png`,sourceUrl:`${base}/msclassic/item-db/${row.id}`,iconSource:`${base}/msclassic/api/assets/icons/${row.iconKey}`};
    if(row.subtype)item.subtype=row.subtype;
    if(Number.isSafeInteger(stats.slotMax)&&stats.slotMax>0)item.maxStack=stats.slotMax;
    if(Array.isArray(row.sources))item.sources=row.sources;
    items.push(item);
  }
  await fs.mkdir(path.join(root,'dist','assets','etc'),{recursive:true});
  // Two workers keep refresh traffic modest. Icons are tiny game PNGs.
  let next=0;
  await Promise.all(Array.from({length:2},async()=>{
    while(next<items.length){
      const item=items[next++];
      const bytes=await request(item.iconSource,true);
      await fs.writeFile(path.join(root,'dist',item.icon),bytes);
      await wait(150);
    }
  }));
  items.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  const catalog={source:`${base}/msclassic/item-db/etc`,checkedAt:new Date().toISOString(),schemaVersion:1,priceBasis:'MeowDB Classic item stats.price: NPC Sell-back per unit, not NPC purchase price or player market value.',scope:'All ETC items returned with ossyria=0. Includes quest items and entries without a known source. Zero sell-back values are retained; absent or invalid prices are excluded.',sourceItemCount:rows.length,excludedItemIds:excluded,items};
  await fs.mkdir(path.join(root,'dist','data'),{recursive:true});
  await fs.writeFile(path.join(root,'dist','data','etc-items.json'),JSON.stringify(catalog,null,2)+'\n');
  console.log(`Saved ${items.length} ETC items and PNG icons (${excluded.length} excluded without a valid price/icon).`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
