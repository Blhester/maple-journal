(function(root){
  'use strict';
  // These patches contain fixed UI lettering, not character values or scenery.
  // Coordinates refer to the bundled Classic screenshot in assets/ocr-example.png.
  const anchors={
    hud:{x:1015,y:1034,w:35,h:19},
    inventory:{x:1581,y:225,w:108,h:17},
    minimap:{x:7,y:7,w:62,h:15}
  };
  const referenceSize={width:1919,height:1079};
  const boxes={
    use:{x:1314,y:828,w:209,h:158},
    etc:{x:1578,y:286,w:250,h:288},
    mesos:{x:1608,y:597,w:197,h:16}
  };
  function shrink(source){
    const factor=Math.min(1,1920/source.width,1080/source.height);
    if(factor===1)return {width:source.width,height:source.height,data:source.data,factor};
    const width=Math.round(source.width*factor),height=Math.round(source.height*factor),data=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const sx=Math.min(source.width-1,Math.floor((x+.5)/factor)),sy=Math.min(source.height-1,Math.floor((y+.5)/factor));
      data.set(source.data.subarray((sy*source.width+sx)*4,(sy*source.width+sx)*4+4),(y*width+x)*4);
    }
    return {width,height,data,factor};
  }
  function samples(reference,anchor){
    const points=[];
    for(let y=1;y<anchor.h-1;y+=3)for(let x=1;x<anchor.w-1;x+=3){
      const i=((anchor.y+y)*reference.width+anchor.x+x)*4;
      points.push({x,y,r:reference.data[i],g:reference.data[i+1],b:reference.data[i+2]});
    }
    return points;
  }
  function locate(target,reference,anchor,scales){
    const points=samples(reference,anchor),byLight=[...points].sort((a,b)=>(a.r+a.g+a.b)-(b.r+b.g+b.b));
    const first=[...byLight.slice(0,6),...byLight.slice(-3)];
    let winner=null;
    for(const scale of scales){
      const w=Math.round(anchor.w*scale),h=Math.round(anchor.h*scale);if(w<8||h<5||w>target.width||h>target.height)continue;
      const coarse=scale<=1?1:Math.max(1,Math.round(scale*2));
      const score=(x,y,subset,limit)=>{
        let sum=0;
        for(const p of subset){const xx=x+Math.round(p.x*scale),yy=y+Math.round(p.y*scale),i=(yy*target.width+xx)*4;
          sum+=Math.abs(target.data[i]-p.r)+Math.abs(target.data[i+1]-p.g)+Math.abs(target.data[i+2]-p.b);
          if(sum>limit*subset.length*3)return Infinity;
        }
        return sum/(subset.length*3);
      };
      let short=[];
      const upper=anchor===anchors.minimap?Math.min(target.height-h,Math.round(target.height*.5)):target.height-h;
      const lower=anchor===anchors.hud?Math.round(target.height*.35):0;
      for(let y=lower;y<=upper;y+=coarse)for(let x=0;x<=target.width-w;x+=coarse){
        const quick=score(x,y,first,65);if(quick===Infinity)continue;
        if(short.length===50&&quick>=short[49].score)continue;
        short.push({x,y,score:quick});short.sort((a,b)=>a.score-b.score);if(short.length>50)short.pop();
      }
      for(const candidate of short){
        for(let y=Math.max(lower,candidate.y-coarse);y<=Math.min(upper,candidate.y+coarse);y++)for(let x=Math.max(0,candidate.x-coarse);x<=Math.min(target.width-w,candidate.x+coarse);x++){
          const value=score(x,y,points,40);if(!winner||value<winner.score)winner={x,y,scale,score:value};
        }
      }
      if(winner?.score<4)break;
    }
    return winner?.score<=26?{...winner,confidence:Math.max(0,1-winner.score/50)}:null;
  }
  function project(box,anchor,match,target){
    const factor=target.factor,x=(match.x+(box.x-anchor.x)*match.scale)/factor,y=(match.y+(box.y-anchor.y)*match.scale)/factor,w=box.w*match.scale/factor,h=box.h*match.scale/factor;
    if(x<0||y<0||x+w>target.width/factor||y+h>target.height/factor)return null;
    return {x:x/(target.width/factor),y:y/(target.height/factor),w:w/(target.width/factor),h:h/(target.height/factor)};
  }
  function detectPixels(source,reference,defaults){
    if(source.width<320||source.height<200||reference.width!==referenceSize.width||reference.height!==referenceSize.height)return {regions:{},anchors:{}};
    const target=shrink(source),scales=[1,.5,.75,1.25,1.5,.67,2],found={};
    for(const [id,anchor]of Object.entries(anchors)){
      found[id]=locate(target,reference,anchor,scales);
      // A 1080p game occupying part of a 4K desktop loses its small UI text
      // when the whole desktop is reduced. Retry its native pixels once.
      if(!found[id]&&target.factor<1){const native=locate(source,reference,anchor,[1]);if(native)found[id]={...native,x:native.x*target.factor,y:native.y*target.factor,scale:native.scale*target.factor};}
    }
    const regions={};
    for(const id of ['class','level','exp','hp','mp'])if(found.hud){const box={x:defaults[id].x*reference.width,y:defaults[id].y*reference.height,w:defaults[id].w*reference.width,h:defaults[id].h*reference.height};regions[id]=project(box,anchors.hud,found.hud,target);}
    if(found.minimap){const box={x:defaults.map.x*reference.width,y:defaults.map.y*reference.height,w:defaults.map.w*reference.width,h:defaults.map.h*reference.height};regions.map=project(box,anchors.minimap,found.minimap,target);}
    if(found.inventory){regions.mesos=project(boxes.mesos,anchors.inventory,found.inventory,target);regions.etc=project(boxes.etc,anchors.inventory,found.inventory,target);}
    if(found.hud)regions.use=project(boxes.use,anchors.hud,found.hud,target);
    for(const [id,box]of Object.entries(regions))if(!box)delete regions[id];
    return {regions,anchors:found};
  }
  function imagePixels(image){
    if(image.data)return image;
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    return pixels;
  }
  function detect(image,reference,defaults){return detectPixels(imagePixels(image),imagePixels(reference),defaults);}
  const api={detect,detectPixels,anchors};root.MapleRegionDetector=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
