'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

// Minimal DOM test double. Run the real screenshot submit handler and app.js;
// only recognition workers, visual widgets and storage/network side effects are
// replaced. No copy of the production transfer or calculation logic lives here.
function harness(storage=new Map()){
  const nodes=new Map(),html=fs.readFileSync(path.join(__dirname,'dist/index.html'),'utf8');
  class Element{
    constructor(tag='div'){this.tag=tag;this.children=[];this.events=new Map();this.attributes={};this.dataset={};this._value='';this.textContent='';this.checked=false;this.hidden=false;this.disabled=false;this.classList={toggle(){},remove(){},add(){}};}
    set value(value){this._value=String(value);}get value(){return this._value;}
    setAttribute(key,value){this.attributes[key]=String(value);}removeAttribute(key){delete this.attributes[key];}
    addEventListener(type,handler){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push(handler);}
    dispatchEvent(event){for(const handler of this.events.get(event.type)||[])handler(event);return true;}
    append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
    querySelectorAll(){return [];}focus(){}showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}
    reset(){for(const id of this.formIds||[]){const node=nodes.get(id);node.value=node.initialValue;}}
  }
  for(const match of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
    const node=new Element(match[1]);node.id=match[2];node.value=match[0].match(/\bvalue="([^"]*)"/)?.[1]||'';node.initialValue=node.value;nodes.set(node.id,node);
  }
  for(const match of html.matchAll(/<form\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g))nodes.get(match[1]).formIds=[...match[2].matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const node=id=>{assert(nodes.has(id),'Known HTML/test node: '+id);return nodes.get(id);};
  // Review fields are normally built after OCR. Supply those reviewed results
  // directly, leaving parsing, checkbox filtering and form transfer to real code.
  for(const field of require('./dist/ocr-core.js').fields)for(const prefix of ['ocr-use-','ocr-value-','ocr-potion-'])nodes.set(prefix+field.id,new Element('input'));
  let now=Date.parse('2026-10-20T20:00:00Z'),etcOptions,saved;
  const context={document:{getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),addEventListener(){}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    Date:class extends Date{static now(){return now;}},Event,Intl,structuredClone,console,URL,AbortController,Option:class extends Element{constructor(label,value){super('option');this.textContent=label;this.value=value;}},
    setInterval:()=>1,clearInterval(){},location:{hash:''},history:{replaceState(){}},addEventListener(){},
    MapleMath:require('./dist/core.js'),MapleOcrCore:require('./dist/ocr-core.js'),MapleMapMatcher:require('./dist/map-matcher.js'),
    MapleScreenCapture:{supported:()=>false},MaplePotionPicker:{enhance(){},syncAll(){},setBusy(){},dispose(){}},
    MapleEtc:{init:options=>{etcOptions=options;},render(){},reset(){}},
    MapleHistory:{save:record=>{saved=structuredClone(record);},lineChart(){}}
  };
  context.window=context;vm.createContext(context);
  for(const file of ['screenshot.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'dist',file),'utf8'),context,{filename:file});
  const fire=(id,type='click')=>node(id).dispatchEvent(new Event(type,{cancelable:true}));
  function applyReview(values,stage='start'){
    fire('screenshot-'+stage);
    for(const field of context.MapleOcrCore.fields){node('ocr-use-'+field.id).checked=Object.hasOwn(values,field.id);node('ocr-value-'+field.id).value=values[field.id]??'';}
    for(const type of ['hp','mp'])node('ocr-potion-'+type).value=values[type+'Potion']||(type==='hp'?'meat':'lemon');
    fire('ocr-review-form','submit');
    assert.equal(node('ocr-review-error').textContent,'','Screenshot applied successfully');
  }
  return {node,fire,applyReview,storage,setTime:value=>{now=Date.parse(value);},entries:values=>etcOptions.onChange(values),state:()=>JSON.parse(storage.get('maple-journal-session-v1')),saved:()=>saved};
}

// This is the real reviewed-screenshot -> start form -> timer -> ending form ->
// calculation -> rendered rate path, with known, independent expected answers.
const h=harness();
for(const [id,value]of Object.entries({'hp-potion':'meat','mp-potion':'lemon','hp-cost':'80','mp-cost':'150'}))assert.equal(h.node(id).value,value,'Fresh-browser default: '+id);
// Choose different supplies first, so applying OCR must change both item and cost.
h.node('hp-potion').value='white';h.fire('hp-potion','change');
h.node('mp-potion').value='blue';h.fire('mp-potion','change');
h.applyReview({map:'Dungeon · Ant Tunnel IV',class:'Wizard (Ice, Lightning)',level:'58',exp:'268628',mesos:'100000',hp:'100',mp:'100',hpPotion:'meat',mpPotion:'lemon'});
for(const [id,value]of Object.entries({'start-level':'58','start-exp':'268628','start-mesos':'100000','start-hp':'100','start-mp':'100','hp-potion':'meat','mp-potion':'lemon','hp-cost':'80','mp-cost':'150'}))assert.equal(h.node(id).value,value,'Starting import: '+id);
assert.equal(h.state().stage,'setup','Applying OCR does not start training');
h.fire('start-form','submit');assert.equal(h.state().stage,'running');
h.setTime('2026-10-20T20:10:00Z');h.fire('pause-button');
h.setTime('2026-10-20T20:15:00Z');h.fire('pause-button');
h.setTime('2026-10-20T20:35:00Z');h.fire('done-button');
const startingSnapshot=structuredClone(h.state().start);
h.applyReview({map:'Must not replace starting map',class:'Must not replace starting class',level:'58',exp:'298628',mesos:'148100',hp:'80',mp:'90',hpPotion:'white',mpPotion:'blue'},'end');
for(const [id,value]of Object.entries({'end-level':'58','end-exp':'298628','end-mesos':'148100','end-hp':'80','end-mp':'90','start-mesos':'100000','hp-potion':'meat','mp-potion':'lemon','hp-cost':'80','mp-cost':'150'}))assert.equal(h.node(id).value,value,'Ending import: '+id);
assert.deepEqual(h.state().start,startingSnapshot,'Ending OCR cannot overwrite recorded starting values or prices');
assert.equal(h.node('session-map').value,'Dungeon · Ant Tunnel IV');
assert.equal(h.node('session-class').value,'Wizard (Ice, Lightning)');
h.applyReview({hp:'80',mp:'90'},'end');
assert.equal(h.node('end-mesos').value,'148100','A second ending import with Mesos unchecked keeps the previous ending balance');
assert.deepEqual(h.state().start,startingSnapshot,'A partial ending re-import still preserves the start snapshot');
h.entries([{source:'etc',itemId:'348',label:'Snail Shell',quantity:2000,unitPrice:3,value:6000,kind:'loot'},{label:'Other sale',value:2000,kind:'income'},{label:'Other expense',value:500,kind:'expense'}]);
// Ending-value/OCR review time is excluded, even if it takes another ten minutes.
h.setTime('2026-10-20T20:45:00Z');h.fire('end-form','submit');
assert.equal(h.node('end-error').textContent,'');assert.equal(h.state().stage,'complete');
assert.equal(h.saved().startedAt,Date.parse('2026-10-20T20:00:00Z'));assert.equal(h.saved().stoppedAt,Date.parse('2026-10-20T20:35:00Z'));assert.equal(h.saved().pausedMs,300000);
for(const [id,value]of Object.entries({'total-exp':'30,000','total-net':'52,500','mesos-hour':'105,000','mesos-ten':'17,500','mesos-minute':'1,750','exp-hour':'60,000','exp-ten':'10,000','exp-minute':'1,000'}))assert.equal(h.node(id).textContent,value,'Rendered calculation: '+id);
// Reopening from the saved draft must display exactly the same values and rates.
const restored=harness(h.storage);
for(const id of ['start-mesos','end-mesos','start-hp','end-hp','start-mp','end-mp'])assert.equal(restored.node(id).value,h.node(id).value,'Restored field: '+id);
for(const id of ['mesos-hour','mesos-ten','mesos-minute'])assert.equal(restored.node(id).textContent,h.node(id).textContent,'Restored rate: '+id);
// Selectors must use one profit total consistently across the three displayed rates.
restored.node('profit-metric').value='net';restored.fire('profit-metric','change');
assert.equal(restored.node('mesos-hour').textContent,'90,000');assert.equal(restored.node('mesos-ten').textContent,'15,000');assert.equal(restored.node('mesos-minute').textContent,'1,500');
restored.fire('new-button');
const next=harness(restored.storage);
for(const [id,value]of Object.entries({'hp-potion':'meat','mp-potion':'lemon','hp-cost':'80','mp-cost':'150','start-exp':'','start-mesos':'','start-hp':'','start-mp':''}))assert.equal(next.node(id).value,value,'New Session then reload: '+id);
// An explicit saved choice, including a custom unit price, takes precedence.
next.node('hp-potion').value='red';next.fire('hp-potion','change');next.node('hp-cost').value='45';next.fire('hp-cost','input');
const chosen=harness(next.storage);assert.equal(chosen.node('hp-potion').value,'red');assert.equal(chosen.node('hp-cost').value,'45');

const partial=harness();
partial.node('start-mesos').value='123456';partial.fire('start-mesos','input');
partial.applyReview({exp:'0',hp:'0',mp:'0',hpPotion:'meat',mpPotion:'lemon'});
assert.equal(partial.node('start-mesos').value,'123456','Unchecked/missing OCR fields retain the existing form value by design');
for(const id of ['start-exp','start-hp','start-mp'])assert.equal(partial.node(id).value,'0','Zero is applied: '+id);
partial.applyReview({mesos:'0'});assert.equal(partial.node('start-mesos').value,'0','Zero mesos replaces the earlier value');
partial.fire('start-form','submit');assert.equal(partial.state().start.mesos,0);
partial.setTime('2026-10-20T20:01:00Z');partial.fire('done-button');
partial.applyReview({exp:'1000',mesos:'600',hp:'0',mp:'0'},'end');
partial.fire('end-form','submit');assert.equal(partial.node('mesos-hour').textContent,'36,000');assert.equal(partial.node('mesos-ten').textContent,'6,000');assert.equal(partial.node('mesos-minute').textContent,'600');

// An invalid checked proposal must fail before any of the reviewed values apply.
const invalid=harness();invalid.node('start-mesos').value='777';invalid.fire('screenshot-start');
for(const field of require('./dist/ocr-core.js').fields)invalid.node('ocr-use-'+field.id).checked=false;
invalid.node('ocr-use-exp').checked=true;invalid.node('ocr-value-exp').value='5000';
invalid.node('ocr-use-mesos').checked=true;invalid.node('ocr-value-mesos').value='not a number';
invalid.fire('ocr-review-form','submit');assert.match(invalid.node('ocr-review-error').textContent,/valid mesos/i);
assert.equal(invalid.node('start-exp').value,'');assert.equal(invalid.node('start-mesos').value,'777');

console.log('Passed: real screenshot review submit -> start/end forms -> timed session -> rendered rates, starting-value isolation, item/price isolation, zeros, unchecked fields, invalid proposals, saved drafts and profit selector updates.');
