(() => {
  'use strict';
  const $=id=>document.getElementById(id),catalog=window.MapleFmData?.items||[],math=window.MapleFmMath,key='maple-journal-fm-v1',byId=new Map(catalog.map(item=>[item.id,item]));
  const format=new Intl.NumberFormat('en-US'),percent=new Intl.NumberFormat('en-US',{maximumFractionDigits:1,signDisplay:'exceptZero'});
  let selected=null,data={version:1,feePercent:3,entries:[]};
  function element(tag,content,className){const node=document.createElement(tag);if(content!==undefined)node.textContent=content;if(className)node.className=className;return node;}
  function message(value,problem=false){const target=problem?$('fm-error'):$('fm-status');target.textContent=value;target.hidden=!value;if(problem&&value)$('fm-status').textContent='';}
  function icon(item){if(!item?.icon)return element('span','✦','fm-icon-placeholder');const img=element('img');img.src=item.icon;img.alt='';img.width=img.height=34;img.loading='lazy';return img;}
  function restore(){
    try{
      const saved=JSON.parse(localStorage.getItem(key));if(!saved)return;
      if(saved.version!==1||!Array.isArray(saved.entries)||saved.entries.length>500)throw Error('Invalid FM list');
      const feePercent=math.feeRate(saved.feePercent),entries=saved.entries.map(row=>{
        if(typeof row.id!=='string'||!/^\d+$/.test(row.itemId)||typeof row.name!=='string'||row.name.length>160)throw Error('Invalid FM entry');
        const quantity=math.integer(row.quantity,'Quantity',{min:1,max:1000000}),boughtPrice=math.integer(row.boughtPrice,'Bought price'),targetSellPrice=math.integer(row.targetSellPrice,'Target sell price');
        const item=byId.get(row.itemId);
        return {id:row.id,itemId:row.itemId,name:item?.name||row.name,type:item?.type||String(row.type||''),quantity,boughtPrice,targetSellPrice,createdAt:Number.isFinite(row.createdAt)?row.createdAt:Date.now()};
      });
      math.summary(entries,feePercent);data={version:1,feePercent,entries};
    }catch{message('The saved FM list could not be read. Your current list starts empty; the training journal is unaffected.',true);}
  }
  function save(){try{localStorage.setItem(key,JSON.stringify(data));}catch{message('Browser storage is unavailable. Copy the shop list before closing this tab.',true);}}
  function matches(query){const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);if(!words.length)return [];
    return catalog.filter(item=>words.every(word=>(item.name+' '+item.type+' '+item.subtype+' '+item.id).toLowerCase().includes(word))).sort((a,b)=>{
      const aStart=a.name.toLowerCase().startsWith(words[0]),bStart=b.name.toLowerCase().startsWith(words[0]);return Number(bStart)-Number(aStart)||a.name.localeCompare(b.name);
    }).slice(0,24);
  }
  function hideSearch(){const host=$('fm-search-results');host.hidden=true;$('fm-search').setAttribute('aria-expanded','false');}
  function choose(item){selected=item;$('fm-search').value=item.name;hideSearch();const host=$('fm-selected');host.replaceChildren(icon(item),element('strong',item.name),element('span',item.type+(item.subtype?' · '+item.subtype:'')));$('fm-bought').focus();message('');}
  function showSearch(){const query=$('fm-search').value.trim(),host=$('fm-search-results');host.replaceChildren();if(!query){hideSearch();return;}
    const found=matches(query);if(!found.length)host.append(element('p','No matching MeowDB item. Try another name.'));
    for(const item of found){const button=element('button');button.type='button';button.append(icon(item),element('span',item.name),element('small',item.type+(item.subtype?' · '+item.subtype:'')));button.addEventListener('click',()=>choose(item));host.append(button);}
    host.hidden=false;$('fm-search').setAttribute('aria-expanded','true');
  }
  function labelField(textValue,value,field,row){const label=element('label',textValue),input=element('input');input.type='number';input.min=field==='quantity'?'1':'0';input.max=field==='quantity'?'1000000':'2147483647';input.step='1';input.inputMode='numeric';input.value=String(value);input.setAttribute('aria-label',textValue+' for '+row.name);
    input.addEventListener('change',()=>{try{const next=math.integer(input.value,textValue,{min:field==='quantity'?1:0,max:field==='quantity'?1000000:2147483647}),candidate={...row,[field]:next};math.summary(data.entries.map(entry=>entry.id===row.id?candidate:entry),data.feePercent);row[field]=next;save();render();message('Updated '+row.name+'.');}catch(error){input.value=String(row[field]);message(error.message,true);}});
    label.append(input);return label;
  }
  function render(){const totals=math.summary(data.entries,data.feePercent);$('fm-invested').textContent=format.format(totals.cost);$('fm-sales').textContent=format.format(totals.gross);$('fm-fee').textContent=format.format(totals.fee);$('fm-profit').textContent=(totals.profit>0?'+':'')+format.format(totals.profit);$('fm-profit').classList.toggle('negative',totals.profit<0);$('fm-return').textContent=totals.returnPercent===null?(totals.entries?'N/A return on cost':'0% return on cost'):percent.format(totals.returnPercent)+'% return on cost';$('fm-count').textContent=totals.entries+' '+(totals.entries===1?'purchase':'purchases')+' · '+format.format(totals.quantity)+' units';$('fm-empty').hidden=totals.entries>0;$('fm-copy').disabled=totals.entries===0;
    const host=$('fm-list');host.replaceChildren();for(const row of data.entries){const item=byId.get(row.itemId)||row,value=math.estimate(row,data.feePercent),card=element('article',undefined,'fm-entry'),identity=element('div',undefined,'fm-entry-item'),title=element('div'),link=element('a',row.name);link.href=`https://meowdb.com/msclassic/item-db/${row.itemId}`;link.target='_blank';link.rel='noopener noreferrer';title.append(link,element('small',row.type+' · bought '+new Date(row.createdAt).toLocaleDateString()));identity.append(icon(item),title);
      const inputs=element('div',undefined,'fm-entry-fields');inputs.append(labelField('Qty',row.quantity,'quantity',row),labelField('Bought / each',row.boughtPrice,'boughtPrice',row),labelField('Target / each',row.targetSellPrice,'targetSellPrice',row));
      const stats=element('div',undefined,'fm-entry-stats');stats.append(element('strong',(value.profit>0?'+':'')+format.format(value.profit)+' mesos',value.profit<0?'negative':''),element('span',value.returnPercent===null?'N/A net return':percent.format(value.returnPercent)+'% net return'),element('small',(value.markupPercent===null?'N/A target markup':percent.format(value.markupPercent)+'% target markup')+' · fee '+format.format(value.fee)),element('small','Break-even '+(value.breakEven===null?'N/A':format.format(value.breakEven))+' each'));
      const remove=element('button','Remove','text-button fm-remove');remove.type='button';remove.setAttribute('aria-label','Remove '+row.name+' purchase');remove.addEventListener('click',()=>{data.entries=data.entries.filter(entry=>entry.id!==row.id);save();render();message('Removed '+row.name+'.');});card.append(identity,inputs,stats,remove);host.append(card);
    }
  }
  $('fm-catalog-meta').textContent=`${format.format(catalog.length)} local items · checked ${new Date(window.MapleFmData.checkedAt).toLocaleDateString()}`;
  restore();$('fm-tax').value=String(data.feePercent);render();
  $('fm-search').addEventListener('input',()=>{selected=null;$('fm-selected').textContent='Choose an item to add.';showSearch();});$('fm-search').addEventListener('focus',showSearch);
  $('fm-search').addEventListener('keydown',event=>{if(event.key==='Escape'){hideSearch();return;}if(event.key==='ArrowDown'){const first=$('fm-search-results').querySelector('button');if(first){event.preventDefault();first.focus();}}if(event.key==='Enter'&&!selected){const first=$('fm-search-results').querySelector('button');if(first){event.preventDefault();first.click();}}});
  document.addEventListener('click',event=>{if(!event.target.closest('.fm-search-wrap'))hideSearch();});
  $('fm-form').addEventListener('submit',event=>{event.preventDefault();try{if(!selected)throw Error('Choose an item from the search results first.');if(data.entries.length>=500)throw Error('The FM list is full. Remove old purchases before adding more.');const quantity=math.integer($('fm-quantity').value,'Quantity',{min:1,max:1000000}),boughtPrice=math.integer($('fm-bought').value,'Bought price'),targetSellPrice=math.integer($('fm-target').value,'Target sell price'),row={id:(crypto.randomUUID?.()||Date.now()+'-'+Math.random()),itemId:selected.id,name:selected.name,type:selected.type,quantity,boughtPrice,targetSellPrice,createdAt:Date.now()};math.summary([...data.entries,row],data.feePercent);data.entries.push(row);save();render();message('Added '+selected.name+' to the shop list.');selected=null;$('fm-form').reset();$('fm-quantity').value='1';$('fm-selected').textContent='Choose an item to add.';hideSearch();$('fm-search').focus();}catch(error){message(error.message,true);}});
  $('fm-tax').addEventListener('change',()=>{try{const fee=math.feeRate($('fm-tax').value);math.summary(data.entries,fee);data.feePercent=fee;save();render();message('Store fee updated.');}catch(error){$('fm-tax').value=String(data.feePercent);message(error.message,true);}});
  $('fm-copy').addEventListener('click',async()=>{const lines=data.entries.map(row=>`${row.quantity} × ${row.name} — ${format.format(row.targetSellPrice)} mesos each`);try{await navigator.clipboard.writeText(lines.join('\n'));message('Shop list copied with quantities and target prices.');}catch{message('Copy was blocked by this browser. You can select the list on this page instead.',true);}});
  window.addEventListener('storage',event=>{if(event.key===key){data={version:1,feePercent:3,entries:[]};restore();$('fm-tax').value=String(data.feePercent);render();}});
})();
