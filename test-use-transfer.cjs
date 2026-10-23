'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),harness=require('./test-screenshot-transfer.cjs');
const runtime=(context,Element)=>{context.window=context;context.document.body=new Element('body');context.setTimeout=setTimeout;context.MapleUseData=require('./dist/data/use-items.json');vm.runInNewContext(fs.readFileSync('dist/use-slots.js','utf8'),context);};
const h=harness(new Map(),{setupRuntime:runtime});
const all=(root,tag)=>[...(root.tag===tag?[root]:[]),...root.children.flatMap(c=>all(c,tag))];
function input(node,value){node.value=value;node.dispatchEvent(new Event('input'));}
let cards=h.node('use-setup-list').children;assert.equal(cards.length,2);input(all(cards[0],'input')[1],'100');input(all(cards[1],'input')[1],'200');
h.fire('use-add');cards=h.node('use-setup-list').children;assert.equal(cards.length,3);
const search=all(cards[2],'input')[0];input(search,'Magic Potion');const pick=all(cards[2],'button').find(b=>b.children.some(c=>c.textContent==='Magic Potion · Buff'));assert(pick);pick.dispatchEvent(new Event('click'));input(all(cards[2],'input')[1],'20');assert.equal(all(cards[2],'input')[2].value,'500');
for(const [id,v]of Object.entries({'start-level':58,'start-exp':268628,'start-mesos':100000}))input(h.node(id),v);
h.fire('start-form','submit');assert.equal(h.node('start-error').textContent,'');assert.equal(h.state().start.uses.length,3);assert.equal(h.state().start.hpCost,0);assert.equal(h.state().start.uses[2].itemId,'223');
h.setTime('2026-10-20T20:30:00Z');h.fire('done-button');
for(const [id,v]of Object.entries({'end-level':58,'end-exp':298628,'end-mesos':150000}))input(h.node(id),v);
for(const [i,card]of h.node('use-end-list').children.entries())input(all(card,'input')[0],[90,180,17][i]);
h.fire('end-form','submit');assert.equal(h.node('end-error').textContent,'');assert.equal(h.state().stage,'complete');assert.equal(h.node('total-net').textContent,'44,700');assert.equal(h.node('mesos-hour').textContent,'89,400');assert.equal(h.saved().end.uses[2].quantity,17);
const restored=harness(h.storage,{setupRuntime:runtime});assert.equal(restored.state().stage,'complete');assert.equal(restored.node('total-net').textContent,'44,700');restored.fire('new-button');assert.equal(restored.node('use-setup-list').children.length,3);assert.equal(restored.state().useDraft[2].itemId,'223');assert.equal(restored.state().useDraft[2].quantity,0);
console.log('Passed: real generic setup editor/search -> three-item start -> ending inputs -> exact costs/rates -> reload and next-session item defaults.');
