'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{decode}=require('./lib/png-rgba.cjs'),V=require('./dist/etc-vision.js'),I=require('./dist/icon-matcher.js'),catalog=require('./dist/data/etc-items.json').items,ctx={window:{}};
vm.runInNewContext(fs.readFileSync('dist/etc-icons.js','utf8'),ctx);const templates=ctx.window.MapleEtcIcons;
// Independent native-aspect rendering, rather than the legacy square-stretched
// scanner fixture. Vary size, positioning, HUD shade and captured brightness.
const names=['Slime Bubble','Snail Shell','Octopus Leg',"Pig’s Ribbon",'Tree Branch','Firewood','Orange Mushroom Cap','Green Mushroom Cap','Squishy Liquid'];
function cell(item,{scale=1.45,dx=0,dy=0,bg=[226,223,213],brightness=0}={}){
 const art=decode(fs.readFileSync('dist/'+item.icon)),data=new Uint8ClampedArray(48*48*4);for(let k=0;k<data.length;k+=4)data.set([...bg,255],k);
 const left=(48-art.width*scale)/2+dx,top=(48-art.height*scale)/2+dy;
 for(let y=0;y<48;y++)for(let x=0;x<48;x++){const xx=Math.floor((x+.5-left)/scale),yy=Math.floor((y+.5-top)/scale);if(xx<0||xx>=art.width||yy<0||yy>=art.height)continue;const p=(yy*art.width+xx)*4,k=(y*48+x)*4,a=art.data[p+3]/255;for(let c=0;c<3;c++)data[k+c]=Math.max(0,Math.min(255,Math.round((art.data[p+c]+brightness)*a+bg[c]*(1-a))));}
 // Quantity overlay must not dominate icon identity.
 for(let y=32;y<44;y++)for(let x=1;x<25;x++)if((x+y)%3)data.set([15,25,35,255],(y*48+x)*4);
 return data;
}
let tested=0;for(const name of names){const item=catalog.find(i=>i.name.replace(/'/g,'’')===name);assert(item,name);for(const settings of [{},{scale:1.35,dx:2,dy:-2,bg:[160,160,160],brightness:4},{scale:1.6,dx:-1,dy:1,bg:[205,213,200],brightness:-4}]){const result=V.rank(cell(item,settings),48,48,templates,{legacyRank:I.rank})[0];assert.equal(result.id,item.id,name+' top candidate');assert(result.strong,name+' should be accepted: '+JSON.stringify(result));tested++;}}
for(const color of [[245,245,245],[110,120,110],[20,20,20]]){const data=new Uint8ClampedArray(48*48*4);for(let i=0;i<data.length;i+=4)data.set([...color,255],i);assert(!V.rank(data,48,48,templates,{legacyRank:I.rank})[0]?.strong,'Empty shade cannot match an item');}
// Use-only icons and arbitrary scene textures must not manufacture ETC drops.
const uses=require('./dist/data/use-items.json').items;for(const name of ['Meat','Lemon']){const item=uses.find(i=>i.name===name);assert(item);assert(!V.rank(cell(item),48,48,templates,{legacyRank:I.rank})[0]?.strong,name+' is not ETC');}
const noise=new Uint8ClampedArray(48*48*4);for(let k=0;k<noise.length;k+=4)noise.set([(k*17)%256,(k*31)%256,(k*47)%256,255],k);assert(!V.rank(noise,48,48,templates,{legacyRank:I.rank})[0]?.strong);
const w=300,h=340,box={x:25,y:25,w:240,h:288},grid=new Uint8ClampedArray(w*h*4);for(let k=0;k<grid.length;k+=4)grid.set([210,207,200,255],k);
for(let y=18;y<=306;y++)for(let x=31;x<=271;x++)if((x-31)%48<2||(y-18)%48<2)grid.set([250,250,250,255],(y*w+x)*4);
const aligned=V.align(grid,w,h,box);assert(Math.abs(aligned.x-31)<=2);assert(Math.abs(aligned.y-18)<=2);assert.equal(aligned.w,box.w);assert.equal(aligned.h,box.h);
const flat=new Uint8ClampedArray(w*h*4).fill(170);assert.deepEqual(V.align(flat,w,h,box),box,'No grid means no correction');
console.log('Passed: '+tested+' native-aspect ETC matches at varied scales/positions/backgrounds; quantity masking; blank, Use and texture rejection; conservative grid translation with unchanged pitch.');
