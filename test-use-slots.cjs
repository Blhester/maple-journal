'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),M=require('./dist/core.js'),A=require('./dist/auto-progress.js'),L=require('./dist/live-model.js'),I=require('./dist/icon-matcher.js'),{decode}=require('./lib/png-rgba.cjs');
const catalog=require('./dist/data/use-items.json');assert(catalog.items.length>=400);for(const row of catalog.items){assert(fs.existsSync('dist/'+row.icon));if(row.purchasePrice!==null)assert(Number.isSafeInteger(row.purchasePrice));}
assert.equal(catalog.items.find(i=>i.name==='Magic Potion').purchasePrice,500);assert.equal(catalog.items.find(i=>i.name==='Magic Potion').vendorPrice,250);
const slots=[['238','Meat',100,80],['240','Lemon',200,150],['223','Magic Potion',20,500],['225','Dexterity Potion',10,500]].map(([itemId,name,quantity,cost],i)=>({id:'use-'+i,itemId,name,quantity,cost}));
const start={level:58,exp:268628,mesos:100000,hp:0,mp:0,hpCost:0,mpCost:0,uses:slots};
const end={level:59,exp:10000,mesos:150000,hp:0,mp:0,hpAdded:0,mpAdded:0,uses:slots.map((s,i)=>({id:s.id,quantity:[90,180,17,9][i],added:0})),ledger:[]};
// 30 active minutes, five paused: 50,000 balance gain - (800+3000+1500+500).
const state={stage:'complete',id:'known-four-items',startedAt:1000,stoppedAt:2101000,pausedMs:300000,start,end,checkpoints:[]};
const r=M.calculate(start,end,M.activeElapsed(state));assert.equal(r.supplyCost,5800);assert.equal(r.net,44200);assert.equal(r.rates.hour.mesos,88400);assert.equal(r.rates.ten.mesos,44200/3);assert.equal(r.rates.minute.mesos,44200/30);assert.equal(r.uses[2].used,3);assert.equal(r.uses[2].runwayMs,17*1800000/3);
const clean=M.normalizeSession(JSON.parse(JSON.stringify(state)));assert.deepEqual(clean.start.uses,slots);assert.deepEqual(clean.end.uses,end.uses);assert.equal(M.calculate(clean.start,clean.end,M.activeElapsed(clean)).net,44200);
assert.equal(L.snapshot(state).netHour,88400);assert(!JSON.stringify(L.snapshot(state)).includes('Magic'));assert(!JSON.stringify(L.snapshot(state)).includes('quantity'));
const partial={...end,uses:end.uses.map((x,i)=>i===2?{...x,quantity:null}:x)};assert.equal(A.stats(start,{end:partial,elapsedMs:120000}).net,null);assert(A.stats(start,{end:partial,elapsedMs:120000}).exp>0);assert.equal(A.stats(start,{end,elapsedMs:30000}).netHour,0);
assert.equal(M.calculate(start,{...end,mesos:100000},1800000).net,-5800);assert.equal(M.calculate(start,{...end,uses:end.uses.map((x,i)=>i===2?{...x,quantity:22,added:5}:x)},1800000).uses[2].used,3);
assert.throws(()=>M.calculate(start,{...end,uses:end.uses.slice(1)},1800000),/every use slot/);assert.throws(()=>M.cleanUses([...slots,{...slots[0],id:'another'}]),/duplicate hotkeys/);assert.throws(()=>M.cleanUses([{...slots[0],cost:null}]),/unit cost/);
const result=(value)=>({value,method:'classic-digits'}),read=(values,at=61000)=>({at,results:{level:result(58),exp:result(268700),mesos:result(101000),uses:slots.map((s,i)=>({id:s.id,result:result(values[i])}))}});
const p=A.fromRead(read([95,190,19,10]),start,60000);assert.deepEqual(p.end.uses.map(x=>x.quantity),[95,190,19,10]);const f=A.createFilter({start});assert.equal(f.offer(p).accepted.length,0);const next=A.fromRead(read([90,180,18,9],91000),start,90000);assert.equal(f.offer(next).accepted.length,1);
const unknown=A.fromRead(read([90,180,null,9],121000),start,120000);assert.equal(unknown.end.uses[2].quantity,null);assert.equal(A.stats(start,unknown).net,null);
const font={window:{}};vm.runInNewContext(fs.readFileSync('dist/use-icons.js','utf8'),font);
const im=decode(fs.readFileSync('dist/assets/ocr-example.png'));
const C=require('./dist/ocr-core.js'),Q=require('./dist/quantity-reader.js');
for(const [x,y,expected]of [[1365,834,'52'],[1365,883,'31'],[1365,933,'12'],[1415,933,'441'],[1465,933,'761']]){
  const box=C.slotCountRegion({x:x/1919,y:y/1079,w:49/1919,h:49/1079},1919,1079),data=new Uint8ClampedArray(box.w*box.h*4);
  for(let yy=0;yy<box.h;yy++)data.set(im.data.subarray(((box.y+yy)*1919+box.x)*4,((box.y+yy)*1919+box.x+box.w)*4),yy*box.w*4);
  assert.equal(Q.read({data,width:box.w,height:box.h}).value,expected,'Real counter from an arbitrary whole shortcut cell');
}
function crop(x,y,w,h,size=48){const data=new Uint8ClampedArray(size*size*4);for(let yy=0;yy<size;yy++)for(let xx=0;xx<size;xx++){const sx=Math.min(im.width-1,Math.round(x+(xx+.5)*w/size-.5)),sy=Math.min(im.height-1,Math.round(y+(yy+.5)*h/size-.5));data.set(im.data.subarray((sy*im.width+sx)*4,(sy*im.width+sx)*4+4),(yy*size+xx)*4);}return data;}
for(const [x,id]of [[1415,'238'],[1465,'240']]){const ranked=I.rank(crop(x,933,49,49),48,48,font.window.MapleUseIcons);assert.equal(ranked[0].id,id,'Real shortcut image top suggestion');}
const blank=new Uint8ClampedArray(48*48*4).fill(255);assert(!I.rank(blank,48,48,font.window.MapleUseIcons)[0]?.strong,'White empty shortcut never auto-picked');
for(const id of ['222','223','224','225','226']){
  const sprite=decode(fs.readFileSync('dist/'+catalog.items.find(r=>r.id===id).icon)),cell=new Uint8ClampedArray(48*48*4).fill(245);
  for(let y=0;y<41;y++)for(let x=0;x<41;x++){const p=(Math.floor(y*sprite.height/41)*sprite.width+Math.floor(x*sprite.width/41))*4,k=((y+3)*48+x+3)*4,a=sprite.data[p+3]/255;for(let j=0;j<3;j++)cell[k+j]=sprite.data[p+j]*a+245*(1-a);cell[k+3]=255;}
  const match=I.rank(cell,48,48,font.window.MapleUseIcons)[0];assert.equal(match.id,id,'Different colored attack/magic/accuracy/evasion/speed icons');assert(match.strong);
}
const small=new Uint8ClampedArray(960*540*4);for(let y=0;y<540;y++)for(let x=0;x<960;x++){const from=(Math.floor(y*im.height/540)*im.width+Math.floor(x*im.width/960))*4;small.set(im.data.subarray(from,from+4),(y*960+x)*4);}
const boxes=I.cells(small,960,540);assert.equal(boxes.length,12,'Real screenshot shortcut grid');const detected=boxes.map(b=>I.rank(crop(b.x*im.width,b.y*im.height,b.w*im.width,b.h*im.height),48,48,font.window.MapleUseIcons)[0]).filter(r=>r.strong).map(r=>r.id);assert(detected.includes('238'));assert(detected.includes('240'));
console.log('Passed: four generic items, independent known rates/pauses/level-up/costs, restocks, negatives, first-minute zeros, null gaps, JSON/history, confirmed overlay privacy, auto reads/filter, local catalog and real Meat/Lemon icon suggestions.');
