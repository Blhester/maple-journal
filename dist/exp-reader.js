(function(root,factory){
  const font=typeof module!=='undefined'?require('./exp-font.js'):root.MapleExpFont,api=factory(font);
  api.workerSource=()=>"const reader=("+factory.toString()+")("+JSON.stringify(font)+");self.onmessage=event=>{try{self.postMessage({result:reader.read(event.data)});}catch(error){self.postMessage({error:error.message});}};";
  root.MapleExpReader=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis,function(font){
  'use strict';
  function noMatch(reason){return {value:null,method:'classic-exp',reason,raw:'Classic EXP font: '+reason,confidence:0,disagrees:false,alternatives:[]};}
  function sample(g,x,y){
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;let value=0;
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
      const xx=ix+dx,yy=iy+dy;if(xx>=0&&xx<g.width&&yy>=0&&yy<7)value+=g.alpha[yy*g.width+xx]*(dx?fx:1-fx)*(dy?fy:1-fy);
    }return value;
  }
  // Fit the alpha silhouette, including background pixels, rather than matching
  // only white strokes. This distinguishes 6/8/9 on antialiased, scaled captures.
  function match(box,image,W,H,glyphs=font.glyphs){
    const height=box.bottom-box.top+1,scale=height/7,shift=Math.max(.5,Math.min(1,scale/2)),scores=[];
    for(const g of glyphs){
      let best={error:Infinity,digit:g.digit};
      for(let h=height-Math.max(1,scale);h<=height+Math.max(1,scale);h+=Math.max(.5,scale/2)){
        if(h<5)continue;
        for(const dw of [-.35,0,.35]){
          const w=g.width*h/7+dw*scale;if(w<1||Math.abs(w-(box.right-box.left+1))>Math.max(2,scale*1.5))continue;
          for(let dy=-shift*2;dy<=shift*2+.001;dy+=shift)for(let dx=-shift*2;dx<=shift*2+.001;dx+=shift){
            const left=box.left+dx,top=box.top+dy;let error=0,count=0;
            for(let y=Math.max(0,box.top-1);y<=Math.min(H-1,box.bottom+1);y++)for(let x=Math.max(0,box.left-1);x<=Math.min(W-1,box.right+1);x++){
              const expected=sample(g,(x+.5-left)*g.width/w-.5,(y+.5-top)*7/h-.5),delta=expected-image[y*W+x];error+=delta*delta;count++;
            }
            error/=count;if(error<best.error)best={digit:g.digit,error};
          }
        }
      }scores.push(best);
    }
    scores.sort((a,b)=>a.error-b.error);
    return scores[0].error<=.022&&scores[1].error-scores[0].error>=.006?scores[0]:null;
  }
  function read({data,width:W,height:H,format='amount',allowComplete=false}={}){
    const percentage=format==='percent';
    if(!Number.isInteger(W)||!Number.isInteger(H)||W<3||H<7||W>512||H>64||!data||data.length!==W*H*4)return noMatch('Use a tight region around the full EXP number.');
    const luminance=Array.from({length:W*H},(_,i)=>Math.min(data[i*4],data[i*4+1],data[i*4+2])*data[i*4+3]/255),sorted=[...luminance].sort((a,b)=>a-b),bg=sorted[Math.floor(sorted.length*.25)],fg=sorted[Math.floor(sorted.length*.99)];
    if(fg-bg<35)return noMatch('No clear light EXP digits were found.');
    const image=luminance.map(v=>Math.max(0,Math.min(1,(v-bg)/(fg-bg)))),cache=new Map(),markCache=new Map(),answers=[];
    for(const threshold of [.45,.6,.52,.38]){
      const mask=image.map((v,i)=>v>threshold&&Math.max(data[i*4],data[i*4+1],data[i*4+2])-Math.min(data[i*4],data[i*4+1],data[i*4+2])<70?1:0),columns=Array.from({length:W},(_,x)=>{for(let y=0;y<H;y++)if(mask[y*W+x])return true;return false;}),boxes=[];
      for(let x=0;x<W;x++){
        if(!columns[x])continue;const left=x;while(x+1<W&&columns[x+1])x++;
        let top=H,bottom=0;for(let y=0;y<H;y++)for(let xx=left;xx<=x;xx++)if(mask[y*W+xx]){top=Math.min(top,y);bottom=Math.max(bottom,y);}
        boxes.push({left,right:x,top,bottom});
      }
      const heights=boxes.filter(b=>b.bottom-b.top>=5&&(b.right-b.left+1)/(b.bottom-b.top+1)>.14&&(b.right-b.left+1)/(b.bottom-b.top+1)<1.15).map(b=>b.bottom-b.top+1).sort((a,b)=>a-b);
      if(!heights.length)continue;const height=heights[Math.floor(heights.length/2)],digitBoxes=boxes.filter(b=>Math.abs(b.bottom-b.top+1-height)<=Math.max(2,height*.2));
      if(!digitBoxes.length)continue;const top=digitBoxes.map(b=>b.top).sort((a,b)=>a-b)[Math.floor(digitBoxes.length/2)],bottom=top+height-1;
      // The green opening bracket separates EXP from its percentage. Never merge
      // the percentage's digits into the amount, even if the crop includes both.
      let cut=W,leftBoundary=-1,percentBox=null;const brackets=[];
      for(let x=0;x<W;x++){let green=0;for(let y=top;y<=Math.min(H-1,bottom);y++){const i=(y*W+x)*4,r=data[i],g=data[i+1],b=data[i+2];if(g>r*1.12&&g>b*1.3&&g>65)green++;}if(green>=height*.6){brackets.push(x);cut=Math.min(cut,x);}}
      if(percentage){
        const marks=boxes.filter(box=>{if(Math.abs(box.bottom-box.top+1-height)>Math.max(2,height*.2)||(box.right-box.left+1)<height*.8)return false;const key=[box.left,box.right,box.top,box.bottom].join(':');if(!markCache.has(key))markCache.set(key,match(box,image,W,H,[...font.glyphs,font.percent]));return markCache.get(key)?.digit==='%';});
        if(marks.length!==1)continue;percentBox=marks[0];if(percentBox.right>=W-1)continue;
        cut=percentBox.left;leftBoundary=Math.max(-1,...brackets.filter(x=>x<cut));
      }
      let text='',error=0,count=0,failed=false;const accepted=[];
      for(const box of boxes){
        if(box.left<=leftBoundary)continue;if(box.left>=cut)break;const h=box.bottom-box.top+1,separator=percentage?'.':',';
        if(h<=Math.max(3,height*.5)&&box.right-box.left+1<=Math.max(2,height*.35)&&box.top>=top+height*.6){if(text&&!text.endsWith(separator))text+=separator;else failed=true;continue;}
        if(!text&&box.left===0&&h<height*.7)continue; // partial EXP-label edge
        if(Math.abs(h-height)>Math.max(2,height*.25)){failed=true;break;}
        if(accepted.length&&box.left-accepted.at(-1).right-1>height*(text.endsWith(separator)?1.2:.68)){failed=true;break;}
        const key=[box.left,box.right,box.top,box.bottom].join(':');if(!cache.has(key))cache.set(key,match(box,image,W,H));const fit=cache.get(key);
        if(!fit){failed=true;break;}text+=fit.digit;error+=fit.error;count++;accepted.push(box);
      }
      if(percentage){
        if(failed||!/^\d{1,3}\.\d{2}$/.test(text)||Number(text)>100||Number(text)===100&&!allowComplete||accepted[0]?.left===0||percentBox.left-accepted.at(-1).right>height*.8)continue;
        answers.push({value:Number(text).toFixed(2),error:error/count,boxes:accepted});continue;
      }
      if(failed||!count||count>16||text.endsWith(',')||!/^\d+(?:,\d+)*$/.test(text))continue;
      if(text.includes(',')&&!/^\d{1,3}(?:,\d{3})+$/.test(text))continue;
      if(accepted[0].left===0||accepted.at(-1).right>=W-1)continue;
      const value=Number(text.replaceAll(',',''));if(!Number.isSafeInteger(value))continue;
      answers.push({value:String(value),error:error/count,boxes:accepted});
    }
    if(!answers.length)return noMatch(percentage?'No complete EXP percentage matched. Include both decimal digits and the % sign in the region.':'The EXP font was unclear or a digit was cut off. Adjust the region or choose General text OCR.');
    if(new Set(answers.map(a=>a.value)).size!==1)return noMatch('The EXP digit matches disagree. Review the crop or enter the number manually.');
    const best=answers.sort((a,b)=>a.error-b.error)[0];
    return {value:best.value,method:percentage?'classic-exp-percent':'classic-exp',raw:percentage?'Classic EXP percentage: '+best.value+'%':'Classic EXP font: '+best.value,fitError:best.error,confidence:0,disagrees:false,alternatives:[],boxes:best.boxes};
  }
  return {read};
});
