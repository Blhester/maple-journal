(function(root){
  'use strict';
  const fields=[['map','Training map'],['class','Class / job'],['level','Level'],['exp','EXP'],['mesos','Mesos'],['hp','HP supply quantity'],['mp','MP supply quantity']].map(([id,label])=>({id,label,numeric:!['map','class'].includes(id)}));
  // Normalized regions from the capture guide. Users can redraw each region for their HUD.
  const pixels={map:[67,36,235,49],class:[511,1031,182,27],level:[457,1044,41,22],exp:[1047,1037,66,17],mesos:[1608,597,197,16],hp:[1417,958,47,18],mp:[1467,958,47,18]};
  const defaults=Object.fromEntries(Object.entries(pixels).map(([id,[x,y,w,h]])=>[id,{x:x/1919,y:y/1079,w:w/1919,h:h/1079}]));
  function region(value){
    if(!value||!['x','y','w','h'].every(key=>Number.isFinite(value[key])))throw new Error('Invalid read region.');
    const {x,y,w,h}=value;
    if(x<0||y<0||w<=0||h<=0||x+w>1.00001||y+h>1.00001)throw new Error('Keep the read region inside the screenshot.');
    return {x,y,w,h};
  }
  function cleanText(value){return String(value||'').normalize('NFKC').replace(/[|]/g,'I').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim();}
  function parse(id,text){
    let raw=String(text||'').normalize('NFKC').trim();
    if(id==='map'){
      const lines=raw.split(/[\r\n]+/).map(cleanText).filter(line=>/[A-Za-z]/.test(line)&&!/^mini\s*map$/i.test(line));
      return lines.length?lines.join(' · ').slice(0,80):null;
    }
    if(id==='class'){
      const value=cleanText(raw).replace(/Wizard\s*\(\s*Ice[\s,]*Lightning\s*\)/ig,'Wizard(Ice,Lightning)').replace(/\s*([(),])\s*/g,'$1').replace(/,/g,', ').replace(/\(/g,' (');
      return /[A-Za-z]{3}/.test(value)?value.slice(0,80):null;
    }
    if(!fields.some(field=>field.id===id))throw new Error('Unknown screenshot field.');
    if(id==='level')raw=raw.replace(/\b(?:level|lv)\.?\s*/ig,'');
    if(id==='exp'){
      raw=raw.replace(/\bexp\s*[:.]?\s*/ig,'');
      if(/%/.test(raw)&&!/[\[(]/.test(raw)&&/^\s*[\d.,]+\s*%\s*$/.test(raw))return null;
      raw=raw.split(/[\[(]/)[0];
    }
    if(id==='mesos')raw=raw.replace(/\bmesos?\b/ig,'');
    const chunks=raw.match(/\d[\d,.]*/g);
    if(!chunks||chunks.length!==1)return null;
    const token=chunks[0].replace(/[,.]+$/,'');
    // Dots and commas may separate thousands. Never convert a percentage into EXP.
    if(!/^\d+$/.test(token)&&!/^\d{1,3}(?:[,.]\d{3})+$/.test(token))return null;
    const value=Number(token.replace(/[,.]/g,''));
    if(!Number.isSafeInteger(value)||value<0||(id==='level'&&(value<1||value>100)))return null;
    return String(value);
  }
  function select(id,reads){
    const candidates=reads.map(read=>({...read,value:parse(id,read.text)})).filter(read=>read.value!==null);
    const raw=reads.map(read=>(read.label?read.label+': ':'')+read.text.trim()).filter(Boolean).join('\n');
    if(!candidates.length)return {value:null,raw,confidence:0,disagrees:false,alternatives:[]};
    // Agreement wins. A tie retains the field-specific first treatment, not OCR confidence.
    const score=value=>candidates.filter(read=>read.value===value).length;
    candidates.sort((a,b)=>score(b.value)-score(a.value));
    const best=candidates[0];
    const alternatives=[...new Set(candidates.map(read=>read.value))].filter(value=>value!==best.value);
    return {value:best.value,raw,confidence:best.confidence||0,votes:score(best.value),readCount:candidates.length,disagrees:alternatives.length>0,alternatives};
  }
  function readerFor(id,value){
    const field=fields.find(field=>field.id===id);
    if(!field)throw new Error('Unknown screenshot field.');
    if(!field.numeric)return 'general';
    const fallback=id==='exp'?'exp-font':['hp','mp'].includes(id)?'quantity-font':'general';
    // Older settings wrote "classic" even for fields that only ran text OCR.
    return ['general','exp-font','quantity-font'].includes(value)?value:fallback;
  }
  function tuning(id,value={}){
    const preset={
      map:{mode:'neutral',contrast:1.6,brightness:10,threshold:30,chroma:35,invert:true},
      class:{mode:'gray',contrast:2.5,brightness:-5,invert:true},
      level:{mode:'neutral',contrast:3,brightness:80,threshold:115,chroma:255},
      mesos:{mode:'dark',contrast:0.5,brightness:5,invert:true},
      exp:{mode:'light'},hp:{mode:'neutral'},mp:{mode:'neutral'}
    }[id];
    if(!preset)throw new Error('Unknown screenshot field.');
    const defaults={contrast:1.3,brightness:0,threshold:145,chroma:55,scale:4,invert:false,...preset};
    const number=(key,fallback,min,max)=>Number.isFinite(value[key])?Math.max(min,Math.min(max,value[key])):fallback;
    return {reader:readerFor(id,value.reader),mode:['gray','light','dark','neutral','gold'].includes(value.mode)?value.mode:defaults.mode,contrast:number('contrast',defaults.contrast,.5,3),brightness:number('brightness',defaults.brightness,-80,80),threshold:number('threshold',defaults.threshold,30,240),chroma:number('chroma',defaults.chroma,0,255),scale:Math.round(number('scale',defaults.scale,2,6)),invert:value.invert===undefined?defaults.invert:!!value.invert};
  }
  // Pure RGBA preprocessing. Input pixels are never modified or persisted.
  function processPixels(input,settings){
    const d=new Uint8ClampedArray(input.length),adjust=v=>Math.max(0,Math.min(255,(v-128)*settings.contrast+128+settings.brightness));
    for(let i=0;i<input.length;i+=4){
      if(input[i+3]===0){d[i]=d[i+1]=d[i+2]=settings.invert?0:255;d[i+3]=255;continue;}
      // Composite transparent screenshots on white before filtering.
      const alpha=input[i+3]/255,r=adjust(input[i]*alpha+255*(1-alpha)),g=adjust(input[i+1]*alpha+255*(1-alpha)),b=adjust(input[i+2]*alpha+255*(1-alpha));
      const light=.299*r+.587*g+.114*b,low=Math.min(r,g,b),high=Math.max(r,g,b);let value;
      if(settings.mode==='gray')value=settings.invert?255-light:light;
      else {const ink=settings.mode==='light'?low>=settings.threshold:settings.mode==='neutral'?low>=settings.threshold&&high-low<=settings.chroma:settings.mode==='gold'?r>=settings.threshold&&g>=settings.threshold*.45&&r>g*1.06&&g>b*1.25:light<settings.threshold;value=ink?0:255;if(settings.invert)value=255-value;}
      d[i]=d[i+1]=d[i+2]=value;d[i+3]=255;
    }
    return d;
  }
  // The Classic inventory balance sits inside a pale, neutral box. Require
  // that visual cue as well as OCR, so digits on the scenery are not a balance.
  function inventoryVisible(data){
    if(!data||data.length<16||data.length%4)return false;let pale=0;
    for(let i=0;i<data.length;i+=4){const low=Math.min(data[i],data[i+1],data[i+2]),high=Math.max(data[i],data[i+1],data[i+2]);if(data[i+3]>220&&low>=185&&high-low<45)pale++;}
    return pale/(data.length/4)>=.6;
  }
  const scaleFor=(width,height,preferred)=>Math.min(preferred,Math.sqrt(2000000/(width*height)),6000/width,6000/height);
  root.MapleOcrCore={fields,defaults,region,parse,select,readerFor,tuning,processPixels,inventoryVisible,scaleFor};
  if(typeof module!=='undefined')module.exports=root.MapleOcrCore;
})(typeof window!=='undefined'?window:globalThis);
