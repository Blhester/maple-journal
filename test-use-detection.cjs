'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),harness=require('./test-screenshot-transfer.cjs'),{decode}=require('./lib/png-rgba.cjs'),C=require('./dist/ocr-core.js'),Q=require('./dist/quantity-reader.js');
let slots;
const h=harness(new Map(),{setupRuntime:(context,Element)=>{
  context.window=context;context.document.body=new Element('body');context.setTimeout=setTimeout;context.MapleUseData=require('./dist/data/use-items.json');context.MapleIconMatcher=require('./dist/icon-matcher.js');
  vm.runInNewContext(fs.readFileSync('dist/use-icons.js','utf8'),context);
  context.document.createElement=tag=>{const n=new Element(tag);if(tag!=='canvas')return n;let data;
    n.getContext=()=>({drawImage:(im,...args)=>{
      const [sx,sy,sw,sh,dx,dy,dw,dh]=args.length===4?[0,0,im.width,im.height,...args]:args;
      data=new Uint8ClampedArray(n.width*n.height*4);for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const xx=Math.min(im.width-1,Math.max(0,Math.round(sx+(x+.5)*sw/dw-.5))),yy=Math.min(im.height-1,Math.max(0,Math.round(sy+(y+.5)*sh/dh-.5))),k=(yy*im.width+xx)*4;data.set(im.data.subarray(k,k+4),((y+dy)*n.width+x+dx)*4);}
    },getImageData:()=>({data,width:n.width,height:n.height}),strokeRect(){},fillText(){}});return n;};
  vm.runInNewContext(fs.readFileSync('dist/use-slots.js','utf8'),context);slots=context.MapleUseSlots;
}});
function image(file){const im=decode(fs.readFileSync(file));return {...im,naturalWidth:im.width,naturalHeight:im.height};}
async function quantity(im,r){const b=C.slotCountRegion(r,im.width,im.height),data=new Uint8ClampedArray(b.w*b.h*4);for(let y=0;y<b.h;y++)data.set(im.data.subarray(((b.y+y)*im.width+b.x)*4,((b.y+y)*im.width+b.x+b.w)*4),y*b.w*4);return Q.read({data,width:b.w,height:b.h});}
(async()=>{
  const im=image('fixtures/use-shortcuts-all.png'),statuses=[];const rows=await slots.read(im,quantity,{match:true,onStatus:s=>statuses.push(s)});
  console.log(rows.map(r=>[r.name,r.quantity]));
  assert.equal(statuses.length,12,'Automatic read visits every cell');
  assert.deepEqual(Array.from(rows,r=>[r.name,r.quantity]),[['Pet Food','100'],['Sniper Potion','51'],['Dexterity Potion','89'],['Magic Potion','100'],['White Potion','37'],['Meat','800'],['Lemon','800']]);
  assert.equal(new Set(rows.map(r=>r.id)).size,7);assert(rows.every(r=>r.region&&r.include));
  const unreadable=await slots.read(im,async(im,r)=>r.x>.73?{value:null}:quantity(im,r),{match:true});assert.equal(unreadable.length,4,'No card added for unreadable counted icons');
  const blank={...im,data:new Uint8ClampedArray(im.data.length).fill(255)};assert.equal((await slots.read(blank,quantity,{match:true})).length,0,'No default Meat/Lemon placeholder cards on an empty image');
  assert.equal((await slots.read(im,quantity,{match:true,isCurrent:()=>false})).length,0,'Cancelled discovery cannot return late results');
  const original=await slots.read(image('dist/assets/ocr-example.png'),quantity,{match:true});console.log('Holdout',original.map(r=>[r.name,r.quantity]));assert(original.some(r=>r.name==='Sniper Potion'&&r.quantity==='52'));assert(original.some(r=>r.name==='Magic Potion'&&r.quantity==='31'));assert(original.some(r=>r.name==='Pet Food'&&r.quantity==='12'));assert(original.some(r=>r.name==='Meat'&&r.quantity==='441'));assert(original.some(r=>r.name==='Lemon'&&r.quantity==='761'));
  slots.apply(rows);assert.equal(slots.starting().length,7,'Reviewed discovery replaces old two-slot defaults');
  const repeat=await slots.read(im,quantity,{match:true});assert.deepEqual(Array.from(repeat,r=>r.id),Array.from(rows,r=>r.id),'Detected identities survive a second scan');
  const periodic=await slots.read(im,quantity);assert.equal(periodic.length,7,'All accepted regions are used by periodic captures');assert.deepEqual(Array.from(periodic,r=>r.quantity),Array.from(rows,r=>r.quantity));
  slots.apply(rows.slice(-2));for(const [id,value]of Object.entries({'start-level':61,'start-exp':2297,'start-mesos':903668}))h.node(id).value=value;h.fire('start-form','submit');assert.equal(h.state().stage,'running');
  const during=await slots.read(im,async(im,r)=>r.x<.76?{value:null}:quantity(im,r),{match:true});assert.equal(during.length,2,'A running session never gains new items with no starting baseline');assert.equal(during[0].quantity,null,'Missing tracked quantity stays unknown instead of disappearing');assert.equal(during[1].quantity,'800');assert.equal(slots.starting()[0].quantity,800,'Discovery never overwrites the starting balance/counts');
  console.log('Passed: actual all-slot discovery on user screenshot, seven distinct items/counts, five skills omitted, unreadable/blank/cancel filtering, independent old screenshot holdout and seven-slot periodic reads.');
})().catch(e=>{console.error(e);process.exitCode=1;});
