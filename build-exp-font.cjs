'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{decode}=require('./lib/png-rgba.cjs');
function build(){
  const dist=path.join(__dirname,'dist'),metadata=JSON.parse(fs.readFileSync(path.join(dist,'data/exp-font.json'),'utf8')),seen=new Set();
  if(metadata.schemaVersion!==1||metadata.glyphs.length!==10)throw Error('Invalid EXP font metadata.');
  const glyphs=metadata.glyphs.map(g=>{
    if(!/^[0-9]$/.test(g.digit)||seen.has(g.digit)||g.icon!=='assets/exp-font/'+g.digit+'.png')throw Error('Invalid EXP glyph.');seen.add(g.digit);
    const bytes=fs.readFileSync(path.join(dist,g.icon));
    if(bytes.length!==g.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==g.sha256)throw Error('EXP glyph checksum mismatch.');
    const p=decode(bytes);if(p.width!==5||p.height!==7||g.width!==5||g.height!==7)throw Error('Invalid EXP glyph dimensions.');
    let left=5,right=0;for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(p.data[(y*5+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x);}
    const width=right-left+1,alpha=Array.from({length:width*7},(_,i)=>p.data[(Math.floor(i/width)*5+i%width+left)*4+3]/255);
    return {digit:g.digit,width,height:7,alpha};
  }).sort((a,b)=>Number(a.digit)-Number(b.digit));
  const font={schemaVersion:1,source:metadata.source,path:metadata.path,glyphs};
  fs.writeFileSync(path.join(dist,'exp-font.js'),'(function(root){"use strict";const font='+JSON.stringify(font)+';if(typeof module==="object"&&module.exports)module.exports=font;root.MapleExpFont=font;})(typeof globalThis!=="undefined"?globalThis:this);\n');return font;
}
module.exports={build};if(require.main===module){build();console.log('Verified and embedded ten EXP font glyphs.');}
