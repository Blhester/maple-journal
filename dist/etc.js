(() => {
  'use strict';
  const $=id=>document.getElementById(id),M=MapleMath;
  const data=window.MapleEtcData,items=data.items,byId=new Map(items.map(item=>[String(item.id),item]));
  const repeatedNames=new Set(items.filter((item,index)=>items.findIndex(other=>other.name===item.name)!==index).map(item=>item.name));
  const number=new Intl.NumberFormat('en-US'),fmt=n=>number.format(n);
  let selected=null,matches=[],active=-1,getEntries,onChange;
  const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
  function icon(itemId){
    const item=byId.get(String(itemId)),img=document.createElement('img');img.className='etc-icon';img.alt='';img.width=32;img.height=32;
    if(item){img.src=item.icon;img.addEventListener('error',()=>{img.hidden=true;},{once:true});}else img.hidden=true;
    return img;
  }
  function describe(entry){return entry.label+' · '+fmt(entry.quantity)+' × '+fmt(entry.unitPrice)+' mesos each · '+(entry.kind==='loot'?'unsold estimate':'sold after ending balance')+' · '+fmt(M.ledgerValue(entry))+' mesos';}
  function notice(message){$('etc-error').textContent=message||'';$('etc-error').hidden=!message;}
  function close(){
    $('etc-dropdown').hidden=true;$('etc-search').setAttribute('aria-expanded','false');$('etc-search').removeAttribute('aria-activedescendant');active=-1;
  }
  function activate(index){
    active=index;
    for(const [i,node]of [...$('etc-options').children].entries())node.setAttribute('aria-selected',String(i===index));
    if(index>=0){const node=$('etc-options').children[index];$('etc-search').setAttribute('aria-activedescendant',node.id);node.scrollIntoView({block:'nearest'});}
  }
  function choose(item){
    selected=item;$('etc-search').value=item.name;$('etc-add').disabled=false;close();notice('');
    const card=$('etc-selected');card.hidden=false;card.replaceChildren(icon(item.id));
    const copy=document.createElement('div');copy.append(text('strong',item.name),text('small',fmt(item.vendorPrice)+' mesos each at the vendor'));card.append(copy);
    const source=text('a','View item ↗','etc-item-source');source.href=item.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';card.append(source);
    if(item.maxStack)card.append(text('span','Up to '+fmt(item.maxStack)+' / stack','etc-stack'));
  }
  function search(){
    const query=$('etc-search').value.trim().toLocaleLowerCase('en-US'),tokens=query.split(/\s+/).filter(Boolean);
    const found=items.filter(item=>tokens.every(token=>(item.name+' '+item.id).toLocaleLowerCase('en-US').includes(token)));
    if(query)found.sort((a,b)=>Number(b.name.toLocaleLowerCase('en-US').startsWith(query))-Number(a.name.toLocaleLowerCase('en-US').startsWith(query))||a.name.localeCompare(b.name));
    matches=found.slice(0,40);active=-1;
    $('etc-options').replaceChildren(...matches.map((item,i)=>{
      const row=text('li','','etc-option');row.id='etc-option-'+i;row.setAttribute('role','option');row.setAttribute('aria-selected','false');
      row.append(icon(item.id),text('span',item.name+(repeatedNames.has(item.name)?' · #'+item.id:'')),text('small',fmt(item.vendorPrice)+' mesos'));
      row.addEventListener('mousedown',event=>event.preventDefault());row.addEventListener('click',()=>{choose(item);$('etc-quantity').focus();});return row;
    }));
    $('etc-search-status').textContent=found.length===0?'No matching ETC items. Try a shorter name.':found.length>40?'Showing 40 of '+fmt(found.length)+' items. Keep typing to narrow the list.':fmt(found.length)+' matching item'+(found.length===1?'':'s')+'.';
    $('etc-dropdown').hidden=false;$('etc-search').setAttribute('aria-expanded','true');$('etc-search').removeAttribute('aria-activedescendant');
  }
  function commit(entries){M.ledgerTotals(entries);onChange(entries);notice('');}
  function render(entries){
    const list=$('etc-list');list.replaceChildren();let unsold=0,sold=0,count=0;
    for(const [index,entry]of entries.entries()){
      if(entry.source!=='etc')continue;
      count++;if(entry.kind==='loot')unsold+=M.ledgerValue(entry);else sold+=M.ledgerValue(entry);
      const li=document.createElement('li');li.className='etc-row';li.append(icon(entry.itemId));
      const copy=text('div','','etc-row-copy');copy.append(text('strong',entry.label),text('small',fmt(entry.unitPrice)+' mesos each'));li.append(copy);
      const qtyLabel=text('label','Quantity'),qty=document.createElement('input');qty.type='number';qty.min='1';qty.step='1';qty.value=entry.quantity;qty.setAttribute('aria-label',entry.label+' quantity');qtyLabel.append(qty);
      const statusLabel=text('label','Sale status'),status=document.createElement('select');status.append(new Option('Unsold estimate','loot'),new Option('Sold after balance','income'));status.value=entry.kind;status.setAttribute('aria-label',entry.label+' sale status');statusLabel.append(status);
      const update=()=>{try{const next=structuredClone(getEntries()),target=next[index];target.quantity=M.integer(qty.value,'ETC quantity');target.kind=status.value;target.value=target.quantity*target.unitPrice;commit(next);}catch(e){notice(e.message);qty.value=entry.quantity;status.value=entry.kind;}};
      qty.addEventListener('change',update);status.addEventListener('change',update);li.append(qtyLabel,statusLabel,text('strong',fmt(M.ledgerValue(entry))+' mesos','etc-row-value'));
      const remove=text('button','Remove','text-button');remove.type='button';remove.setAttribute('aria-label','Remove '+entry.label);remove.addEventListener('click',()=>{const next=structuredClone(getEntries());next.splice(index,1);commit(next);$('etc-search').focus();});li.append(remove);list.append(li);
    }
    $('etc-count').textContent=count?count+' item type'+(count===1?'':'s'):'Optional';$('etc-subtotal').hidden=count===0;
    $('etc-subtotal').replaceChildren(text('span','ETC vendor value'),text('strong',fmt(unsold+sold)+' mesos'),text('small',fmt(unsold)+' unsold estimate · '+fmt(sold)+' sold after balance'));
  }
  function reset(){selected=null;close();$('etc-search').value='';$('etc-quantity').value='1';$('etc-kind').value='loot';$('etc-selected').hidden=true;$('etc-add').disabled=true;$('etc-message').textContent='';notice('');}
  function init(options){
    ({getEntries,onChange}=options);
    $('etc-search').addEventListener('input',()=>{selected=null;$('etc-selected').hidden=true;$('etc-add').disabled=true;$('etc-message').textContent='';search();});
    $('etc-search').addEventListener('focus',search);
    $('etc-quantity').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('etc-add').click();}});
    $('etc-search').addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if($('etc-dropdown').hidden)search();if(matches.length)activate(event.key==='ArrowDown'?(active+1)%matches.length:(active<=0?matches.length:active)-1);}
      else if(event.key==='Enter'){event.preventDefault();if(!$('etc-dropdown').hidden&&matches.length){choose(matches[active>=0?active:0]);$('etc-quantity').focus();}}
      else if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Tab')close();
    });
    document.addEventListener('click',event=>{if(!$('etc-picker').contains(event.target))close();});
    $('etc-add').addEventListener('click',()=>{
      try{
        if(!selected)throw new Error('Choose an ETC item from the search results.');
        const quantity=M.integer($('etc-quantity').value,'ETC quantity');if(!quantity)throw new Error('ETC quantity must be at least 1.');
        const entries=structuredClone(getEntries()),kind=$('etc-kind').value;
        const entry=entries.find(e=>e.source==='etc'&&e.itemId===String(selected.id)&&e.kind===kind&&e.unitPrice===selected.vendorPrice);
        if(entry){entry.quantity+=quantity;entry.value=entry.quantity*entry.unitPrice;}
        else entries.push({source:'etc',itemId:String(selected.id),label:selected.name,quantity,unitPrice:selected.vendorPrice,kind,value:quantity*selected.vendorPrice});
        commit(entries);$('etc-message').textContent='Added '+fmt(quantity)+' × '+selected.name+'.';$('etc-quantity').value='1';
      }catch(e){notice(e.message);}
    });
  }
  window.MapleEtc={init,render,reset,icon,describe};
})();
