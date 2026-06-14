(function(){
  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function rgbToHsv(r,g,b){
    r/=255;g/=255;b/=255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
    let h=0;
    if(d!==0){
      if(max===r) h=((g-b)/d)%6;
      else if(max===g) h=(b-r)/d+2;
      else h=(r-g)/d+4;
      h*=60;if(h<0)h+=360;
    }
    return {h,s:max===0?0:d/max,v:max};
  }
  function drawImageContain(img,canvas,maxW){
    const scale=Math.min(1,maxW/img.naturalWidth);
    canvas.width=Math.round(img.naturalWidth*scale);
    canvas.height=Math.round(img.naturalHeight*scale);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return scale;
  }
  function buildWhiteMask(ctx,w,h,opt){
    const img=ctx.getImageData(0,0,w,h),data=img.data;
    const mask=new Uint8Array(w*h);
    const vTh=opt.vThreshold/255;
    const sTh=opt.sThreshold/255;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        const r=data[i],g=data[i+1],b=data[i+2];
        const hsv=rgbToHsv(r,g,b);
        // 白色/米白色：低飽和 + 夠亮。允許陰影下的快篩，所以 V 不設太高。
        if(hsv.s<=sTh && hsv.v>=vTh) mask[y*w+x]=1;
      }
    }
    return mask;
  }
  function closeMask(mask,w,h,r){
    // 先膨脹再侵蝕，填補卡匣上字、孔、窗造成的破洞
    function dilate(src){
      const out=new Uint8Array(w*h);
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){
        let hit=0;
        for(let dy=-r;dy<=r&&!hit;dy++) for(let dx=-r;dx<=r;dx++){
          const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h&&src[yy*w+xx]){hit=1;break;}
        }
        out[y*w+x]=hit;
      }
      return out;
    }
    function erode(src){
      const out=new Uint8Array(w*h);
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){
        let ok=1;
        for(let dy=-r;dy<=r&&ok;dy++) for(let dx=-r;dx<=r;dx++){
          const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h||!src[yy*w+xx]){ok=0;break;}
        }
        out[y*w+x]=ok;
      }
      return out;
    }
    return erode(dilate(mask));
  }
  function findComponents(mask,w,h){
    const seen=new Uint8Array(w*h), comps=[];
    const qx=[],qy=[];
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const idx=y*w+x;
      if(!mask[idx]||seen[idx]) continue;
      let head=0,area=0,minX=x,maxX=x,minY=y,maxY=y,sumX=0,sumY=0;
      qx.length=0;qy.length=0;qx.push(x);qy.push(y);seen[idx]=1;
      while(head<qx.length){
        const cx=qx[head],cy=qy[head++];
        area++;sumX+=cx;sumY+=cy;
        if(cx<minX)minX=cx;if(cx>maxX)maxX=cx;if(cy<minY)minY=cy;if(cy>maxY)maxY=cy;
        const ns=[[1,0],[-1,0],[0,1],[0,-1]];
        for(const [dx,dy] of ns){
          const nx=cx+dx,ny=cy+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
          const ni=ny*w+nx;if(mask[ni]&&!seen[ni]){seen[ni]=1;qx.push(nx);qy.push(ny);}
        }
      }
      comps.push({area,minX,maxX,minY,maxY,cx:sumX/area,cy:sumY/area,w:maxX-minX+1,h:maxY-minY+1});
    }
    return comps;
  }
  function scoreComponent(c,imgW,imgH,opt){
    const boxArea=c.w*c.h;
    const fill=c.area/boxArea;
    const long=Math.max(c.w,c.h), short=Math.min(c.w,c.h);
    const aspect=long/short;
    const areaRatio=boxArea/(imgW*imgH);
    if(areaRatio < opt.minAreaRatio/100) return -999;
    if(aspect < 2.0 || aspect > 7.0) return -999;
    if(fill < 0.28) return -999;
    // 卡匣通常是圖中最大的低飽和白色長條，但不要求在中心
    let score=0;
    score += areaRatio*100;
    score += (1-Math.abs(aspect-3.6)/3.6)*25;
    score += fill*20;
    return score;
  }
  function detectCassette(canvas,opt){
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const w=canvas.width,h=canvas.height;
    let mask=buildWhiteMask(ctx,w,h,opt);
    mask=closeMask(mask,w,h,2);
    const comps=findComponents(mask,w,h).map(c=>({...c,score:scoreComponent(c,w,h,opt)})).filter(c=>c.score>-100);
    comps.sort((a,b)=>b.score-a.score);
    const best=comps[0]||null;
    if(!best) return {success:false,reason:'no-candidate',components:comps};
    const padX=Math.round(best.w*0.08),padY=Math.round(best.h*0.04);
    const rect={
      x:clamp(best.minX-padX,0,w-1),
      y:clamp(best.minY-padY,0,h-1),
      w:clamp(best.w+padX*2,1,w),
      h:clamp(best.h+padY*2,1,h)
    };
    if(rect.x+rect.w>w) rect.w=w-rect.x;
    if(rect.y+rect.h>h) rect.h=h-rect.y;
    return {success:true,reason:'ok',rect,best,components:comps.slice(0,5)};
  }
  function drawDetection(canvas,det){
    const ctx=canvas.getContext('2d');ctx.save();
    if(det.components){
      ctx.lineWidth=1;ctx.strokeStyle='rgba(14,165,233,.45)';
      det.components.forEach(c=>ctx.strokeRect(c.minX,c.minY,c.w,c.h));
    }
    if(det.success){
      const r=det.rect;ctx.lineWidth=Math.max(3,canvas.width/260);ctx.strokeStyle='rgba(22,163,74,.95)';ctx.strokeRect(r.x,r.y,r.w,r.h);
      ctx.fillStyle='rgba(22,163,74,.95)';ctx.font='bold 16px sans-serif';ctx.fillText('Cassette',r.x+4,Math.max(18,r.y-6));
    }
    ctx.restore();
  }
  function cropToCanvas(srcCanvas,cropCanvas,rect){
    cropCanvas.width=rect.w;cropCanvas.height=rect.h;
    const cctx=cropCanvas.getContext('2d');
    cctx.clearRect(0,0,cropCanvas.width,cropCanvas.height);
    cctx.drawImage(srcCanvas,rect.x,rect.y,rect.w,rect.h,0,0,rect.w,rect.h);
  }
  window.AsapOuterDetector={drawImageContain,detectCassette,drawDetection,cropToCanvas};
})();
