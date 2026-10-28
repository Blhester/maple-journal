'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {decode}=require('./lib/png-rgba.cjs'),reader=require('./dist/exp-reader.js');
const source=decode(fs.readFileSync('test/fixtures/exp/sample-exp-full.png'));
function resize(input,factor,{nearest=false,offset=0}={}){
  const width=Math.round(input.width*factor),height=Math.round(input.height*factor),data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=(x+.5+offset)/factor-.5,sy=(y+.5+offset)/factor-.5,i=(y*width+x)*4;
    for(let channel=0;channel<4;channel++){
      if(nearest){const px=Math.max(0,Math.min(input.width-1,Math.round(sx))),py=Math.max(0,Math.min(input.height-1,Math.round(sy)));data[i+channel]=input.data[(py*input.width+px)*4+channel];continue;}
      const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let v=0;
      for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
        const px=Math.max(0,Math.min(input.width-1,x0+xx)),py=Math.max(0,Math.min(input.height-1,y0+yy));
        v+=input.data[(py*input.width+px)*4+channel]*(xx?fx:1-fx)*(yy?fy:1-fy);
      }data[i+channel]=Math.round(v);
    }
  }return {width,height,data};
}
const variants=[
  ['2x nearest',resize(source,2,{nearest:true})],
  ['2x smooth',resize(source,2)],
  ['4K then 1080p capture',resize(resize(source,2,{nearest:true}),.5,{offset:.25})],
  ['4K then 1440p capture',resize(resize(source,2,{nearest:true}),.75,{offset:.25})],
  ['fractional desktop scaling',resize(source,1.5,{offset:.25})]
];
for(const [label,image] of variants){const result=reader.read({...image,format:'percent'});assert.equal(result.value,'24.70',label);}
assert.equal(reader.read({...variants[0][1],format:'percent'}).resampled,true,'Block-scaled 4K text uses the native-size fallback');
for(const file of ['sample-truncated.png','other-font.png','blank.png']){
  const scaled=resize(decode(fs.readFileSync('test/fixtures/exp/'+file)),2,{nearest:true});
  assert.equal(reader.read({...scaled,format:'percent'}).value,null,'Reject enlarged '+file);
}
console.log('Passed: 1080p HUD scaled onto a 4K desktop, fractional resizing, and enlarged invalid crops.');
