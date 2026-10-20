(function(root,factory){
  'use strict';
  const font=typeof module!=='undefined'?require('./quantity-font.js'):root.MapleQuantityFont,api=factory(font);
  // A worker keeps matching responsive and cancellable, including in the single-file download.
  api.workerSource=()=>"const reader=("+factory.toString()+")("+JSON.stringify(font)+");self.onmessage=event=>{try{self.postMessage({result:reader.read(event.data)});}catch(error){self.postMessage({error:error.message});}};";
  root.MapleQuantityReader=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis,function(font){
  'use strict';
  const cache=new Map(),glyphs=font.glyphs;
  function resize(data,width,height,newWidth,newHeight){
    const output=new Float32Array(newWidth*newHeight*4);
    for(let y=0;y<newHeight;y++)for(let x=0;x<newWidth;x++){
      const sx=(x+.5)*width/newWidth-.5,sy=(y+.5)*height/newHeight-.5,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let alpha=0,r=0,g=0,b=0;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
        const xx=Math.max(0,Math.min(width-1,x0+dx)),yy=Math.max(0,Math.min(height-1,y0+dy)),i=(yy*width+xx)*4,weight=(dx?fx:1-fx)*(dy?fy:1-fy),a=data[i+3]/255;
        alpha+=a*weight;r+=data[i]*a*weight;g+=data[i+1]*a*weight;b+=data[i+2]*a*weight;
      }
      const i=(y*newWidth+x)*4;output[i]=alpha?r/alpha:0;output[i+1]=alpha?g/alpha:0;output[i+2]=alpha?b/alpha:0;output[i+3]=alpha*255;
    }
    return output;
  }
  function template(digit,width,height){
    const key=digit+':'+width+':'+height;if(cache.has(key))return cache.get(key);
    const glyph=glyphs[digit],pixels=resize(glyph.rgba,glyph.width,glyph.height,width,height),points=[];let total=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4,a=pixels[i+3]/255;if(a<.8)continue;
      const r=pixels[i]*a,g=pixels[i+1]*a,b=pixels[i+2]*a,weight=(r+g+b>300*a?1.4:1)*a,slack=(1-a)*255;
      points.push([x,y,r,r+slack,g,g+slack,b,b+slack,weight]);total+=weight;
    }
    const result={points,total};if(cache.size>600)cache.clear();cache.set(key,result);return result;
  }
  function noMatch(reason){return {value:null,method:'classic-digits',reason,raw:'Classic digit matching: no complete, clear quantity found.',confidence:0,disagrees:false,alternatives:[]};}
  function read(input){
    let {data,width:W,height:H}=input;
    if(!Number.isInteger(W)||!Number.isInteger(H)||W<3||H<8||W>512||H>256||!data||data.length!==W*H*4)return noMatch('Use a tight region containing the full count.');
    const shrink=Math.min(1,96/W,32/H);
    if(shrink<1){const nw=Math.max(3,Math.round(W*shrink)),nh=Math.max(1,Math.round(H*shrink));data=resize(data,W,H,nw,nh);W=nw;H=nh;}
    const candidates=[];
    for(let h=Math.max(8,Math.floor(H*.55));h<=H;h++)for(let digit=0;digit<10;digit++)for(let dw=-1;dw<=1;dw++){
      const expected=glyphs[digit].width*h/11,w=Math.max(3,Math.round(expected)+dw);if(w>W||w<expected*.85||w>expected*1.18)continue;
      const t=template(digit,w,h);
      for(let y=0;y<=H-h;y++)for(let x=0;x<=W-w;x++){
        let sum=0,foreground=0,outline=0,foregroundCount=0,outlineCount=0,blue=0,blueCount=0;
        for(const [xx,yy,rl,rh,gl,gh,bl,bh,weight]of t.points){
          const i=((y+yy)*W+x+xx)*4,lum=(data[i]+data[i+1]+data[i+2])/3;
          if(rl+gl+bl>450){foreground+=lum;foregroundCount++;}if(rh+gh+bh<180){outline+=lum;outlineCount++;}if(bl-rl>30){blue+=data[i+2]-data[i];blueCount++;}
          // Antialiased edges can contain any background color inside this alpha interval.
          sum+=(Math.max(0,rl-data[i],data[i]-rh)+Math.max(0,gl-data[i+1],data[i+1]-gh)+Math.max(0,bl-data[i+2],data[i+2]-bh))/765*weight;
          if(sum>.2*t.total)break;
        }
        const score=sum/t.total;
        if(score<.19&&foregroundCount>=4&&outlineCount>=4&&blueCount>=2&&foreground/foregroundCount-outline/outlineCount>=55&&blue/blueCount>=12)candidates.push({digit,x,y,w,h,score,benefit:w*(.22-score)});
      }
    }
    candidates.sort((a,b)=>a.score-b.score);
    const kept=[];
    for(const c of candidates.slice(0,1600)){
      if(kept.some(p=>p.digit===c.digit&&Math.abs(p.x-c.x)<=2&&Math.abs(p.y-c.y)<=2&&Math.abs(p.w-c.w)<=2&&Math.abs(p.h-c.h)<=2))continue;kept.push(c);
    }
    kept.sort((a,b)=>a.x-b.x);
    const chains=[];
    for(let i=0;i<kept.length;i++){
      const c=kept[i];let best={text:String(c.digit),parts:[c],benefit:c.benefit};
      for(let j=0;j<i;j++){
        const p=kept[j],prior=chains[j],gap=c.x-p.x-p.w;
        if(prior.parts.length>=8||prior.text==='0'||gap< -1||gap>Math.max(2,Math.round(c.h/8))||Math.abs(p.y+p.h-c.y-c.h)>2||Math.abs(p.h-c.h)>2)continue;
        const benefit=prior.benefit+c.benefit;if(benefit>best.benefit)best={text:prior.text+c.digit,parts:prior.parts.concat(c),benefit};
      }
      chains.push(best);
    }
    chains.sort((a,b)=>b.benefit-a.benefit);const best=chains[0];if(!best)return noMatch('The Classic quantity font was not found.');
    const width=best.parts.reduce((sum,p)=>sum+p.w,0),error=best.parts.reduce((sum,p)=>sum+p.score*p.w,0)/width;
    if(error>.145)return noMatch('The count is too blurred or differs from the Classic quantity font.');
    const first=best.parts[0],last=best.parts.at(-1),averageHeight=best.parts.reduce((sum,p)=>sum+p.h,0)/best.parts.length;
    // Compare complete words, excluding truncated prefixes and tiny fragments of a larger glyph.
    const rival=chains.find(chain=>chain.text!==best.text&&Math.abs(chain.parts[0].x-first.x)<=2&&Math.abs(chain.parts.at(-1).x+chain.parts.at(-1).w-last.x-last.w)<=2&&Math.abs(chain.parts.reduce((sum,p)=>sum+p.h,0)/chain.parts.length-averageHeight)<=2);
    if(rival&&rival.benefit>best.benefit*.91)return noMatch('Two digit sequences look too similar.');
    if((first.x===0||last.x+last.w>=W)&&error>.045)return noMatch('The region may cut off a digit. Add a little space around the full count.');
    return {value:best.text,method:'classic-digits',raw:'Classic quantity font: '+best.text,confidence:0,disagrees:false,alternatives:[],fitError:error,boxes:best.parts.map(p=>({digit:p.digit,x:p.x,y:p.y,width:p.w,height:p.h}))};
  }
  return {read};
});
