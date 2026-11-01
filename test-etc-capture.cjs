'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),harness=require('./test-screenshot-transfer.cjs'),{decode}=require('./lib/png-rgba.cjs'),C=require('./dist/ocr-core.js'),Q=require('./dist/quantity-reader.js'),M=require('./dist/core.js');
let capture;const storage=new Map();
const h=harness(storage,{setupRuntime:(context,Element)=>{
  context.window=context;context.document.body=new Element('body');context.setTimeout=setTimeout;context.MapleEtcData=require('./dist/data/etc-items.json');context.MapleIconMatcher=require('./dist/icon-matcher.js');
  vm.runInNewContext(fs.readFileSync('dist/etc-icons.js','utf8'),context);
  context.document.createElement=tag=>{const n=new Element(tag);if(tag!=='canvas')return n;let data;n.getContext=()=>({drawImage:(im,...args)=>{
    const [sx,sy,sw,sh,dx,dy,dw,dh]=args.length===4?[0,0,im.width,im.height,...args]:args;data=new Uint8ClampedArray(n.width*n.height*4);
    for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const xx=Math.min(im.width-1,Math.max(0,Math.round(sx+(x+.5)*sw/dw-.5))),yy=Math.min(im.height-1,Math.max(0,Math.round(sy+(y+.5)*sh/dh-.5))),k=(yy*im.width+xx)*4;data.set(im.data.subarray(k,k+4),((y+dy)*n.width+x+dx)*4);}
  },getImageData:()=>({data,width:n.width,height:n.height}),strokeRect(){},fillText(){}});return n;};
  context.MapleEtcVision=require('./dist/etc-vision.js');vm.runInNewContext(fs.readFileSync('dist/etc-capture.js','utf8'),context);capture=context.MapleEtcCapture;
}});
const image=file=>{const im=decode(fs.readFileSync(file));return {...im,naturalWidth:im.width,naturalHeight:im.height};};
async function quantity(im,r,settings,countRegion){const b=countRegion?C.digitRegion({x:Math.round(countRegion.x*im.width),y:Math.round(countRegion.y*im.height),w:Math.round(countRegion.w*im.width),h:Math.round(countRegion.h*im.height)},im.width,im.height,'quantity-font'):C.slotCountRegion(r,im.width,im.height),data=new Uint8ClampedArray(b.w*b.h*4);for(let y=0;y<b.h;y++)data.set(im.data.subarray(((b.y+y)*im.width+b.x)*4,((b.y+y)*im.width+b.x+b.w)*4),y*b.w*4);return Q.read({data,width:b.w,height:b.h});}
function addCell(target,column,row,itemId,source){const x=1598+column*50,y=282+row*48,asset=decode(fs.readFileSync('dist/'+require('./dist/data/etc-items.json').items.find(r=>r.id===itemId).icon));for(let yy=0;yy<48;yy++)for(let xx=0;xx<50;xx++)target.data.set([245,245,245,255],((y+yy)*target.width+x+xx)*4);for(let yy=0;yy<41;yy++)for(let xx=0;xx<41;xx++){const p=(Math.floor(yy*asset.height/41)*asset.width+Math.floor(xx*asset.width/41))*4,k=((y+yy+3)*target.width+x+xx+4)*4,alpha=asset.data[p+3]/255;for(let c=0;c<3;c++)target.data[k+c]=Math.round(asset.data[p+c]*alpha+245*(1-alpha));}for(let yy=30;yy<48;yy++)for(let xx=0;xx<29;xx++){const from=((282+yy)*source.width+1598+xx)*4,to=((y+yy)*target.width+x+xx)*4;target.data.set(source.data.subarray(from,from+4),to);}}
(async()=>{
  assert.equal(capture.enabled(),true);h.fire('screenshot-start');assert(h.node('ocr-region-field').children.some(option=>option.value==='etc'),'Screenshot review exposes ETC grid adjustment');h.fire('ocr-close');
  const im=image('fixtures/etc-inventory-synthetic.png'),read=await capture.read(im,quantity);assert.equal(read.readable,true);assert.deepEqual(Array.from(read.items,r=>[r.name,r.quantity]),[['Slime Bubble',32],['Snail Shell',31],['Octopus Leg',52]],'All recognizable visible stacks are detected without an item watch list');
  assert.equal((await capture.read(image('fixtures/use-shortcuts-all.png'),quantity)).readable,false,'Use tab never becomes ETC loot');
  capture.mount(read,im);const reviewed=capture.reviewed();assert.equal(reviewed.baseline.length,3);capture.apply(reviewed);
  for(const [id,value]of Object.entries({'start-level':60,'start-exp':2000,'start-mesos':10000,'start-hp':100,'start-mp':100}))h.node(id).value=value;h.fire('start-form','submit');assert.equal(h.node('start-error').textContent,'');assert.equal(h.state().stage,'running');assert.equal(h.state().start.etc.baselinePending,false);
  const grown={...im,data:new Uint8ClampedArray(im.data)};addCell(grown,4,0,'354',im);addCell(grown,0,1,'357',im);const expanded=await capture.read(grown,quantity,{background:true});assert.equal(expanded.readable,true);assert.equal(expanded.items.find(r=>r.itemId==='354').quantity,52,'New stack adds to the existing item total');assert.equal(expanded.items.find(r=>r.itemId==='357').quantity,20,'New item in an empty slot is discovered');
  const drops=M.etcLoot(h.state().start,{etc:expanded.items});assert.deepEqual(Array.from(drops,r=>[r.itemId,r.quantity,r.value]),[['354',20,1000],['357',20,200]],'Only gained quantities contribute vendor value');
  const unreadable=await capture.read(im,async()=>({value:null}),{background:true});assert.equal(unreadable.readable,false);assert(unreadable.items.every(r=>r.quantity===null),'Unreadable matched counts stay unknown');
  console.log('Passed: default ETC auto-detection, actual inventory icons/counts, non-ETC rejection, screenshot review baseline, new stacks/items in empty slots, vendor gain and unknown-count handling.');
})().catch(e=>{console.error(e);process.exitCode=1;});
