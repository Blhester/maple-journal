'use strict';
// Calibrate the local matcher against Classic's scaled HUD artwork. Only icon
// pixels are retained; shortcut labels, quantity digits and the screen are not
// embedded in the website. The separate original example is a holdout fixture.
const fs=require('node:fs'),{decode}=require('../lib/png-rgba.cjs');
const catalog=require('../dist/data/use-items.json').items,im=decode(fs.readFileSync('fixtures/use-shortcuts-all.png'));
const file='dist/data/use-icon-references.json',references=JSON.parse(fs.readFileSync(file,'utf8')).filter(r=>!r.fixture);
for(const [id,x,y]of [['269',1318,835],['224',1367,835],['225',1417,835],['223',1367,884],['272',1367,934]]){
  const points=[];for(let yy=14;yy<30;yy++)for(let xx=8;xx<44;xx++){
    const sx=Math.round(x+(xx+.5)*49/48-.5),sy=Math.round(y+(yy+.5)*49/48-.5),p=(sy*im.width+sx)*4,r=im.data[p],g=im.data[p+1],b=im.data[p+2];
    if(Math.min(r,g,b)<165||Math.max(r,g,b)-Math.min(r,g,b)>45)points.push([xx,yy,r,g,b]);
  }
  const item=catalog.find(r=>r.id===id);references.push({id,iconKey:item.iconKey,width:48,height:48,points:points.filter((_,i)=>i%3===0),cell:true,fixture:'use-shortcuts-all',source:'User-provided Classic screenshot; central icon pixels only'});
}
fs.writeFileSync(file,JSON.stringify(references)+'\n');
