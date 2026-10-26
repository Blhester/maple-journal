'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),R=require('./dist/exp-reader.js'),F=require('./dist/exp-font.js'),C=require('./dist/ocr-core.js'),M=require('./dist/core.js'),A=require('./dist/auto-progress.js'),{decode}=require('./lib/png-rgba.cjs');
const real=decode(fs.readFileSync('test/fixtures/exp/sample-exp-full.png'));
assert.equal(R.read({...real,format:'percent'}).value,'24.70');
function crop(p,left,width){const data=new Uint8ClampedArray(width*p.height*4);for(let y=0;y<p.height;y++)data.set(p.data.subarray((y*p.width+left)*4,(y*p.width+left+width)*4),y*width*4);return {width,height:p.height,data};}
assert.equal(R.read({...crop(real,45,real.width-45),format:'percent'}).value,'24.70','Clipping the absolute EXP prefix cannot affect the percentage');
function render(text,scale){
  const glyphs=[...text].map(char=>char==='.'?{width:1,height:7,alpha:[0,0,0,0,0,0,1]}:char==='%'?F.percent:F.glyphs.find(g=>g.digit===char)),baseWidth=8+glyphs.reduce((sum,g)=>sum+g.width+1,0),W=Math.ceil(baseWidth*scale),H=Math.ceil(15*scale),data=new Uint8ClampedArray(W*H*4);const base=Array(baseWidth*15).fill(0);let left=4;
  for(const g of glyphs){for(let y=0;y<7;y++)for(let x=0;x<g.width;x++)base[(y+4)*baseWidth+left+x]=g.alpha[y*g.width+x];left+=g.width+1;}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const sx=(x+.5)/scale-.5,sy=(y+.5)/scale-.5,ix=Math.floor(sx),iy=Math.floor(sy);let a=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const xx=ix+dx,yy=iy+dy;if(xx>=0&&xx<baseWidth&&yy>=0&&yy<15)a+=base[yy*baseWidth+xx]*(dx?sx-ix:1-sx+ix)*(dy?sy-iy:1-sy+iy);}const i=(y*W+x)*4;data[i]=data[i+1]=data[i+2]=Math.round(25+180*a);data[i+3]=255;}
  return {width:W,height:H,data};
}
for(const value of ['0.00','0.01','9.99','24.70','50.00','91.23','99.99'])for(const scale of [1,1.25,1.5,2,3])assert.equal(R.read({...render(value+'%',scale),format:'percent'}).value,Number(value).toFixed(2),value+' at '+scale+'x');
for(const value of ['100.00%','24.7%','2470%','24.70','24.70%%'])assert.equal(R.read({...render(value,1.5),format:'percent'}).value,null,'Reject malformed percentage '+value);
for(const scale of [1,1.25,1.5,2,3])assert.equal(R.read({...render('100.00%',scale),format:'percent',allowComplete:true}).value,'100.00');
assert.equal(C.parsePercent('[100.00%]',{allowComplete:true}),'100.00');assert.equal(C.parsePercent('[100.01%]',{allowComplete:true}),null);assert.equal(C.parsePercent('[101.00%]',{allowComplete:true}),null);
for(const value of ['24.70%','268,628 [24.70%]','EXP 1,087,000 [24,70%]'])assert.equal(C.parsePercent(value),'24.70');
for(const value of ['100.00%','-24.70%','+24.70%','24.7%','24.70','268,628','24.70%%','24.70% 25.00%'])assert.equal(C.parsePercent(value),null);
assert.equal(C.percentExp(58,'24.70'),'268621');assert.equal(C.percentExp(58,'50.00'),'543768');assert.equal(C.percentExp(58,'99.99'),'1087427');assert.equal(C.percentExp(59,'0.01'),'114');assert.equal(C.percentExp(100,'0.00'),'0');
for(const [level,pct]of [[null,'24.70'],['','24.70'],[0,'24.70'],[101,'24.70'],[58,'100.00'],[58,'-1.00'],[100,'1.00']])assert.equal(C.percentExp(level,pct),null);
const estimate=C.convertPercent(R.read({...real,format:'percent'}),58);assert.equal(estimate.value,'268621');assert.equal(estimate.estimated,true);assert.equal(estimate.levelUsed,58);assert.equal(C.convertPercent(R.read({...real,format:'percent'}),null).value,null);
const voted=C.convertPercent(C.selectPercent([{text:'[24.70%]',confidence:80},{text:'268628 [24.70%]',confidence:30},{text:'[24.10%]',confidence:99}]),58);assert.equal(voted.value,'268621');assert.equal(voted.disagrees,true);assert.deepEqual(voted.alternatives,['262096']);
const start={level:58,exp:Number(C.percentExp(58,'50.00')),mesos:10000,hp:100,mp:100,hpCost:80,mpCost:150},end={level:58,exp:Number(C.percentExp(58,'51.00')),mesos:11000,hp:99,mp:99};assert.equal(M.calculate(start,end,600000).rates.hour.exp,65250);
assert.equal(M.calculate({...start,exp:Number(C.percentExp(58,'99.99'))},{...end,level:59,exp:Number(C.percentExp(59,'0.01'))},60000).rates.hour.exp,13380,'Level-up uses the new level requirement');
const read={at:100000,results:{level:{value:'58',confidence:90},exp:estimate,mesos:{value:'11000',confidence:90},hp:{value:'99',method:'classic-digits'},mp:{value:'99',method:'classic-digits'}}};assert.equal(A.fromRead(read,start,60000).end.exp,268621);
const legacy={x:1047/1919,y:1037/1079,w:66/1919,h:17/1079};assert.deepEqual(C.migrateExpRegion(legacy),C.defaults.exp);const custom={x:.5,y:.8,w:.02,h:.02},migrated=C.migrateExpRegion(custom);assert.equal(migrated.x,custom.x);assert.equal(migrated.y,custom.y);assert.equal(migrated.h,custom.h);assert(migrated.w>custom.w);
console.log('Passed: real and clipped-prefix EXP percentage crops, 35 scaled percent font fixtures, malformed/missing percent rejection, exact level-table conversion, rounding estimates, level-up/rate math, OCR agreement and legacy-region widening.');
