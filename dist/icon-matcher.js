(function(root,factory){const api=factory();root.MapleIconMatcher=api;if(typeof module==='object')module.exports=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  // Compare colored/outlined sprite pixels; ignore shortcut labels at the top
  // and quantity digits at the bottom. Alpha edges tolerate the HUD background.
  function template(data,width,height){
    const points=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(data[i+3]>230&&Math.min(data[i],data[i+1],data[i+2])<210)points.push([x,y,data[i],data[i+1],data[i+2]]);}
    return {width,height,points:points.filter((_,i)=>i%Math.max(1,Math.floor(points.length/100))===0)};
  }
  function score(pixels,w,h,t){
    let best=Infinity;
    // Sprite art is centered in a square hotkey. Small translations accommodate
    // different HUD scales and hand-drawn region margins.
    for(const scale of (t.cell?[.94,1,1.06]:[.78,.86,.94,1.02]))for(const dx of (t.cell?[-4,-2,0,2,4]:[-2,0,2]))for(const dy of (t.cell?[-4,-2,0,2,4]:[-2,0,2])){
      const size=w*scale,ox=(w-size)/2+dx,oy=(h-size)/2+dy;let sum=0,n=0;
      for(const [x,y,r,g,b]of t.points){const xx=Math.round(ox+x*size/t.width),yy=Math.round(oy+y*size/t.height);if(xx<1||xx>=w-1||yy<h*.26||yy>=h*.72)continue;const i=(yy*w+xx)*4;sum+=(Math.abs(pixels[i]-r)+Math.abs(pixels[i+1]-g)+Math.abs(pixels[i+2]-b))/3;n++;}
      if(n>=12)best=Math.min(best,sum/n);
    }
    return best;
  }
  function rank(pixels,width,height,templates,{limit=3}={}){
    const unique=new Map();for(const t of templates){const value=score(pixels,width,height,t),old=unique.get(t.id);if(!old||value<old.score)unique.set(t.id,{id:t.id,iconKey:t.iconKey||t.id,score:value});}const ranked=[...unique.values()].filter(r=>Number.isFinite(r.score)).sort((a,b)=>a.score-b.score),matches=ranked.slice(0,limit);
    if(!matches.length)return [];
    const gap=(ranked.find(r=>r.iconKey!==matches[0].iconKey)?.score??255)-matches[0].score;
    return matches.map((r,i)=>({...r,confidence:Math.max(0,Math.min(1,1-r.score/100)),strong:i===0&&r.score<30&&gap>7}));
  }
  // Light connected components find the shortcut cell backgrounds in the lower
  // HUD, wherever the shortcut panel was moved. Large scenery regions fall out.
  function cells(data,width,height){
    const mask=new Uint8Array(width*height),out=[],queue=new Int32Array(width*height),top=Math.floor(height*.55);
    for(let y=top;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,a=Math.min(data[i],data[i+1],data[i+2]),b=Math.max(data[i],data[i+1],data[i+2]);if(a>195&&b-a<32)mask[y*width+x]=1;}
    for(let y=top;y<height;y++)for(let x=0;x<width;x++){
      const p=y*width+x;if(!mask[p])continue;let head=0,tail=1,minX=x,maxX=x,minY=y,maxY=y;queue[0]=p;mask[p]=0;
      while(head<tail){const k=queue[head++],xx=k%width,yy=Math.floor(k/width);minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);for(const q of [xx>0?k-1:-1,xx<width-1?k+1:-1,yy>top?k-width:-1,yy<height-1?k+width:-1])if(q>=0&&mask[q]){mask[q]=0;queue[tail++]=q;}}
      const w=maxX-minX+1,h=maxY-minY+1;if(w>=12&&w<=65&&h>=12&&h<=65&&w/h>.65&&w/h<1.5&&tail>w*h*.15){const size=Math.max(w,h)+2,cx=(minX+maxX)/2,cy=(minY+maxY)/2;out.push({x:Math.max(0,cx-size/2)/width,y:Math.max(0,cy-size/2)/height,w:Math.min(size,width-cx+size/2)/width,h:Math.min(size,height-cy+size/2)/height});}
    }
    // Group adjacent cells into a regular shortcut grid. Icons and quantity
    // labels can split a white background, so individual component bounds alone
    // are not a reliable full-cell crop.
    const groups=[];for(const b of out){const cx=(b.x+b.w/2)*width,cy=(b.y+b.h/2)*height;let g=groups.find(g=>g.some(p=>Math.abs(p.cx-cx)<72&&Math.abs(p.cy-cy)<72));if(!g){g=[];groups.push(g);}g.push({cx,cy,size:Math.max(b.w*width,b.h*height)});}
    const grids=[];for(const g of groups){if(g.length<5)continue;const cluster=values=>{const a=[];for(const v of values.sort((a,b)=>a-b)){const last=a.at(-1);if(last&&v-last.at(-1)<9)last.push(v);else a.push([v]);}return a.map(v=>v.reduce((a,b)=>a+b,0)/v.length);},xs=cluster(g.map(p=>p.cx)),ys=cluster(g.map(p=>p.cy));if(xs.length<2||xs.length>6||ys.length<2||ys.length>4)continue;const gaps=[...xs.slice(1).map((x,i)=>x-xs[i]),...ys.slice(1).map((y,i)=>y-ys[i])].filter(n=>n>15&&n<60).sort((a,b)=>a-b);if(!gaps.length)continue;const horizontal=xs.slice(1).map((x,i)=>x-xs[i]).sort((a,b)=>a-b),pitch=horizontal[Math.floor(horizontal.length/2)]||gaps[Math.floor(gaps.length/2)],size=pitch*.98,x0=xs[0]-size/2,y0=ys[0]-size/2+pitch*.055;for(let y=0;y<ys.length;y++)for(let x=0;x<xs.length;x++){const left=Math.max(0,x0+x*pitch),top=Math.max(0,y0+y*pitch);if(left+size<=width&&top+size<=height)grids.push({x:left/width,y:top/height,w:size/width,h:size/height});}}
    return (grids.length?grids:out).slice(0,100);
  }
  return {template,rank,cells};
});
