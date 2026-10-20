'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {decode}=require('./lib/png-rgba.cjs');
const dist=path.join(__dirname,'dist');
function build() {
  const metadata=JSON.parse(fs.readFileSync(path.join(dist,'data','quantity-font.json'),'utf8'));
  if(metadata.schemaVersion!==1||!Array.isArray(metadata.glyphs)||metadata.glyphs.length!==10)throw new Error('Invalid quantity font metadata.');
  const seen=new Set();
  const glyphs=metadata.glyphs.map(glyph=>{
    if(!/^[0-9]$/.test(glyph.digit)||seen.has(glyph.digit)||glyph.icon!=='assets/quantity-font/'+glyph.digit+'.png'||!/^[a-f0-9]{64}$/.test(glyph.sha256))throw new Error('Invalid quantity glyph metadata.');
    seen.add(glyph.digit);
    const bytes=fs.readFileSync(path.join(dist,glyph.icon));
    if(bytes.length!==glyph.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==glyph.sha256)throw new Error('Quantity font asset checksum mismatch: '+glyph.digit);
    const decoded=decode(bytes);
    if(decoded.width!==glyph.width||decoded.height!==glyph.height||decoded.height!==11||decoded.width!==(glyph.digit==='1'?5:8))throw new Error('Quantity font dimensions mismatch: '+glyph.digit);
    return {digit:glyph.digit,width:decoded.width,height:decoded.height,rgba:Array.from(decoded.data)};
  });
  glyphs.sort((a,b)=>Number(a.digit)-Number(b.digit));
  const dataset={schemaVersion:1,source:metadata.source,region:metadata.region,version:metadata.version,path:metadata.path,glyphs};
  const serialized=JSON.stringify(dataset).replaceAll('<','\\u003c');
  fs.writeFileSync(path.join(dist,'quantity-font.js'),'(function(root){\n  "use strict";\n  const font='+serialized+';\n  if(typeof module==="object"&&module.exports)module.exports=font;\n  root.MapleQuantityFont=font;\n})(typeof globalThis!=="undefined"?globalThis:this);\n');
  return dataset;
}
module.exports={build};
if(require.main===module){const font=build();console.log('Verified and embedded '+font.glyphs.length+' Classic quantity glyphs.');}
