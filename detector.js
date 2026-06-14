(function () {
  const VERSION = 'v27-debug';

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

  function orderPoints(pts) {
    const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
    const cy = pts.reduce((s,p)=>s+p.y,0)/pts.length;
    const sorted = pts.slice().sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));
    // angle sort gives roughly TL,TR,BR,BL after rotating start to top-left
    let start = 0, best = Infinity;
    for(let i=0;i<4;i++){ const score = sorted[i].x + sorted[i].y; if(score<best){best=score; start=i;} }
    const out = [];
    for(let i=0;i<4;i++) out.push(sorted[(start+i)%4]);
    return out;
  }

  function rectPointsToArray(rect) {
    const vertices = cv.RotatedRect.points(rect);
    return vertices.map(p => ({ x: p.x, y: p.y }));
  }

  function drawPolygon(ctx, pts, color, lineWidth) {
    const p = orderPoints(pts);
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.closePath(); ctx.stroke(); ctx.restore();
  }

  function drawRect(ctx, r, color, label) {
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, ctx.canvas.width / 180);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.font = `${Math.max(10, Math.round(ctx.canvas.width / 34))}px sans-serif`;
    ctx.fillText(label, r.x + 3, Math.max(14, r.y - 4));
    ctx.restore();
  }

  function drawEllipseMark(ctx, e, color, label) {
    const rx = e.rx || e.r || 18, ry = e.ry || e.r || 18;
    const cross = Math.max(7, Math.min(ctx.canvas.width, ctx.canvas.height) / 24);
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, ctx.canvas.width / 180);
    ctx.beginPath(); ctx.ellipse(e.cx, e.cy, rx, ry, 0, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.cx-cross, e.cy); ctx.lineTo(e.cx+cross, e.cy);
    ctx.moveTo(e.cx, e.cy-cross); ctx.lineTo(e.cx, e.cy+cross); ctx.stroke();
    ctx.font = `${Math.max(10, Math.round(ctx.canvas.width / 34))}px sans-serif`;
    ctx.fillText(label, e.cx + cross + 3, e.cy + 4); ctx.restore();
  }

  function rotateCanvas180(canvas) {
    const tmp = document.createElement('canvas'); tmp.width = canvas.width; tmp.height = canvas.height;
    const t = tmp.getContext('2d'); t.translate(tmp.width, tmp.height); t.rotate(Math.PI); t.drawImage(canvas, 0, 0);
    const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(tmp,0,0);
  }

  function warpCropToCanvas(srcCanvas, cropCanvas, pts) {
    const ordered = orderPoints(pts);
    const topW = dist(ordered[0], ordered[1]);
    const bottomW = dist(ordered[3], ordered[2]);
    const leftH = dist(ordered[0], ordered[3]);
    const rightH = dist(ordered[1], ordered[2]);
    let outW = Math.round(Math.max(topW, bottomW));
    let outH = Math.round(Math.max(leftH, rightH));
    if (outW > outH) { const t = outW; outW = outH; outH = t; }
    outW = clamp(outW, 90, 900); outH = clamp(outH, 180, 1500);
    const src = cv.imread(srcCanvas);
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [ordered[0].x,ordered[0].y, ordered[1].x,ordered[1].y, ordered[2].x,ordered[2].y, ordered[3].x,ordered[3].y]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0,0, outW-1,0, outW-1,outH-1, 0,outH-1]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    cropCanvas.width = outW; cropCanvas.height = outH; cv.imshow(cropCanvas, dst);
    src.delete(); srcTri.delete(); dstTri.delete(); M.delete(); dst.delete();
  }

  function makeNormalizedGray(src) {
    const gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const bg = new cv.Mat(); cv.GaussianBlur(gray, bg, new cv.Size(0,0), 31,31, cv.BORDER_DEFAULT);
    const norm = new cv.Mat(); cv.divide(gray, bg, norm, 128); cv.normalize(norm, norm, 0, 255, cv.NORM_MINMAX); norm.convertTo(norm, cv.CV_8U);
    gray.delete(); bg.delete(); return norm;
  }

  function makeWhiteMask(src) {
    const rgb = new cv.Mat(); cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    const hsv = new cv.Mat(); cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    const mask = new cv.Mat();
    // 低飽和 + 中高亮度：黑底、灰底、米色桌面都可先抓出白色卡匣候選
    cv.inRange(hsv, new cv.Scalar(0, 0, 118), new cv.Scalar(180, 92, 255), mask);
    const k1 = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5,5));
    const k2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(13,13));
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, k1);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, k2);
    rgb.delete(); hsv.delete(); k1.delete(); k2.delete(); return mask;
  }

  function addCandidatesFromBinary(bin, imgArea, options, out, method) {
    const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i=0;i<contours.size();i++) {
      const cnt = contours.get(i);
      const rect = cv.minAreaRect(cnt);
      const rw = rect.size.width, rh = rect.size.height;
      const shortSide = Math.min(rw, rh), longSide = Math.max(rw, rh);
      const ratio = longSide / Math.max(1, shortSide);
      const rectArea = Math.max(1, rw*rh);
      const area = Math.max(1, cv.contourArea(cnt));
      const fill = Math.min(1, area / rectArea);
      const areaRatio = rectArea / imgArea;
      // 注意：edge-contour 的 contourArea 可能很小，所以面積用 rectArea，避免黑背景時 no-candidate。
      if (areaRatio >= options.minAreaRatio*0.45 && areaRatio <= 0.72 && ratio >= options.ratioMin*0.82 && ratio <= options.ratioMax*1.22 && fill > 0.045) {
        const pts = rectPointsToArray(rect);
        const centerPenalty = Math.min(1, Math.hypot(rect.center.x, rect.center.y) / 999999); // 不強迫在中心
        const score = rectArea * (0.45 + fill) * (1.25 - centerPenalty) * (method.includes('white') ? 1.25 : 1.0);
        out.push({ method, rect, pts, ratio, fill, areaRatio, rectArea, area, score });
      }
      cnt.delete();
    }
    contours.delete(); hierarchy.delete();
  }

  function collectOuterCandidates(src, options) {
    const imgArea = src.cols * src.rows;
    const all = [];

    // A. 白色物件分割：主力，黑底尤其穩
    const white = makeWhiteMask(src);
    addCandidatesFromBinary(white, imgArea, options, all, 'white-mask');

    // B. 邊緣輪廓：輔助，處理白底或桌面接近白色
    const norm = makeNormalizedGray(src);
    const blur = new cv.Mat(); cv.GaussianBlur(norm, blur, new cv.Size(5,5), 0);
    const edges = new cv.Mat(); cv.Canny(blur, edges, 28, 90);
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9,9));
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, k); cv.dilate(edges, edges, k, new cv.Point(-1,-1), 1);
    addCandidatesFromBinary(edges, imgArea, options, all, 'edge-contour');

    // C. 高亮前景：比整體背景亮的區塊
    const fg = new cv.Mat(); cv.threshold(norm, fg, 145, 255, cv.THRESH_BINARY);
    cv.morphologyEx(fg, fg, cv.MORPH_OPEN, cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5,5)));
    cv.morphologyEx(fg, fg, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(11,11)));
    addCandidatesFromBinary(fg, imgArea, options, all, 'bright-foreground');

    white.delete(); norm.delete(); blur.delete(); edges.delete(); k.delete(); fg.delete();

    // 去重
    const unique = [];
    for (const c of all.sort((a,b)=>b.score-a.score)) {
      const dup = unique.some(u => Math.hypot(u.rect.center.x-c.rect.center.x, u.rect.center.y-c.rect.center.y) < 20 && Math.abs(u.rectArea-c.rectArea)/Math.max(u.rectArea,c.rectArea) < 0.25);
      if (!dup) unique.push(c);
      if (unique.length >= 14) break;
    }
    return unique;
  }

  function findRedWindowFromCanvas(canvas) {
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    const W = canvas.width, H = canvas.height;
    const data = ctx.getImageData(0,0,W,H).data;
    const xs=[], ys=[];
    for (let y=Math.floor(H*0.08); y<Math.floor(H*0.92); y++) {
      for (let x=Math.floor(W*0.12); x<Math.floor(W*0.88); x++) {
        const idx=(y*W+x)*4; const r=data[idx], g=data[idx+1], b=data[idx+2];
        const redScore = r - Math.max(g,b)*0.74 + (r-g)*0.18 + (r-b)*0.10;
        if (r > 110 && redScore > 23 && r > g*1.04 && r > b*1.04) { xs.push(x); ys.push(y); }
      }
    }
    if (xs.length < Math.max(20, W*H*0.00025)) return null;
    xs.sort((a,b)=>a-b); ys.sort((a,b)=>a-b);
    const q = (arr,p)=>arr[Math.max(0, Math.min(arr.length-1, Math.floor(arr.length*p)))];
    const minX=q(xs,0.03), maxX=q(xs,0.97), minY=q(ys,0.03), maxY=q(ys,0.97);
    const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
    const w=clamp((maxX-minX)*4.2 + W*0.10, W*0.18, W*0.42);
    const h=clamp((maxY-minY)*2.2 + H*0.12, H*0.16, H*0.42);
    return { x:clamp(cx-w/2,0,W-1), y:clamp(cy-h/2,0,H-1), w:clamp(w,1,W), h:clamp(h,1,H), cx, cy, source:'red-line-window', count:xs.length };
  }

  function findWindowByContours(norm, W, H) {
    const blur = new cv.Mat(); cv.GaussianBlur(norm, blur, new cv.Size(5,5), 0);
    const bin = new cv.Mat(); cv.adaptiveThreshold(blur, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 4);
    const k1 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3,9));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k1);
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3,3)));
    const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const candidates=[];
    for(let i=0;i<contours.size();i++){
      const cnt=contours.get(i); const area=cv.contourArea(cnt); const br=cv.boundingRect(cnt);
      const cx=br.x+br.width/2, cy=br.y+br.height/2; const aspect=br.height/Math.max(1,br.width); const fill=area/Math.max(1,br.width*br.height);
      // 不限制上下，因為倒放時 Window 會在下半部
      if(cx>W*0.16 && cx<W*0.84 && cy>H*0.08 && cy<H*0.92 && br.width>W*0.11 && br.width<W*0.48 && br.height>H*0.11 && br.height<H*0.48 && aspect>1.15 && aspect<6.0 && fill>0.06 && fill<0.98){
        const centerScore=1-Math.min(1,Math.abs(cx-W*0.50)/(W*0.45));
        const score=br.width*br.height*(0.45+fill)*(0.45+centerScore)*Math.min(2,aspect);
        candidates.push({x:br.x,y:br.y,w:br.width,h:br.height,cx,cy,aspect,fill,source:'opencv-window-contour',score});
      }
      cnt.delete();
    }
    candidates.sort((a,b)=>b.score-a.score);
    blur.delete(); bin.delete(); k1.delete(); contours.delete(); hierarchy.delete();
    return { win:candidates[0]||null, count:candidates.length };
  }

  function makeWindowSafe(win, W, H) {
    if (!win) return null;
    const padX = Math.round(win.w * 0.03), padY = Math.round(win.h * 0.03);
    return Object.assign({}, win, { x:clamp(win.x+padX,0,W-1), y:clamp(win.y+padY,0,H-1), w:clamp(win.w-padX*2,1,W), h:clamp(win.h-padY*2,1,H) });
  }

  function findSampleByContours(norm, W, H, win) {
    const blur = new cv.Mat(); cv.GaussianBlur(norm, blur, new cv.Size(7,7), 0);
    const bin = new cv.Mat(); cv.adaptiveThreshold(blur, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 51, 3);
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9,9)));
    const contours = new cv.MatVector(); const hierarchy = new cv.Mat(); cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const candidates=[];
    for(let i=0;i<contours.size();i++){
      const cnt=contours.get(i); const area=cv.contourArea(cnt); const br=cv.boundingRect(cnt);
      const cx=br.x+br.width/2, cy=br.y+br.height/2; const wh=br.width/Math.max(1,br.height); const rectArea=br.width*br.height;
      const peri=cv.arcLength(cnt,true); const circ=peri>0?4*Math.PI*area/(peri*peri):0; const fill=area/Math.max(1,rectArea);
      if(win){ const ox=Math.max(0,Math.min(br.x+br.width,win.x+win.w)-Math.max(br.x,win.x)); const oy=Math.max(0,Math.min(br.y+br.height,win.y+win.h)-Math.max(br.y,win.y)); if(ox*oy>rectArea*0.12){cnt.delete(); continue;} }
      if(cx>W*0.10 && cx<W*0.90 && cy>H*0.08 && cy<H*0.92 && br.width>W*0.12 && br.width<W*0.62 && br.height>W*0.12 && br.height<W*0.72 && wh>0.35 && wh<2.35 && fill>0.08 && circ>0.06){
        const alignX = win ? (1-Math.min(1,Math.abs(cx-(win.x+win.w/2))/(W*0.38))) : 0.5;
        const score=rectArea*(0.4+circ)*(0.5+alignX)*(0.4+fill);
        candidates.push({cx,cy,rx:br.width/2,ry:br.height/2,r:Math.max(br.width,br.height)/2,x:br.x,y:br.y,w:br.width,h:br.height,source:'sample-contour',circ,fill,score});
      }
      cnt.delete();
    }
    candidates.sort((a,b)=>b.score-a.score);
    blur.delete(); bin.delete(); contours.delete(); hierarchy.delete();
    return {sample:candidates[0]||null, count:candidates.length};
  }

  function fallbackWindowFromGeometry(W,H) {
    return {x:Math.round(W*0.30), y:Math.round(H*0.24), w:Math.round(W*0.34), h:Math.round(H*0.32), cx:Math.round(W*0.47), cy:Math.round(H*0.40), source:'fallback-geometry'};
  }

  function fallbackSampleByWindow(W,H,win) {
    const cx = win ? (win.x+win.w/2) : W*0.50;
    const cy = win && win.cy > H*0.50 ? H*0.30 : H*0.68;
    return {cx, cy, rx:W*0.18, ry:W*0.22, r:W*0.22, source:'fallback-sample-by-window'};
  }

  function findInternalFeaturesOnCrop(cropCanvas, draw) {
    const src = cv.imread(cropCanvas); const W=src.cols, H=src.rows; const ctx=cropCanvas.getContext('2d');
    const norm = makeNormalizedGray(src);
    const wf = findWindowByContours(norm,W,H);
    const redWin = findRedWindowFromCanvas(cropCanvas);
    let win = redWin || wf.win || fallbackWindowFromGeometry(W,H);
    win = makeWindowSafe(win,W,H);
    const sf = findSampleByContours(norm,W,H,win);
    let sample = sf.sample || fallbackSampleByWindow(W,H,win);
    if(draw){ drawRect(ctx, win, 'rgba(37,99,235,0.95)', 'Window'); drawEllipseMark(ctx, sample, 'rgba(168,85,247,0.95)', 'S well'); }
    const out={window:win, sample, windowSource:win.source, sampleSource:sample.source, windowCandidates:wf.count+(redWin?1:0), sampleCandidates:sf.count};
    src.delete(); norm.delete(); return out;
  }

  function detectInternalFeatures(cropCanvas) {
    let f = findInternalFeaturesOnCrop(cropCanvas,false);
    let orientationCorrected=false;
    // 核心：只用 Window + S Well 方向判斷，不使用 C/T 線。
    if(f.window && f.sample && f.sample.cy < (f.window.y + f.window.h/2)){
      rotateCanvas180(cropCanvas); orientationCorrected=true;
      f = findInternalFeaturesOnCrop(cropCanvas,false);
    }
    const finalF = findInternalFeaturesOnCrop(cropCanvas,true);
    finalF.orientationCorrected=orientationCorrected;
    finalF.orientation=(finalF.window&&finalF.sample) ? (finalF.sample.cy > (finalF.window.y+finalF.window.h/2) ? 'window-above-sample' : 'maybe-upside-down') : 'unknown';
    return finalF;
  }

  function candidateFeatureScore(srcCanvas, cand) {
    // 候選外框使用內部 Window/S 同軸特徵加分，但不把它當唯一條件。
    const tmp=document.createElement('canvas');
    try{
      warpCropToCanvas(srcCanvas,tmp,cand.pts);
      const f=findInternalFeaturesOnCrop(tmp,false);
      if(!f.window || !f.sample) return {score:0, f};
      const wx=f.window.x+f.window.w/2, sx=f.sample.cx;
      const align = 1-Math.min(1,Math.abs(wx-sx)/(tmp.width*0.42));
      const sep = Math.abs(f.sample.cy-(f.window.y+f.window.h/2))/tmp.height;
      const sepScore = sep>0.15 ? 1 : 0.25;
      return {score: 500000*(0.25+align)*(0.4+sepScore), f};
    } catch(e){ return {score:0, f:null}; }
  }

  function detectOuterFrame(canvas, cropCanvas, options) {
    if (typeof cv === 'undefined' || !cv.Mat) return {version:VERSION,ok:false,reason:'opencv-not-ready'};
    options = Object.assign({ minAreaRatio:0.01, ratioMin:2.2, ratioMax:6.5 }, options||{});
    const ctx=canvas.getContext('2d'); const src=cv.imread(canvas); const imgArea=src.cols*src.rows;
    const rawCands=collectOuterCandidates(src, options);
    const scored=[];
    for(const c of rawCands.slice(0,8)){
      const fs=candidateFeatureScore(canvas,c);
      const ratioScore = 1 - Math.min(1, Math.abs(c.ratio-3.4)/3.4);
      c.totalScore = c.score*(0.7+ratioScore) + fs.score;
      c.featureScore=fs.score;
      scored.push(c);
    }
    scored.sort((a,b)=>b.totalScore-a.totalScore);
    const best=scored[0];

    ctx.save(); ctx.lineWidth=Math.max(3,canvas.width/250);
    for(let i=Math.min(3,scored.length-1); i>=1; i--) drawPolygon(ctx,scored[i].pts,'rgba(37,99,235,0.45)',ctx.lineWidth);
    if(best) drawPolygon(ctx,best.pts,'rgba(22,163,74,0.95)',ctx.lineWidth+1);
    ctx.restore();

    let result;
    if(best){
      let features=null;
      try{ warpCropToCanvas(canvas,cropCanvas,best.pts); features=detectInternalFeatures(cropCanvas); } catch(e){ console.error(e); }
      result={version:VERSION,ok:true,reason:best.method+'+feature-score',ratio:best.ratio,areaRatio:best.rectArea/imgArea,fill:best.fill,candidates:scored.length,rect:{cx:best.rect.center.x,cy:best.rect.center.y,w:best.rect.size.width,h:best.rect.size.height,angle:best.rect.angle},features,debug:'Candidates:'+scored.length+'<br>Method:'+best.method+'<br>FeatureScore:'+Math.round(best.featureScore||0)};
    } else {
      cropCanvas.width=1; cropCanvas.height=1; result={version:VERSION,ok:false,reason:'no-candidate',candidates:rawCands.length};
    }
    src.delete(); return result;
  }

  window.AsapOuterDetector = { detectOuterFrame, VERSION };
})();
