(function () {
  const VERSION = 'v28.4-outer-geometry-priority';

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

  function rectPointsToArray(rect)
{
    const cx = rect.center.x;
    const cy = rect.center.y;

    const w = rect.size.width;
    const h = rect.size.height;

    const angle =
        rect.angle * Math.PI / 180;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const hw = w / 2;
    const hh = h / 2;

    const pts = [
        {x:-hw,y:-hh},
        {x: hw,y:-hh},
        {x: hw,y: hh},
        {x:-hw,y: hh}
    ];

    return pts.map(p => ({
        x: cx + p.x*cosA - p.y*sinA,
        y: cy + p.x*sinA + p.y*cosA
    }));
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
    const rgb = new cv.Mat();
    const hsv = new cv.Mat();
    const mask = new cv.Mat();
    let lower = null;
    let upper = null;

    try {
      cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

      // OpenCV.js 某些版本不接受 new cv.Scalar() 給 inRange，
      // 這裡改成 Mat，避免 BindingError: Cannot pass "0,0,118,0" as a Mat。
      lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 118, 0]);
      upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 92, 255, 255]);
      cv.inRange(hsv, lower, upper, mask);

      const k1 = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5,5));
      const k2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(13,13));
      cv.morphologyEx(mask, mask, cv.MORPH_OPEN, k1);
      cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, k2);
      k1.delete();
      k2.delete();
    }
    finally {
      if (lower) lower.delete();
      if (upper) upper.delete();
      rgb.delete();
      hsv.delete();
    }

    return mask;
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
      const edgeLike = method.includes('edge');
      const minFill = edgeLike ? 0.010 : 0.045;
      const methodAreaRelax = edgeLike ? 0.30 : 0.45;
      if (areaRatio >= options.minAreaRatio*methodAreaRelax && areaRatio <= 0.72 && ratio >= options.ratioMin*0.82 && ratio <= options.ratioMax*1.22 && fill > minFill) {
        const pts = rectPointsToArray(rect);
        const centerPenalty = Math.min(1, Math.hypot(rect.center.x, rect.center.y) / 999999); // 不強迫在中心
        const edgeBonus = edgeLike ? 1.45 : 1.0;
        const whiteBonus = method.includes('white') ? 1.25 : 1.0;
        const score = rectArea * (0.45 + fill) * (1.25 - centerPenalty) * whiteBonus * edgeBonus;
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
    const blur = new cv.Mat();
    cv.GaussianBlur(norm, blur, new cv.Size(7,7), 0);

    const bin = new cv.Mat();
    cv.adaptiveThreshold(
      blur,
      bin,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      51,
      3
    );

    const kClose = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9,9));
    const kOpen = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3,3));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kClose);
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, kOpen);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const candidates = [];

    // 重要修正：S Well 不再全圖亂找。
    // 它應該在 Window 下方，且大致與 Window 中線對齊。
    const winCx = win ? (win.x + win.w / 2) : W * 0.50;
    const winCy = win ? (win.y + win.h / 2) : H * 0.38;
    const searchTop = win ? Math.max(win.y + win.h * 0.55, H * 0.38) : H * 0.45;
    const searchBottom = H * 0.93;
    const maxDx = win ? Math.max(W * 0.16, win.w * 0.95) : W * 0.20;

    const sampleDebug = [];

    for (let i=0; i<contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      const br = cv.boundingRect(cnt);
      const cx = br.x + br.width / 2;
      const cy = br.y + br.height / 2;
      const rectArea = Math.max(1, br.width * br.height);
      const wh = br.width / Math.max(1, br.height);
      const peri = cv.arcLength(cnt, true);
      const circ = peri > 0 ? 4 * Math.PI * area / (peri * peri) : 0;
      const fill = area / rectArea;
      const dx = Math.abs(cx - winCx);

      let reject = '';

      // 排除與 Window 重疊的東西，避免 C/T 線或判讀窗邊界被當成 S Well。
      if (win) {
        const ox = Math.max(0, Math.min(br.x + br.width, win.x + win.w) - Math.max(br.x, win.x));
        const oy = Math.max(0, Math.min(br.y + br.height, win.y + win.h) - Math.max(br.y, win.y));
        if (ox * oy > rectArea * 0.06) reject = 'overlap-window';
      }

      if (!reject && cy <= searchTop) reject = 'above-sample-area';
      if (!reject && cy >= searchBottom) reject = 'too-low';
      if (!reject && dx > maxDx) reject = 'not-aligned';
      if (!reject && br.width < W * 0.12) reject = 'too-narrow';
      if (!reject && br.width > W * 0.56) reject = 'too-wide';
      if (!reject && br.height < W * 0.12) reject = 'too-short';
      if (!reject && br.height > W * 0.60) reject = 'too-tall';
      if (!reject && (wh < 0.45 || wh > 1.85)) reject = 'bad-aspect';

      // 原本 circ > 0.06 太鬆，字母 S/C/T 和陰影都可能通過。
      // 這裡提高到 0.28，並搭配 fill，讓圓孔/橢圓孔優先。
      if (!reject && circ < 0.28) reject = 'low-circularity';
      if (!reject && (fill < 0.10 || fill > 0.90)) reject = 'bad-fill';

      const align = 1 - Math.min(1, dx / Math.max(1, maxDx));
      const below = 1 - Math.min(1, Math.abs(cy - H * 0.68) / (H * 0.35));
      const sizeScore = Math.min(1.5, rectArea / Math.max(1, W * W * 0.035));
      const score = rectArea * (0.60 + circ * 1.8) * (0.45 + fill) * (0.60 + align * 1.6) * (0.55 + below) * sizeScore;

      sampleDebug.push({
        x: br.x, y: br.y, w: br.width, h: br.height,
        cx, cy, circ, fill, align, score,
        reject: reject || 'PASS'
      });

      if (!reject) {
        candidates.push({
          cx, cy,
          rx: br.width / 2,
          ry: br.height / 2,
          r: Math.max(br.width, br.height) / 2,
          x: br.x,
          y: br.y,
          w: br.width,
          h: br.height,
          source: 'sample-contour-window-below',
          circ,
          fill,
          align,
          score
        });
      }

      cnt.delete();
    }

    candidates.sort((a,b)=>b.score-a.score);
    sampleDebug.sort((a,b)=>b.score-a.score);

    blur.delete();
    bin.delete();
    kClose.delete();
    kOpen.delete();
    contours.delete();
    hierarchy.delete();

    return {
      sample: candidates[0] || null,
      count: candidates.length,
      debug: sampleDebug.slice(0, 8),
      search: {top: searchTop, bottom: searchBottom, winCx, maxDx}
    };
  }

  function fallbackWindowFromGeometry(W,H) {
    return {x:Math.round(W*0.30), y:Math.round(H*0.24), w:Math.round(W*0.34), h:Math.round(H*0.32), cx:Math.round(W*0.47), cy:Math.round(H*0.40), source:'fallback-geometry'};
  }

  function fallbackSampleByWindow(W,H,win) {
    const cx = win ? (win.x+win.w/2) : W*0.50;
    const cy = win && win.cy > H*0.50 ? H*0.30 : H*0.68;
    return {cx, cy, rx:W*0.18, ry:W*0.22, r:W*0.22, source:'fallback-sample-by-window-not-detected'};
  }

  function findInternalFeaturesOnCrop(cropCanvas, draw) {
    const src = cv.imread(cropCanvas); const W=src.cols, H=src.rows; const ctx=cropCanvas.getContext('2d');
    const norm = makeNormalizedGray(src);
    const wf = findWindowByContours(norm,W,H);
    const redWin = findRedWindowFromCanvas(cropCanvas);
    let win =
    wf.win ||
    redWin ||
    fallbackWindowFromGeometry(W,H);
    win = makeWindowSafe(win,W,H);
    const sf = findSampleByContours(norm,W,H,win);
    let sample = sf.sample || fallbackSampleByWindow(W,H,win);
    if(draw){
      if (sf.search) {
        ctx.save();
        ctx.strokeStyle = 'rgba(245,158,11,0.85)';
        ctx.lineWidth = Math.max(1, cropCanvas.width / 260);
        ctx.setLineDash([6,4]);
        ctx.strokeRect(
          Math.max(0, sf.search.winCx - sf.search.maxDx),
          Math.max(0, sf.search.top),
          Math.min(W, sf.search.maxDx * 2),
          Math.max(1, sf.search.bottom - sf.search.top)
        );
        ctx.restore();
      }
      drawRect(ctx, win, 'rgba(37,99,235,0.95)', 'Window');
      drawEllipseMark(ctx, sample, 'rgba(168,85,247,0.95)', sample.source.includes('fallback') ? 'S fallback' : 'S well');
    }
    const out={
      window:win,
      sample,
      windowSource:win.source,
      sampleSource:sample.source,
      windowCandidates:wf.count+(redWin?1:0),
      sampleCandidates:sf.count,
      sampleDebug:sf.debug || [],
      sampleSearch:sf.search || null
    };
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


function outerGeometryScore(c, imgArea)
{
    const areaRatio = c.rectArea / Math.max(1, imgArea);

    // 快篩卡匣在照片中通常不會只佔 2~3%。
    // 這裡不是硬性刪除，而是讓真正完整外框優先。
    let areaScore = 0;
    if(areaRatio < 0.035)
        areaScore = 0.02;
    else if(areaRatio < 0.055)
        areaScore = 0.22;
    else if(areaRatio < 0.10)
        areaScore = 0.58;
    else if(areaRatio < 0.28)
        areaScore = 1.00;
    else if(areaRatio < 0.45)
        areaScore = 0.72;
    else
        areaScore = 0.35;

    const ratioScore =
        1 - Math.min(
            1,
            Math.abs(c.ratio - 3.6) / 2.9
        );

    const fillTarget = c.method.includes('edge') ? 0.22 : 0.50;
    const fillScore =
        1 - Math.min(
            1,
            Math.abs(c.fill - fillTarget) / Math.max(0.18, fillTarget)
        );

    const methodBonus =
        c.method.includes('edge') ? 1400 :
        c.method.includes('white') ? 900 :
        450;

    const smallPenalty =
        areaRatio < 0.050 ? 2400 : 0;

    const score =
        areaScore * 5200 +
        ratioScore * 1700 +
        fillScore * 850 +
        methodBonus -
        smallPenalty;

    return {
        score: Math.max(0, score),
        areaScore,
        ratioScore,
        fillScore,
        methodBonus,
        smallPenalty
    };
}

function candidateFeatureScore(srcCanvas, cand)
{
    const tmp =
        document.createElement('canvas');

    try
    {
        warpCropToCanvas(
            srcCanvas,
            tmp,
            cand.pts
        );

        const f =
            findInternalFeaturesOnCrop(
                tmp,
                false
            );

        let score = 0;

        const hasWindow =
            !!f.window;

        const hasSample =
            !!f.sample;

        if(hasWindow)
            score += 2200;

        const realSample =
            hasSample &&
            f.sample.source &&
            !f.sample.source.includes('fallback');

        if(realSample)
            score += 5000;
        else if(hasSample)
            score += 0;

        let align = 0;

        if(hasWindow && hasSample)
        {
            const wx =
                f.window.x +
                f.window.w / 2;

            const sx =
                f.sample.cx;

            const dx =
                Math.abs(wx - sx);

            align =
                1 -
                Math.min(
                    1,
                    dx / (tmp.width * 0.35)
                );

            // fallback 的 S Well 只是猜測，不可以靠 align 加分騙過外框。
            if(realSample)
                score += align * 900;
        }

        return {
            score,
            align,
            f
        };
    }
    catch(e)
    {
        return {
            score:0,
            align:0,
            f:null
        };
    }
}



  function detectOuterFrame(canvas, cropCanvas, options) {
    if (typeof cv === 'undefined' || !cv.Mat) return {version:VERSION,ok:false,reason:'opencv-not-ready'};
    options = Object.assign({ minAreaRatio:0.01, ratioMin:2.2, ratioMax:6.5 }, options||{});
    const ctx=canvas.getContext('2d'); const src=cv.imread(canvas); const imgArea=src.cols*src.rows;
    const rawCands=collectOuterCandidates(src, options);
    const scored=[];
    for(const c of rawCands.slice(0,8)){
      const fs=candidateFeatureScore(canvas,c);
      const geo=outerGeometryScore(c,imgArea);
      const hasRealSample = fs.f && fs.f.sample && fs.f.sample.source && !fs.f.sample.source.includes('fallback');
      const noRealSamplePenalty = hasRealSample ? 0 : 900;
      c.outerScore=geo.score;
      c.outerDetail=geo;
      c.totalScore =
        geo.score +
        fs.score -
        noRealSamplePenalty;
      c.featureScore=fs.score;
      c.featureDetail=fs.f;
      c.featureAlign=fs.align;
      c.noRealSamplePenalty=noRealSamplePenalty;
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
      

let dbg='';

dbg += '<b>Debug Summary</b><br>';
dbg += 'White Mask：已產生<br>';
dbg += 'Edge：已產生<br>';
dbg += 'Bright Foreground：已納入候選來源<br>';
dbg += 'Raw Candidates：' + rawCands.length + '<br>';
dbg += 'Scored Candidates：' + scored.length + '<br><hr>';

scored.forEach((c,i)=>
{
    const f = c.featureDetail;
    const win = f && f.window;
    const sample = f && f.sample;
    const realSample = sample && sample.source && !sample.source.includes('fallback');

    dbg +=
    `#${i+1}<br>
    Method=${c.method}<br>
    Candidate Score=${Math.round(c.totalScore)}<br>
    Outer Score=${Math.round(c.outerScore||0)}<br>
    Feature Score=${Math.round(c.featureScore||0)}<br>
    No Real S Penalty=${Math.round(c.noRealSamplePenalty||0)}<br>
    Window Score=${win ? 3000 : 0} / Source=${win ? win.source : '-'}<br>
    S Well Score=${realSample ? 5000 : (sample ? 600 : 0)} / Source=${sample ? sample.source : '-'}<br>
    Align Score=${Math.round((c.featureAlign||0)*1000)}<br>
    Ratio=${c.ratio.toFixed(2)}<br>
    Fill=${c.fill.toFixed(2)}<br>
    AreaRatio=${(c.areaRatio*100).toFixed(2)}%<br>`;

    if (f && f.sampleSearch) {
      dbg +=
      `Sample Search：top=${f.sampleSearch.top.toFixed(0)}, bottom=${f.sampleSearch.bottom.toFixed(0)}, centerX=${f.sampleSearch.winCx.toFixed(0)}, maxDx=${f.sampleSearch.maxDx.toFixed(0)}<br>`;
    }

    if (f && f.sampleDebug && f.sampleDebug.length) {
      dbg += '<b>Sample Candidates</b><br>';
      f.sampleDebug.forEach((s,j)=>{
        dbg += `${j+1}. ${s.reject} | x=${s.x}, y=${s.y}, w=${s.w}, h=${s.h}, circ=${s.circ.toFixed(2)}, fill=${s.fill.toFixed(2)}, align=${s.align.toFixed(2)}, score=${Math.round(s.score)}<br>`;
      });
    } else {
      dbg += 'Sample Candidates：無<br>';
    }

    dbg += '<hr>';
});

result={
    version:VERSION,
    ok:true,
    reason:best.method+'+feature-score',
    ratio:best.ratio,
    areaRatio:best.rectArea/imgArea,
    fill:best.fill,
    candidates:scored.length,
    rect:{
        cx:best.rect.center.x,
        cy:best.rect.center.y,
        w:best.rect.size.width,
        h:best.rect.size.height,
        angle:best.rect.angle
    },
    features,
    debug:dbg
};


    } else {
      cropCanvas.width=1; cropCanvas.height=1; result={version:VERSION,ok:false,reason:'no-candidate',candidates:rawCands.length};
    }
    src.delete(); return result;
  }

  window.AsapOuterDetector = { detectOuterFrame, VERSION };
})();
