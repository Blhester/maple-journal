/* Refresh the Classic item quantity digit sprites. Run manually with Node 22+.
 * No npm dependencies. Source imagery belongs to Nexon, as attributed by MapleStory.io.
 */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {decode}=require('./lib/png-rgba.cjs');
const {build}=require('./build-quantity-font.cjs');
const base='https://maplestory.io/api/wz/img/GMS/83/UI/Basic.img/ItemNo/';
const root=__dirname,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main() {
  const downloads=[],glyphs=[];
  for(let n=0;n<10;n++) {
    const digit=String(n),sourceUrl=base+digit;
    const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'GrindJournal-QuantityFontRefresh/1.0 (user-requested local UI glyph lookup)'}});
    // Access denials and throttling stop the refresh; never retry or bypass them.
    if(!response.ok)throw new Error('Source request failed: '+response.status+' '+sourceUrl);
    if(!(response.headers.get('content-type')||'').startsWith('image/png'))throw new Error('Expected PNG: '+sourceUrl);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>65536)throw new Error('Unexpected quantity glyph size.');
    const image=decode(bytes),width=n===1?5:8;
    if(image.width!==width||image.height!==11)throw new Error('Unexpected source glyph dimensions: '+digit);
    const icon='assets/quantity-font/'+digit+'.png';
    glyphs.push({digit,width,height:11,icon,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceUrl});
    downloads.push({icon,bytes});await wait(150);
  }
  // All ten assets are checked before replacing any checked-in source file.
  await fs.mkdir(path.join(root,'dist','assets','quantity-font'),{recursive:true});
  await fs.mkdir(path.join(root,'dist','data'),{recursive:true});
  for(const {icon,bytes}of downloads)await fs.writeFile(path.join(root,'dist',icon),bytes);
  const metadata={schemaVersion:1,checkedAt:new Date().toISOString(),source:'https://maplestory.io',region:'GMS',version:'83',path:'UI/Basic.img/ItemNo',attribution:'MapleStory UI sprites are the property of Nexon. Provided by the public MapleStory.io WZ API; https://maplestory.io/ states ownership and Terms of Service.',scope:'Unmodified digits 0–9 from the Classic inventory/shortcut quantity bitmap font. Local template matching only; no screenshots are sent to the asset provider.',glyphs};
  await fs.writeFile(path.join(root,'dist','data','quantity-font.json'),JSON.stringify(metadata,null,2)+'\n');
  build();console.log('Saved ten quantity glyph PNGs ('+downloads.reduce((sum,item)=>sum+item.bytes.length,0)+' bytes) and generated offline font data.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
