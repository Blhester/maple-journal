(() => {
  'use strict';
  const controls=new Set(),mounted=new WeakMap(),icons=new Map(MaplePotionData.items.map(item=>[item.kind+':'+item.key,item]));
  let opened=null;
  function image(type,item){
    const source=icons.get(type+':'+item.id),element=document.createElement(source?'img':'span');
    element.className='potion-item-icon';element.setAttribute('aria-hidden','true');
    if(source){element.src=source.icon;element.alt='';element.width=32;element.height=32;element.addEventListener('error',()=>{const fallback=document.createElement('span');fallback.className='potion-item-icon potion-custom-icon';fallback.textContent='?';fallback.setAttribute('aria-hidden','true');element.replaceWith(fallback);},{once:true});}
    else {element.classList.add('potion-custom-icon');element.textContent='?';}
    return element;
  }
  function content(type,item,prices){
    const fragment=document.createDocumentFragment(),label=document.createElement('span'),name=document.createElement('span');label.className='potion-item-label';name.className='potion-item-name';name.textContent=item.name;label.append(name);
    if(prices&&item.id!=='custom'){const cost=document.createElement('span');cost.className='potion-item-price';cost.textContent=item.cost.toLocaleString('en-US')+' mesos';label.append(cost);}
    fragment.append(image(type,item),label);return fragment;
  }
  function close(control){
    if(!control)return;control.list.hidden=true;control.button.setAttribute('aria-expanded','false');control.button.removeAttribute('aria-activedescendant');if(opened===control)opened=null;
  }
  function position(control){
    const box=control.button.getBoundingClientRect(),dialog=control.select.closest('dialog'),bounds=dialog?.getBoundingClientRect(),top=Math.max(8,bounds?.top+10||8),bottom=Math.min(innerHeight-8,bounds?.bottom-10||innerHeight-8),below=bottom-box.bottom-7,above=box.top-top-7;
    const upward=below<210&&above>below;control.list.classList.toggle('potion-options-up',upward);control.list.style.maxHeight=Math.max(72,Math.min(280,upward?above:below))+'px';
  }
  function highlight(control,index){
    control.active=(index+control.items.length)%control.items.length;
    for(const [i,option]of control.options.entries())option.classList.toggle('potion-option-active',i===control.active);
    control.button.setAttribute('aria-activedescendant',control.options[control.active].id);control.options[control.active].scrollIntoView({block:'nearest'});
  }
  function sync(control){
    const index=control.items.findIndex(item=>item.id===control.select.value),item=control.items[index]||control.items[0];
    control.button.replaceChildren(content(control.type,item,control.prices));const chevron=document.createElement('span');chevron.className='potion-chevron';chevron.textContent='⌄';chevron.setAttribute('aria-hidden','true');control.button.append(chevron);
    control.button.disabled=control.blocked||control.select.matches(':disabled');control.button.setAttribute('aria-label',control.label+': '+item.name+(control.prices&&item.id!=='custom'?' · '+item.cost.toLocaleString('en-US')+' mesos':''));
    for(const [i,option]of control.options.entries())option.setAttribute('aria-selected',String(i===index));
    if(control.button.disabled)close(control);
  }
  function open(control){
    if(control.blocked||control.select.matches(':disabled'))return;
    if(opened&&opened!==control)close(opened);opened=control;control.list.hidden=false;control.button.setAttribute('aria-expanded','true');position(control);highlight(control,Math.max(0,control.items.findIndex(item=>item.id===control.select.value)));
  }
  function choose(control,index){
    if(control.blocked||control.select.matches(':disabled'))return;
    const value=control.items[index].id,changed=control.select.value!==value;control.select.value=value;sync(control);close(control);control.button.focus({preventScroll:true});
    if(changed){control.select.dispatchEvent(new Event('change',{bubbles:true}));control.select.dispatchEvent(new Event('input',{bubbles:true}));}
  }
  function enhance(select,type,{prices=true}={}){
    if(mounted.has(select)){sync(mounted.get(select));return;}
    const wrap=document.createElement('div'),button=document.createElement('button'),list=document.createElement('div'),items=MapleMath.catalog[type];wrap.className='potion-picker';button.type='button';button.className='potion-picker-trigger';button.id=select.id+'-picker';button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');list.id=select.id+'-options';list.className='potion-options';list.hidden=true;list.setAttribute('role','listbox');
    const label=select.getAttribute('aria-label')||Array.from(select.labels||[]).map(label=>label.textContent.trim()).join(' ')||type.toUpperCase()+' supply';list.setAttribute('aria-label',label);button.setAttribute('aria-controls',list.id);
    const control={select,type,prices,wrap,button,list,items,label,options:[],active:0,blocked:false,wasHidden:select.hidden,oldAria:select.getAttribute('aria-hidden'),oldTab:select.getAttribute('tabindex')};
    for(const [index,item]of items.entries()){
      const option=document.createElement('div');option.id=select.id+'-option-'+index;option.className='potion-option';option.setAttribute('role','option');option.append(content(type,item,prices));
      option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('pointermove',()=>{if(opened===control)highlight(control,index);});option.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();choose(control,index);});control.options.push(option);list.append(option);
    }
    wrap.append(button,list);select.after(wrap);select.hidden=true;select.setAttribute('aria-hidden','true');select.tabIndex=-1;mounted.set(select,control);controls.add(control);sync(control);
    button.addEventListener('click',()=>opened===control?close(control):open(control));control.onChange=()=>sync(control);select.addEventListener('change',control.onChange);
    let search='',lastKey=0;
    button.addEventListener('keydown',event=>{
      if(event.key==='Tab'){close(control);return;}
      if(event.key==='Escape'){if(opened===control){event.preventDefault();event.stopPropagation();close(control);}return;}
      if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
        event.preventDefault();if(opened!==control){open(control);if(event.key==='Home')highlight(control,0);else if(event.key==='End')highlight(control,items.length-1);return;}
        if(event.key==='Enter'||event.key===' ')choose(control,control.active);else highlight(control,event.key==='Home'?0:event.key==='End'?items.length-1:control.active+(event.key==='ArrowDown'?1:-1));return;
      }
      if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
        event.preventDefault();if(opened!==control)open(control);const now=Date.now();search=now-lastKey<700?search+event.key.toLowerCase():event.key.toLowerCase();lastKey=now;let index=items.findIndex(item=>item.name.toLowerCase().startsWith(search));
        if(index<0){search=event.key.toLowerCase();index=items.findIndex(item=>item.name.toLowerCase().startsWith(search));}if(index>=0)highlight(control,index);
      }
    });
  }
  function dispose(root){for(const control of controls)if(root.contains(control.select)){close(control);controls.delete(control);mounted.delete(control.select);control.select.removeEventListener('change',control.onChange);control.wrap.remove();control.select.hidden=control.wasHidden;for(const [key,value]of [['aria-hidden',control.oldAria],['tabindex',control.oldTab]])if(value===null)control.select.removeAttribute(key);else control.select.setAttribute(key,value);}}
  function syncAll(){for(const control of controls){if(!control.select.isConnected)dispose(control.select);else sync(control);}}
  function setBusy(root,value){for(const control of controls)if(root.contains(control.select)){control.blocked=value;sync(control);}}
  document.addEventListener('pointerdown',event=>{if(opened&&!opened.wrap.contains(event.target))close(opened);});
  document.addEventListener('focusin',event=>{if(opened&&!opened.wrap.contains(event.target))close(opened);});
  document.addEventListener('scroll',()=>{if(opened)position(opened);},true);window.addEventListener('resize',()=>{if(opened)position(opened);});
  document.addEventListener('reset',()=>{if(opened)close(opened);queueMicrotask(syncAll);});
  window.MaplePotionPicker={enhance,syncAll,setBusy,dispose};
})();
