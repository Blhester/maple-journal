(function(root,factory){const api=factory();root.MapleEtcVision=api;if(typeof module==='object')module.exports=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  // Inventory art has native dimensions, unlike a hotkey icon stretched into
  // a square. Keep top/right details and mask only the lower-left counter.
  function score(data,w,h,t,scale,dx,dy,stride,aspect=1){
    const ox=(w-t.width*scale*aspect)/2+dx,oy=(h-t.height*scale)/2+dy;let sum=0,n=0;
    for(let j=0;j<t.points.length;j+=stride){const [x,y,r,g,b]=t.points[j],xx=Math.round(ox+(x+.5)*scale*aspect-.5),yy=Math.round(oy+(y+.5)*scale-.5);if(xx<1||xx>=w-1||yy<1||yy>=h-1||yy>=h*.62&&xx<w*.8)continue;const k=(yy*w+xx)*4;sum+=Math.min(110,(Math.abs(data[k]-r)+Math.abs(data[k+1]-g)+Math.abs(data[k+2]-b))/3);n++;}
    return n>=Math.max(8,t.points.length/stride*.35)?sum/n:Infinity;
  }
  function rank(data,w,h,templates,{limit=3,legacyRank=null}={}){
    const unit=Math.min(w,h)/32,candidates=[];
    for(const t of templates){let best={score:Infinity,t};for(const factor of [.8,.9,1,1.1,1.2])for(const dx of [-4,-2,0,2,4])for(const dy of [-4,-2,0,2,4]){const scale=unit*factor,value=score(data,w,h,t,scale,dx,dy,3);if(value<best.score)best={t,score:value,scale,dx,dy};}candidates.push(best);}
    candidates.sort((a,b)=>a.score-b.score);const unique=new Map();
    for(const c of candidates.slice(0,18)){let best=c.score;for(const factor of [.94,.97,1,1.03,1.06])for(const dx of [-1,0,1])for(const dy of [-1,0,1])for(const aspect of [.93,1,1.07])best=Math.min(best,score(data,w,h,c.t,c.scale*factor,c.dx+dx,c.dy+dy,1,aspect));const old=unique.get(c.t.id);if(!old||best<old.score)unique.set(c.t.id,{id:c.t.id,iconKey:c.t.iconKey||c.t.id,score:best});}
    const sorted=[...unique.values()].sort((a,b)=>a.score-b.score),best=sorted[0],gap=(sorted.find(r=>r.iconKey!==best?.iconKey)?.score??255)-(best?.score??Infinity);
    const out=sorted.slice(0,limit).map((r,i)=>({...r,confidence:Math.max(0,1-r.score/100),strong:i===0&&(r.score<=30&&gap>=6||r.score<=14&&gap>=3)}));
    // Some resized captures stretch the sprite. Accept that layout only when
    // its clear winner also closely agrees with the native-shape shortlist.
    if(out[0]&&!out[0].strong&&legacyRank){const other=legacyRank(data,w,h,templates),a=other[0],b=other.find(r=>r.iconKey!==a?.iconKey),native=sorted.find(r=>r.id===a?.id);if(native&&native.score<50&&native.score-best.score<=3&&a.score<50&&(b?.score??255)-a.score>=15){out.unshift({...native,confidence:Math.max(0,1-native.score/100),strong:true,method:'dual-layout-agreement'});return out.filter((r,i)=>i===0||r.id!==native.id).slice(0,limit);}}
    return out;
  }
  // Search for repeated bright separators around the configured grid. Require
  // several independent lines and a clear improvement; scenery is not a grid.
  function align(data,w,h,box){
    function axis(horizontal){const size=horizontal?w:h,count=horizontal?5:6,origin=horizontal?box.x:box.y,pitch=(horizontal?box.w:box.h)/count,profile=new Float64Array(size),other=horizontal?{start:box.y,end:box.y+box.h}:{start:box.x,end:box.x+box.w};
      for(let p=0;p<size;p++){let sum=0,n=0;for(let q=Math.ceil(other.start+3);q<Math.min(horizontal?h:w,other.end-3);q+=3){const x=horizontal?p:q,y=horizontal?q:p,k=(y*w+x)*4,r=data[k],g=data[k+1],b=data[k+2];if(Math.max(r,g,b)-Math.min(r,g,b)<36)sum+=(r+g+b)/3;else sum+=120;n++;}profile[p]=n?sum/n:0;}
      const peak=x=>{let best=-Infinity;for(let d=-1;d<=1;d++){const p=Math.round(x)+d;if(p>=4&&p<size-4)best=Math.max(best,profile[p]-(profile[p-4]+profile[p+4])/2);}return best;};
      function measure(o,p){const values=Array.from({length:count+1},(_,i)=>peak(o+i*p));return {score:values.reduce((a,b)=>a+b,0)/values.length,hits:values.filter(v=>v>4).length};}
      const base=measure(origin,pitch);if(base.hits>=count&&base.score>=6)return {origin,pitch};let best={origin,pitch,...base};
      // Preserve the calibrated pitch. Tiny apparent size changes accumulate
      // across rows and can move the final stacks out of their own cells.
      for(let d=-Math.min(16,pitch*.4);d<=Math.min(16,pitch*.4);d+=1){const o=origin+d;if(o<3||o+count*pitch>size-3)continue;const m=measure(o,pitch),penalty=Math.abs(d)*.1;if(m.hits>=count&&m.score-penalty>best.score)best={origin:o,pitch,...m};}
      return best.hits>=count&&best.score>=8&&best.score>base.score+4?best:{origin,pitch};
    }
    const x=axis(true),y=axis(false);return {x:x.origin,y:y.origin,w:x.pitch*5,h:y.pitch*6};
  }
  return {rank,align};
});
