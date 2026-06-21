(function () {
  const VERSION = 'v31.1-ct-narrow-peak-filter';

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
    const retrieveMode = method.includes('edge') ? cv.RETR_LIST : cv.RETR_EXTERNAL;
    cv.findContours(bin, contours, hierarchy, retrieveMode, cv.CHAIN_APPROX_SIMPLE);
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
    const blur = new cv.Mat();
    cv.GaussianBlur(norm, blur, new cv.Size(5,5), 0);

    const bin = new cv.Mat();
    cv.adaptiveThreshold(
      blur,
      bin,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      31,
      4
    );

    const k1 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3,9));
    const k2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3,3));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k1);
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, k2);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const candidates = [];
    const debug = [];

    for(let i=0;i<contours.size();i++){
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      const br = cv.boundingRect(cnt);
      const cx = br.x + br.width / 2;
      const cy = br.y + br.height / 2;
      const aspect = br.height / Math.max(1, br.width);
      const fill = area / Math.max(1, br.width * br.height);
      const centerScore = 1 - Math.min(1, Math.abs(cx - W * 0.50) / (W * 0.45));

      let reject = '';

      // v30.0：外框已經裁正後，Window/試紙區應該位於卡匣中線附近，且是細長直向區域。
      if (!reject && cx < W * 0.16) reject = 'too-left';
      if (!reject && cx > W * 0.84) reject = 'too-right';
      if (!reject && cy < H * 0.08) reject = 'too-high';
      if (!reject && cy > H * 0.92) reject = 'too-low';
      if (!reject && br.width < W * 0.10) reject = 'too-narrow';
      if (!reject && br.width > W * 0.52) reject = 'too-wide';
      if (!reject && br.height < H * 0.10) reject = 'too-short';
      if (!reject && br.height > H * 0.58) reject = 'too-tall';
      if (!reject && (aspect < 1.15 || aspect > 7.5)) reject = 'bad-aspect';
      if (!reject && (fill < 0.035 || fill > 0.985)) reject = 'bad-fill';

      const score = br.width * br.height * (0.45 + fill) * (0.45 + centerScore) * Math.min(2.2, aspect);

      debug.push({
        x: br.x, y: br.y, w: br.width, h: br.height,
        cx, cy, aspect, fill, centerScore, score,
        reject: reject || 'PASS'
      });

      if (!reject) {
        candidates.push({
          x: br.x, y: br.y, w: br.width, h: br.height,
          cx, cy, aspect, fill,
          source: 'opencv-window-contour',
          score
        });
      }

      cnt.delete();
    }

    candidates.sort((a,b)=>b.score-a.score);
    debug.sort((a,b)=>b.score-a.score);

    blur.delete();
    bin.delete();
    k1.delete();
    k2.delete();
    contours.delete();
    hierarchy.delete();

    return {
      win: candidates[0] || null,
      count: candidates.length,
      debug: debug.slice(0, 10)
    };
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

  function fallbackWindowFromGeometry(W,H, orientation) {
    // v30.3：Window 是內部小試紙槽，不是紅線外推的大框。
    // normal：Window 在中上段；inverted：Window 在中下段。
    const w = Math.round(W * 0.21);
    const h = Math.round(H * 0.30);
    const cx = Math.round(W * 0.50);
    const cy = orientation === 'inverted' ? Math.round(H * 0.61) : Math.round(H * 0.39);
    return {
      x: clamp(cx - w/2, 0, W-1),
      y: clamp(cy - h/2, 0, H-1),
      w: clamp(w, 1, W),
      h: clamp(h, 1, H),
      cx, cy,
      source:'fallback-slot-window-ratio'
    };
  }

  function fallbackSampleByWindow(W,H,win, orientation) {
    const cx = win ? (win.x+win.w/2) : W*0.50;
    // v30.3：S Well 往下，避免壓到 Window；反向時則在上方對稱位置。
    const cy = orientation === 'inverted' ? H*0.32 : H*0.69;
    return {cx, cy, rx:W*0.17, ry:W*0.20, r:W*0.20, source:'fallback-sample-ratio-not-detected'};
  }



  // v30.8：三等分方向判斷。
  // 不追求精準圈出 S 洞，只比較外框 ROI 上三分之一與下三分之一，
  // 哪一段比較有 S 洞的「中央凹槽 / 橢圓邊緣 / 局部暗部」特徵，就用來決定方向。
  function scoreThirdSampleZone(cropCanvas, box, W, H) {
    const ctx = cropCanvas.getContext('2d', {willReadFrequently:true});
    const data = ctx.getImageData(0, 0, W, H).data;

    // 只看中間區域，降低左右文字、下方橫向溝槽、桌面陰影的干擾。
    const x0 = clamp(Math.floor(Math.max(box.x, W * 0.25)), 0, W - 1);
    const x1 = clamp(Math.ceil(Math.min(box.x + box.w, W * 0.75)), 0, W);
    const y0 = clamp(Math.floor(box.y), 0, H - 1);
    const y1 = clamp(Math.ceil(box.y + box.h), 0, H);

    const lumAt = (x,y) => {
      const i = (y * W + x) * 4;
      return 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
    };

    let n = 0, sum = 0, sum2 = 0;
    for (let y = y0 + 2; y < y1 - 2; y++) {
      for (let x = x0 + 2; x < x1 - 2; x++) {
        const yy = lumAt(x,y);
        sum += yy; sum2 += yy * yy; n++;
      }
    }

    const mean = sum / Math.max(1,n);
    const std = Math.sqrt(Math.max(0, sum2 / Math.max(1,n) - mean * mean));

    let weightedEdge = 0;
    let weightedDark = 0;
    let weightedVertical = 0;
    let weightedHorizontal = 0;
    let weightSum = 0;
    const rowEdge = new Array(Math.max(1, y1 - y0)).fill(0);

    for (let y = y0 + 3; y < y1 - 3; y++) {
      for (let x = x0 + 3; x < x1 - 3; x++) {
        const c = lumAt(x,y);
        const gx = Math.abs(lumAt(x+2,y) - lumAt(x-2,y));
        const gy = Math.abs(lumAt(x,y+2) - lumAt(x,y-2));
        const edge = gx + gy;

        // S 洞通常靠近卡匣中線；越靠中心權重越高。
        const wx = Math.max(0, 1 - Math.abs(x - W * 0.50) / Math.max(1, W * 0.25));
        const wy = Math.max(0.35, 1 - Math.abs(y - box.cy) / Math.max(1, box.h * 0.62));
        const w = wx * wy;

        weightSum += w;
        if (edge > 24) {
          weightedEdge += edge * w;
          rowEdge[y - y0] += w;
        }
        if (c < mean - 8 || c < 150) weightedDark += w;
        if (gx > 16) weightedVertical += w;
        if (gy > 16) weightedHorizontal += w;
      }
    }

    const edgeRatio = weightedEdge / Math.max(1, weightSum * 80);
    const darkRatio = weightedDark / Math.max(1, weightSum);
    const verticalRatio = weightedVertical / Math.max(1, weightSum);
    const horizontalRatio = weightedHorizontal / Math.max(1, weightSum);

    // S 洞是凹槽/橢圓，通常同時有 vertical 與 horizontal 邊緣；
    // 單純底部橫線會 horizontal 高但 vertical 不足，所以用 balancedEdge 抑制。
    const balancedEdge = Math.min(verticalRatio, horizontalRatio) * 2.0 + Math.min(edgeRatio, 1.6);

    // 懲罰「很多橫線集中在少數 row」的情況，避免底部溝槽誤判為 S 洞。
    const maxRowEdge = Math.max(...rowEdge);
    const rowPenalty = Math.min(1800, maxRowEdge * 140);

    const rawScore =
      std * 48 +
      darkRatio * 3600 +
      balancedEdge * 3100 +
      verticalRatio * 1700 +
      horizontalRatio * 800 -
      rowPenalty;

    const score = Math.max(0, rawScore);

    return {
      score, mean, std, darkRatio, edgeRatio, verticalRatio, horizontalRatio,
      balancedEdge, rowPenalty, box, x0, x1, y0, y1
    };
  }

  function analyzeThirdDirection(cropCanvas, W, H) {
    const topBox = makeRatioBox(W, H, 0.12, 0.00, 0.88, 0.34);
    const bottomBox = makeRatioBox(W, H, 0.12, 0.66, 0.88, 1.00);
    const top = scoreThirdSampleZone(cropCanvas, topBox, W, H);
    const bottom = scoreThirdSampleZone(cropCanvas, bottomBox, W, H);

    const topScore = top.score;
    const bottomScore = bottom.score;
    const diff = Math.abs(topScore - bottomScore);
    const ratio = Math.max(topScore, bottomScore) / Math.max(1, Math.min(topScore, bottomScore));

    let direction = 'unknown';
    let rotate180 = false;

    // 不需要非常準，只要上下分數有明顯差距就決定方向。
    if (topScore > bottomScore * 1.08 && diff > 450) {
      direction = 'inverted';
      rotate180 = true;
    } else if (bottomScore > topScore * 1.08 && diff > 450) {
      direction = 'normal';
      rotate180 = false;
    } else {
      // 差距不大時仍選高分者，但標記 low-confidence。
      direction = topScore > bottomScore ? 'inverted-low-confidence' : 'normal-low-confidence';
      rotate180 = topScore > bottomScore;
    }

    const chosenBox = rotate180 ? topBox : bottomBox;
    const chosenScore = rotate180 ? top : bottom;

    return {
      top, bottom, topScore, bottomScore, diff, ratio, direction, rotate180, chosenBox, chosenScore
    };
  }

  function fixedSampleFromBox(box, W, H, source, zoneScore) {
    return {
      cx: box.cx,
      cy: box.cy,
      rx: Math.max(8, W * 0.17),
      ry: Math.max(8, W * 0.20),
      r: Math.max(8, W * 0.20),
      x: box.cx - W * 0.17,
      y: box.cy - W * 0.20,
      w: W * 0.34,
      h: W * 0.40,
      source,
      circ: 0.70,
      fill: 0.50,
      align: 1.00,
      score: zoneScore ? zoneScore.score : 0,
      zoneScore
    };
  }

  function drawRoiSearchBox(ctx, box, label, color) {
    if (!box) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, ctx.canvas.width / 260);
    ctx.setLineDash([6,4]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.setLineDash([]);
    ctx.font = `${Math.max(10, Math.round(ctx.canvas.width / 38))}px sans-serif`;
    ctx.fillText(label, box.x + 3, Math.max(14, box.y - 4));
    ctx.restore();
  }

  function makeRatioBox(W, H, x0, y0, x1, y1) {
    return {
      x: Math.round(W * x0),
      y: Math.round(H * y0),
      w: Math.round(W * (x1 - x0)),
      h: Math.round(H * (y1 - y0)),
      cx: W * (x0 + x1) / 2,
      cy: H * (y0 + y1) / 2
    };
  }

  function insideBox(cx, cy, box) {
    return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
  }

  function overlapArea(a, b) {
    if (!a || !b) return 0;
    const ax2 = a.x + a.w;
    const ay2 = a.y + a.h;
    const bx2 = b.x + b.w;
    const by2 = b.y + b.h;
    const ox = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
    const oy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
    return ox * oy;
  }

  function findRedWindowInBox(canvas, box, W, H) {
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    const data = ctx.getImageData(0, 0, W, H).data;
    const xs = [];
    const ys = [];
    const x0 = clamp(Math.floor(box.x), 0, W - 1);
    const x1 = clamp(Math.ceil(box.x + box.w), 0, W);
    const y0 = clamp(Math.floor(box.y), 0, H - 1);
    const y1 = clamp(Math.ceil(box.y + box.h), 0, H);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * W + x) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        const redScore = r - Math.max(g,b)*0.72 + (r-g)*0.18 + (r-b)*0.10;
        if (r > 105 && redScore > 20 && r > g*1.03 && r > b*1.03) {
          xs.push(x); ys.push(y);
        }
      }
    }

    const minCount = Math.max(8, W * H * 0.000035);
    if (xs.length < minCount) return null;

    xs.sort((a,b)=>a-b); ys.sort((a,b)=>a-b);
    const q = (arr,p)=>arr[Math.max(0, Math.min(arr.length-1, Math.floor(arr.length*p)))];
    const minX = q(xs, 0.04), maxX = q(xs, 0.96);
    const minY = q(ys, 0.04), maxY = q(ys, 0.96);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // v30.2：這裡抓「小 Window/試紙區」，不要再把整個紅線區放太大。
    const w = clamp((maxX - minX) * 2.4 + W * 0.11, W * 0.16, W * 0.34);
    const h = clamp((maxY - minY) * 2.8 + H * 0.08, H * 0.16, H * 0.36);

    return {
      x: clamp(cx - w/2, 0, W - 1),
      y: clamp(cy - h/2, 0, H - 1),
      w: clamp(w, 1, W),
      h: clamp(h, 1, H),
      cx, cy,
      source: 'red-line-window-ratio-roi',
      count: xs.length,
      redBox: {x:minX, y:minY, w:maxX-minX, h:maxY-minY}
    };
  }

  function findWindowByRatioBox(norm, W, H, box) {
    const blur = new cv.Mat();
    const bin = new cv.Mat();
    const k1 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3,9));
    const k2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3,3));
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const candidates = [];
    const debug = [];

    try {
      cv.GaussianBlur(norm, blur, new cv.Size(5,5), 0);
      cv.adaptiveThreshold(blur, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 4);
      cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k1);
      cv.morphologyEx(bin, bin, cv.MORPH_OPEN, k2);
      cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      for (let i=0; i<contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        const br = cv.boundingRect(cnt);
        const cx = br.x + br.width / 2;
        const cy = br.y + br.height / 2;
        const aspect = br.height / Math.max(1, br.width);
        const fill = area / Math.max(1, br.width * br.height);
        const centerDx = Math.abs(cx - box.cx) / Math.max(1, box.w/2);
        const centerDy = Math.abs(cy - box.cy) / Math.max(1, box.h/2);
        const centerScore = 1 - Math.min(1, Math.hypot(centerDx, centerDy) / 1.35);

        let reject = '';
        if (!insideBox(cx, cy, box)) reject = 'outside-window-template';
        if (!reject && br.width < W * 0.13) reject = 'too-narrow';
        if (!reject && br.width > W * 0.30) reject = 'too-wide';
        if (!reject && br.height < H * 0.18) reject = 'too-short';
        if (!reject && br.height > H * 0.40) reject = 'too-tall';
        if (!reject && (aspect < 2.20 || aspect > 8.80)) reject = 'bad-aspect';
        if (!reject && (fill < 0.020 || fill > 0.92)) reject = 'bad-fill';

        const idealW = W * 0.21;
        const idealH = H * 0.29;
        const sizeScore = 1 - Math.min(1, (Math.abs(br.width-idealW)/idealW + Math.abs(br.height-idealH)/idealH) / 2.2);
        const score = br.width * br.height * (0.35 + fill) * (0.50 + centerScore) * (0.50 + sizeScore) * Math.min(2.4, aspect);

        const item = {x:br.x,y:br.y,w:br.width,h:br.height,cx,cy,aspect,fill,centerScore,sizeScore,score,reject:reject||'PASS'};
        debug.push(item);
        if (!reject) candidates.push(Object.assign({}, item, {source:'opencv-window-ratio-roi'}));
        cnt.delete();
      }
    }
    finally {
      blur.delete(); bin.delete(); k1.delete(); k2.delete(); contours.delete(); hierarchy.delete();
    }

    candidates.sort((a,b)=>b.score-a.score);
    debug.sort((a,b)=>b.score-a.score);
    return {win:candidates[0] || null, count:candidates.length, debug:debug.slice(0,10), box};
  }

  function findSampleByRatioBox(norm, W, H, box, win) {
    const blur = new cv.Mat();
    const bin = new cv.Mat();
    const kClose = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9,9));
    const kOpen = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3,3));
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const candidates = [];
    const debug = [];
    const winCx = win ? win.x + win.w/2 : box.cx;

    try {
      cv.GaussianBlur(norm, blur, new cv.Size(7,7), 0);
      cv.adaptiveThreshold(blur, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 51, 3);
      cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kClose);
      cv.morphologyEx(bin, bin, cv.MORPH_OPEN, kOpen);
      cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

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
        const align = 1 - Math.min(1, dx / Math.max(1, W * 0.28));
        const centerDx = Math.abs(cx - box.cx) / Math.max(1, box.w/2);
        const centerDy = Math.abs(cy - box.cy) / Math.max(1, box.h/2);
        const centerScore = 1 - Math.min(1, Math.hypot(centerDx, centerDy) / 1.25);
        const r = {x:br.x,y:br.y,w:br.width,h:br.height};

        let reject = '';
        if (!insideBox(cx, cy, box)) reject = 'outside-s-template';
        if (!reject && win && overlapArea(r, win) > rectArea * 0.05) reject = 'overlap-window';
        if (!reject && br.width < W * 0.16) reject = 'too-narrow';
        if (!reject && br.width > W * 0.58) reject = 'too-wide';
        if (!reject && br.height < W * 0.16) reject = 'too-short';
        if (!reject && br.height > W * 0.68) reject = 'too-tall';
        if (!reject && (wh < 0.42 || wh > 1.95)) reject = 'bad-aspect';
        if (!reject && circ < 0.20) reject = 'low-circularity';
        if (!reject && (fill < 0.08 || fill > 0.92)) reject = 'bad-fill';

        const ideal = W * 0.32;
        const sizeScore = 1 - Math.min(1, (Math.abs(br.width-ideal)/ideal + Math.abs(br.height-ideal*1.12)/(ideal*1.12)) / 2.0);
        const score = rectArea * (0.55 + circ * 1.8) * (0.40 + fill) * (0.65 + align * 1.6) * (0.55 + centerScore) * (0.55 + sizeScore);

        const item = {x:br.x,y:br.y,w:br.width,h:br.height,cx,cy,circ,fill,align,centerScore,sizeScore,score,reject:reject||'PASS'};
        debug.push(item);
        if (!reject) {
          candidates.push({cx,cy,rx:br.width/2,ry:br.height/2,r:Math.max(br.width,br.height)/2,x:br.x,y:br.y,w:br.width,h:br.height,source:'sample-contour-ratio-roi',circ,fill,align,centerScore,score});
        }
        cnt.delete();
      }
    }
    finally {
      blur.delete(); bin.delete(); kClose.delete(); kOpen.delete(); contours.delete(); hierarchy.delete();
    }

    candidates.sort((a,b)=>b.score-a.score);
    debug.sort((a,b)=>b.score-a.score);
    return {sample:candidates[0] || null, count:candidates.length, debug:debug.slice(0,10), search:{top:box.y,bottom:box.y+box.h,winCx,maxDx:W*0.28, box}};
  }

  function templateScore(name, win, sample, W, H) {
    const hasWin = !!win;
    const hasSample = !!sample && sample.source && !sample.source.includes('fallback');
    let score = 0;
    let alignScore = 0;
    let gapScore = 0;
    let relationOk = false;
    let yGap = 0;

    if (hasWin) score += win.source && win.source.includes('red-line') ? 5200 : 3400;
    if (hasSample) score += 5200;

    if (hasWin && hasSample) {
      const wx = win.x + win.w/2;
      const wy = win.y + win.h/2;
      const sx = sample.cx;
      const sy = sample.cy;
      alignScore = 1 - Math.min(1, Math.abs(wx - sx) / Math.max(1, W * 0.28));
      score += alignScore * 2300;

      if (name === 'normal') {
        yGap = sample.cy - (win.y + win.h);
        relationOk = sample.cy > wy;
      } else {
        yGap = win.y - (sample.cy + sample.ry);
        relationOk = win.y + win.h/2 > sample.cy;
      }

      const minGap = H * 0.035;
      const maxGap = H * 0.23;
      if (relationOk && yGap > minGap && yGap < maxGap) {
        gapScore = 1 - Math.min(1, Math.abs(yGap - H*0.10) / (H*0.16));
        score += 2600 + gapScore * 1000;
      } else if (relationOk) {
        score += 600;
      } else {
        score -= 4200;
      }
    }

    return {score, hasWin, hasSample, alignScore, gapScore, relationOk, yGap};
  }

  function makeFixedInternalByDirection(cropCanvas, W, H, directionAnalysis) {
    const isInverted = !!directionAnalysis.rotate180;
    const name = isInverted ? 'inverted' : 'normal';

    // 注意：這裡是在「尚未旋轉前」的位置。若 inverted，S 洞在上、Window 在下。
    const windowBox = isInverted
      ? makeRatioBox(W,H,0.20,0.42,0.72,0.80)
      : makeRatioBox(W,H,0.20,0.20,0.72,0.58);

    const sampleBox = directionAnalysis.chosenBox;

    let win = fallbackWindowFromGeometry(W, H, name);
    if (win) {
      win.source = 'fixed-ratio-window';
      win = makeWindowSafe(win, W, H);
    }

    const rw = findRedWindowInBox(cropCanvas, windowBox, W, H);
    const sample = fixedSampleFromBox(sampleBox, W, H, 'sample-third-score-confirmed', directionAnalysis.chosenScore);

    const wf = {
      count: 1,
      debug: [{
        x:Math.round(windowBox.x), y:Math.round(windowBox.y), w:Math.round(windowBox.w), h:Math.round(windowBox.h),
        aspect:windowBox.h/Math.max(1,windowBox.w), fill:1, centerScore:1, score:0, reject:'fixed-ratio-window'
      }]
    };

    const sf = {
      count: 1,
      debug: [{
        x:Math.round(sampleBox.x), y:Math.round(sampleBox.y), w:Math.round(sampleBox.w), h:Math.round(sampleBox.h),
        circ:0.70, fill:0.50, align:1.00, score:Math.round(directionAnalysis.chosenScore.score),
        reject:'PASS-third-s-zone'
      }],
      search:{
        top:sampleBox.y, bottom:sampleBox.y+sampleBox.h, winCx:sampleBox.cx, maxDx:sampleBox.w/2,
        box:sampleBox, zoneScore:directionAnalysis.chosenScore
      }
    };

    const ts = templateScore(name, win, sample, W, H);
    ts.score += Math.min(6200, directionAnalysis.chosenScore.score * 1.15);
    ts.thirdDirection = directionAnalysis;
    if (rw) {
      ts.score += 1600;
      ts.hasRedWindow = true;
    } else {
      ts.hasRedWindow = false;
    }

    return {
      name,
      window: win,
      sample,
      windowSource: win ? win.source : '-',
      sampleSource: sample ? sample.source : '-',
      windowCandidates: wf.count + (rw ? 1 : 0),
      sampleCandidates: sf.count,
      windowDebug: wf.debug || [],
      redWindow: rw || null,
      sampleDebug: sf.debug || [],
      sampleSearch: sf.search || null,
      windowSearchBox: windowBox,
      sampleSearchBox: sampleBox,
      templateScore: ts,
      directionAnalysis
    };
  }


  function median(arr) {
    if (!arr || !arr.length) return 0;
    const a = arr.slice().sort((x,y)=>x-y);
    const m = Math.floor(a.length/2);
    return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
  }

  function meanStd(arr) {
    if (!arr || !arr.length) return {mean:0,std:0};
    const mean = arr.reduce((s,v)=>s+v,0) / arr.length;
    const varv = arr.reduce((s,v)=>s+(v-mean)*(v-mean),0) / arr.length;
    return {mean, std:Math.sqrt(varv)};
  }

  function smoothProfile(profile, radius) {
    const out = [];
    for (let i=0; i<profile.length; i++) {
      let sum = 0, n = 0;
      for (let j=i-radius; j<=i+radius; j++) {
        if (j>=0 && j<profile.length) { sum += profile[j]; n++; }
      }
      out.push(n ? sum/n : profile[i]);
    }
    return out;
  }

  function maxInRange(profile, y0, y1) {
    y0 = Math.max(0, Math.floor(y0));
    y1 = Math.min(profile.length-1, Math.ceil(y1));
    let bestY = y0;
    let best = -Infinity;
    for (let y=y0; y<=y1; y++) {
      if (profile[y] > best) { best = profile[y]; bestY = y; }
    }
    return {y:bestY, score:Math.max(0,best)};
  }

  function qualifyPeak(profile, peak, threshold, range, h, label) {
    const score = Math.max(0, peak.score || 0);
    const y = Math.max(0, Math.min(profile.length - 1, peak.y || 0));
    const floor = Math.max(threshold * 0.55, score * 0.45, 1.2);

    let left = y;
    while (left > range.start && profile[left - 1] >= floor) left--;

    let right = y;
    while (right < range.end && right < profile.length - 1 && profile[right + 1] >= floor) right++;

    const width = Math.max(1, right - left + 1);
    const leftBaseY = Math.max(range.start, left - Math.max(3, Math.round(h * 0.018)));
    const rightBaseY = Math.min(range.end, right + Math.max(3, Math.round(h * 0.018)));
    const leftBase = profile[leftBaseY] || 0;
    const rightBase = profile[rightBaseY] || 0;
    const sideBase = Math.max(leftBase, rightBase);
    const drop = score - sideBase;
    const sharpness = score / Math.max(1, width);

    // 真正 C/T 線是薄線，試紙邊緣通常是寬峰或平台。
    const maxWidth = Math.max(4, Math.round(h * 0.055));
    const softMaxWidth = Math.max(6, Math.round(h * 0.075));
    const minDrop = Math.max(2.2, threshold * 0.18);
    const minSharpness = Math.max(0.38, threshold / Math.max(12, maxWidth * 2.4));

    let reject = '';
    if (score < threshold) reject = 'below-threshold';
    else if (width > softMaxWidth) reject = 'too-wide-edge';
    else if (width > maxWidth && drop < threshold * 0.55) reject = 'wide-flat-edge';
    else if (drop < minDrop) reject = 'low-side-drop';
    else if (sharpness < minSharpness) reject = 'not-sharp';

    return {
      y,
      score,
      width,
      left,
      right,
      floor,
      leftBase,
      rightBase,
      sideBase,
      drop,
      sharpness,
      maxWidth,
      softMaxWidth,
      detected: !reject,
      reject: reject || 'PASS',
      label
    };
  }

  function analyzeCTLines(cropCanvas, win) {
    if (!cropCanvas || !win) return null;
    const W = cropCanvas.width;
    const H = cropCanvas.height;
    const ctx = cropCanvas.getContext('2d', {willReadFrequently:true});
    const data = ctx.getImageData(0,0,W,H).data;

    const x0 = clamp(Math.floor(win.x + win.w * 0.28), 0, W-1);
    const x1 = clamp(Math.ceil(win.x + win.w * 0.72), 0, W);
    const y0 = clamp(Math.floor(win.y + win.h * 0.04), 0, H-1);
    const y1 = clamp(Math.ceil(win.y + win.h * 0.96), 0, H);
    const h = Math.max(1, y1-y0);

    const raw = [];
    for (let yy=y0; yy<y1; yy++) {
      let sum = 0, n = 0;
      for (let xx=x0; xx<x1; xx++) {
        const idx = (yy*W + xx) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        const yLum = 0.299*r + 0.587*g + 0.114*b;
        // 紅/粉線強度：紅色相對於 G/B 與亮度背景的差異。
        const redScore = (r - (g+b)*0.50) + (r-g)*0.18 + (r-b)*0.12;
        // 避免白色背景被誤判；太暗也不直接加分。
        const lineScore = Math.max(0, redScore) * (yLum > 55 ? 1 : 0.55);
        sum += lineScore;
        n++;
      }
      raw.push(n ? sum/n : 0);
    }

    const smoothed = smoothProfile(raw, Math.max(2, Math.round(h*0.012)));
    const bg = median(smoothed);
    const positive = smoothed.map(v=>Math.max(0, v-bg));
    const stat = meanStd(positive);
    const maxScore = Math.max(1, ...positive);
    const threshold = Math.max(7, stat.mean + stat.std * 2.0, maxScore * 0.22);

    // 目前使用固定 Window 比例，所以 C/T 也用 Window 內相對位置分區。
    // C 區偏上，T 區偏下，中間稍微重疊，避免裁切誤差。
    const cRange = {start:Math.round(h*0.12), end:Math.round(h*0.48)};
    const tRange = {start:Math.round(h*0.45), end:Math.round(h*0.84)};
    const cRawPeak = maxInRange(positive, cRange.start, cRange.end);
    const tRawPeak = maxInRange(positive, tRange.start, tRange.end);
    const cQ = qualifyPeak(positive, cRawPeak, threshold, cRange, h, 'C');
    const tQ = qualifyPeak(positive, tRawPeak, threshold, tRange, h, 'T');

    const cDetected = cQ.detected;
    const tDetected = tQ.detected;
    let result = 'Invalid';
    if (cDetected && tDetected) result = 'Positive';
    else if (cDetected && !tDetected) result = 'Negative';
    else result = 'Invalid';

    return {
      source:'ct-red-profile-window-center-narrow-peak',
      x0, x1, y0, y1, h,
      raw, profile:positive, baseline:bg, mean:stat.mean, std:stat.std,
      maxScore, threshold,
      cRange, tRange,
      cPeak:{y:cQ.y, absY:y0+cQ.y, score:cQ.score, detected:cDetected, width:cQ.width, left:y0+cQ.left, right:y0+cQ.right, drop:cQ.drop, sharpness:cQ.sharpness, reject:cQ.reject, maxWidth:cQ.maxWidth},
      tPeak:{y:tQ.y, absY:y0+tQ.y, score:tQ.score, detected:tDetected, width:tQ.width, left:y0+tQ.left, right:y0+tQ.right, drop:tQ.drop, sharpness:tQ.sharpness, reject:tQ.reject, maxWidth:tQ.maxWidth},
      rejectedPeaks:[cQ, tQ].filter(p=>!p.detected).map(p=>`${p.label}:${p.reject}`),
      peakCount:(cDetected?1:0)+(tDetected?1:0),
      result
    };
  }

  function drawCTWaveform(ctx, W, H, win, ct) {
    if (!win || !ct || !ct.profile || !ct.profile.length) return;
    const gap = Math.max(7, W*0.035);
    const axisX = Math.min(W-6, win.x + win.w + gap);
    const available = Math.max(18, W - axisX - 8);
    const waveW = Math.min(Math.max(24, W*0.28), available);
    const maxScore = Math.max(ct.maxScore || 1, ct.threshold || 1, ct.cPeak.score || 1, ct.tPeak.score || 1);

    ctx.save();
    ctx.lineWidth = Math.max(1.5, W/220);
    ctx.strokeStyle = 'rgba(15,23,42,0.95)';
    ctx.fillStyle = 'rgba(15,23,42,0.95)';
    ctx.beginPath();
    ctx.moveTo(axisX, ct.y0);
    ctx.lineTo(axisX, ct.y1);
    ctx.stroke();

    // Threshold：垂直線，因為 X 軸是強度。
    const thX = axisX + (ct.threshold / maxScore) * waveW;
    ctx.setLineDash([4,3]);
    ctx.strokeStyle = 'rgba(220,38,38,0.75)';
    ctx.beginPath();
    ctx.moveTo(thX, ct.y0);
    ctx.lineTo(thX, ct.y1);
    ctx.stroke();
    ctx.setLineDash([]);

    // Waveform：Y 對齊 Window 位置，X 往右代表強度。
    ctx.strokeStyle = 'rgba(234,88,12,0.98)';
    ctx.lineWidth = Math.max(2, W/160);
    ctx.beginPath();
    for (let i=0; i<ct.profile.length; i++) {
      const x = axisX + (ct.profile[i] / maxScore) * waveW;
      const y = ct.y0 + i;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();

    // C/T peak horizontal guides
    function drawPeak(p, label, color) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1.5, W/210);
      ctx.beginPath();
      ctx.moveTo(win.x, p.absY);
      ctx.lineTo(axisX + waveW, p.absY);
      ctx.stroke();
      ctx.font = `${Math.max(9, Math.round(W/28))}px sans-serif`;
      ctx.fillText(`${label} ${Math.round(p.score)}`, axisX + 2, clamp(p.absY - 3, 10, H-4));
    }
    drawPeak(ct.cPeak, ct.cPeak.detected ? 'C' : 'C?', 'rgba(22,163,74,0.95)');
    drawPeak(ct.tPeak, ct.tPeak.detected ? 'T' : 'T?', 'rgba(168,85,247,0.95)');

    ctx.font = `${Math.max(9, Math.round(W/30))}px sans-serif`;
    ctx.fillStyle = 'rgba(15,23,42,0.95)';
    ctx.fillText(`CT ${ct.result}`, Math.max(2, axisX-2), Math.max(12, ct.y0-6));
    ctx.restore();
  }

  function drawInternalFeatures(ctx, W, H, f) {
    ctx.save();
    ctx.strokeStyle = 'rgba(34,197,94,0.98)';
    ctx.lineWidth = Math.max(3, W/160);
    ctx.strokeRect(1, 1, W-2, H-2);

    // v30.8：畫出三等分參考線，方便確認 S 洞方向判斷依據。
    ctx.setLineDash([6,4]);
    ctx.strokeStyle = 'rgba(245,158,11,0.95)';
    ctx.lineWidth = Math.max(1, W/220);
    ctx.beginPath();
    ctx.moveTo(2, H/3); ctx.lineTo(W-2, H/3);
    ctx.moveTo(2, H*2/3); ctx.lineTo(W-2, H*2/3);
    ctx.stroke();
    ctx.setLineDash([]);

    if (f.directionAnalysis) {
      ctx.fillStyle = 'rgba(245,158,11,0.95)';
      ctx.font = `${Math.max(9, Math.round(W / 24))}px sans-serif`;
      ctx.fillText(`Top S ${Math.round(f.directionAnalysis.topScore)}`, 5, Math.max(12, H/3 - 6));
      ctx.fillText(`Bottom S ${Math.round(f.directionAnalysis.bottomScore)}`, 5, Math.min(H-8, H*2/3 + 16));
    }
    ctx.restore();

    if (f.window) drawRect(ctx, f.window, 'rgba(37,99,235,0.95)', 'Window/slot');
    if (f.sample) drawEllipseMark(ctx, f.sample, 'rgba(168,85,247,0.95)', 'S zone');
    if (f.window && f.ctAnalysis) drawCTWaveform(ctx, W, H, f.window, f.ctAnalysis);
  }

  function findInternalFeaturesOnCrop(cropCanvas, draw) {
    const src = cv.imread(cropCanvas);
    const W = src.cols;
    const H = src.rows;
    const ctx = cropCanvas.getContext('2d');

    const directionAnalysis = analyzeThirdDirection(cropCanvas, W, H);
    const chosen = makeFixedInternalByDirection(cropCanvas, W, H, directionAnalysis);

    const win = chosen.window || fallbackWindowFromGeometry(W, H, chosen.name);
    const sample = chosen.sample || fallbackSampleByWindow(W, H, win, chosen.name);
    const winCx = win ? win.x + win.w/2 : W*0.50;
    const winCy = win ? win.y + win.h/2 : H*0.40;
    const sampleCx = sample ? sample.cx : W*0.50;
    const sampleCy = sample ? sample.cy : H*0.68;
    const alignDx = Math.abs(winCx - sampleCx);
    const alignScore = 1 - Math.min(1, alignDx / Math.max(1, W*0.35));
    const windowAboveSample = !!(win && sample && winCy < sampleCy);
    const yGap = sampleCy - winCy;

    const normalScore = directionAnalysis.bottomScore;
    const invertedScore = directionAnalysis.topScore;

    const ctAnalysis = analyzeCTLines(cropCanvas, win);

    const out = {
      window: win,
      sample,
      ctAnalysis,
      ctResult: ctAnalysis ? ctAnalysis.result : '-',
      windowSource: win.source,
      sampleSource: sample.source,
      windowCandidates: chosen.windowCandidates,
      sampleCandidates: chosen.sampleCandidates,
      windowDebug: chosen.windowDebug || [],
      redWindow: chosen.redWindow || null,
      sampleDebug: chosen.sampleDebug || [],
      sampleSearch: chosen.sampleSearch || null,
      normalTemplate: {name:'normal', templateScore:{score:normalScore}},
      invertedTemplate: {name:'inverted', templateScore:{score:invertedScore}},
      chosenTemplate: chosen.name,
      needsRotation180: directionAnalysis.rotate180,
      directionAnalysis,
      roiMetrics: {
        winCx, winCy, sampleCx, sampleCy, alignDx, alignScore, yGap, windowAboveSample,
        windowSearchBox: chosen.windowSearchBox,
        sampleSearchBox: chosen.sampleSearchBox,
        normalScore,
        invertedScore
      }
    };

    if (draw) drawInternalFeatures(ctx, W, H, out);
    src.delete();
    return out;
  }

  function detectInternalFeatures(cropCanvas) {
    let f = findInternalFeaturesOnCrop(cropCanvas,false);
    let orientationCorrected = false;

    if (f.needsRotation180) {
      rotateCanvas180(cropCanvas);
      orientationCorrected = true;
      f = findInternalFeaturesOnCrop(cropCanvas,false);
    }

    const finalF = findInternalFeaturesOnCrop(cropCanvas,true);
    finalF.orientationCorrected = orientationCorrected;
    finalF.orientation = finalF.chosenTemplate === 'normal' ? 'window-above-sample' : 'sample-above-window';
    finalF.directionBeforeRotation = f.directionAnalysis ? f.directionAnalysis.direction : '-';
    return finalF;
  }


function longAxisVerticalScore(c)
{
    let angle = c.rect.angle || 0;
    if(c.rect.size.width < c.rect.size.height)
        angle += 90;

    angle = ((angle % 180) + 180) % 180;

    const diff = Math.min(
        Math.abs(angle - 90),
        Math.abs(angle + 90),
        Math.abs(angle - 270)
    );

    const score = 1 - Math.min(1, diff / 38);

    return {
        score,
        angle,
        diff
    };
}

function outerGeometryScore(c, imgArea, imgW, imgH)
{
    const areaRatio = c.rectArea / Math.max(1, imgArea);

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

    const edgeLike = c.method.includes('edge');
    const fillTarget = edgeLike ? 0.22 : 0.50;
    const fillScore =
        1 - Math.min(
            1,
            Math.abs(c.fill - fillTarget) / Math.max(0.18, fillTarget)
        );

    const methodBonus =
        edgeLike ? 1900 :
        c.method.includes('white') ? 900 :
        250;

    const vertical = longAxisVerticalScore(c);

    const horizontalPenalty =
        vertical.score < 0.25 ? 5600 :
        vertical.score < 0.45 ? 2600 :
        0;

    const smallPenalty =
        areaRatio < 0.050 ? 2400 : 0;

    // v28.7：補上原本 v28.6 Debug 有寫、但實際沒定義的封閉外框評分。
    // 封閉長方形外框通常會有合理 fill；太低代表只是開放邊線，太高可能是大塊背景/手機。
    let closedEdgeScore = 0;
    if(edgeLike)
    {
        if(c.fill >= 0.12 && c.fill <= 0.42)
            closedEdgeScore = 1.00;
        else if(c.fill >= 0.07 && c.fill <= 0.55)
            closedEdgeScore = 0.55;
        else
            closedEdgeScore = 0.10;
    }
    else
    {
        closedEdgeScore = fillScore * 0.45;
    }

    const lowRatioPenalty =
        c.ratio < 2.05 ? 5200 :
        c.ratio < 2.35 ? 2400 :
        0;

    const openEdgePenalty =
        edgeLike && c.fill < 0.10 ? 4200 : 0;

    // v28.9：加入照片中央優先。
    // 手機與滑鼠墊常出現在邊緣；使用者拍快篩時，卡匣通常會靠近中央。
    const imgCx = Math.max(1, imgW || 1) / 2;
    const imgCy = Math.max(1, imgH || 1) / 2;
    const dx = Math.abs(c.rect.center.x - imgCx) / Math.max(1, imgW || 1);
    const dy = Math.abs(c.rect.center.y - imgCy) / Math.max(1, imgH || 1);
    const centerDist = Math.sqrt(dx * dx + dy * dy);
    const centerScore = 1 - Math.min(1, centerDist / 0.45);
    const edgePenalty =
        centerScore < 0.22 ? 6200 :
        centerScore < 0.38 ? 3200 :
        centerScore < 0.52 ? 1200 :
        0;

    // v29.0：外框尺寸保護。
    // 判讀窗/試紙區本身也可能有紅線與橢圓形特徵，
    // 但它在整張照片中的面積會明顯小於真正卡匣外框。
    // 因此候選太小時即使有 Window/S Well，也不能當成外框。
    const smallOuterPenalty =
        areaRatio < 0.020 ? 24000 :
        areaRatio < 0.030 ? 18000 :
        areaRatio < 0.050 ? 9000 :
        0;

    // 面積極小但比例又很像 3~4 的候選，常是判讀窗本身。
    const innerWindowPenalty =
        areaRatio < 0.020 && c.ratio > 2.4 && c.ratio < 5.2 ? 12000 :
        areaRatio < 0.030 && c.ratio > 2.4 && c.ratio < 5.2 ? 6000 :
        0;

    const score =
        areaScore * 4200 +
        ratioScore * 1300 +
        fillScore * 750 +
        vertical.score * 3000 +
        closedEdgeScore * 2300 +
        centerScore * 3600 +
        methodBonus -
        smallPenalty -
        horizontalPenalty -
        lowRatioPenalty -
        openEdgePenalty -
        edgePenalty -
        smallOuterPenalty -
        innerWindowPenalty;

    return {
        score: Math.max(0, score),
        areaScore,
        ratioScore,
        fillScore,
        verticalScore: vertical.score,
        verticalAngle: vertical.angle,
        verticalDiff: vertical.diff,
        centerScore,
        centerDist,
        edgePenalty,
        smallOuterPenalty,
        innerWindowPenalty,
        methodBonus,
        smallPenalty,
        horizontalPenalty,
        closedEdgeScore,
        lowRatioPenalty,
        openEdgePenalty
    };
}


function candidateAppearanceScore(canvas)
{
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    const W = canvas.width;
    const H = canvas.height;
    const data = ctx.getImageData(0,0,W,H).data;

    let light = 0;
    let midLight = 0;
    let dark = 0;
    let veryDark = 0;
    let lowSatLight = 0;
    const total = Math.max(1, W * H);

    for(let i=0; i<data.length; i+=4)
    {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const y = 0.299*r + 0.587*g + 0.114*b;
        const mx = Math.max(r,g,b);
        const mn = Math.min(r,g,b);
        const sat = mx - mn;

        if(y > 170) light++;
        if(y > 135) midLight++;
        if(y < 90) dark++;
        if(y < 55) veryDark++;
        if(y > 135 && sat < 55) lowSatLight++;
    }

    const lightRatio = light / total;
    const midLightRatio = midLight / total;
    const darkRatio = dark / total;
    const veryDarkRatio = veryDark / total;
    const lowSatLightRatio = lowSatLight / total;

    // 快篩卡本體通常是低飽和、偏亮的塑膠面。
    // 手機螢幕 / 滑鼠墊 / 黑色物件即使有封閉邊緣，也會有過高 darkRatio。
    let bonus = 0;
    let penalty = 0;

    if(lowSatLightRatio > 0.55) bonus += 2600;
    else if(lowSatLightRatio > 0.42) bonus += 1300;
    else if(lowSatLightRatio < 0.28) penalty += 5200;

    if(midLightRatio < 0.45) penalty += 3600;
    if(darkRatio > 0.35) penalty += 5200;
    if(veryDarkRatio > 0.22) penalty += 3800;

    const trustedBrightCard =
        lowSatLightRatio >= 0.38 &&
        midLightRatio >= 0.48 &&
        darkRatio <= 0.34 &&
        veryDarkRatio <= 0.22;

    return {
        score: bonus - penalty,
        bonus,
        penalty,
        lightRatio,
        midLightRatio,
        darkRatio,
        veryDarkRatio,
        lowSatLightRatio,
        trustedBrightCard
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

        const appearance = candidateAppearanceScore(tmp);

        const f =
            findInternalFeaturesOnCrop(
                tmp,
                false
            );

        let score = appearance.score;

        const win = f && f.window;
        const sample = f && f.sample;

        const rawRedWindow =
            !!(win && win.source && win.source.includes('red-line-window'));

        const hasRedWindow =
            !!(rawRedWindow && appearance.trustedBrightCard);

        const hasRealWindow =
            !!(win && win.source && !win.source.includes('fallback'));

        const hasRealSample =
            !!(sample && sample.source && !sample.source.includes('fallback'));

        // v28.7：不能再讓 fallback 特徵幫候選加分。
        // 紅線判讀窗比一般 opencv-window-contour 可信，因為手機/滑鼠墊也可能產生假矩形。
        if(hasRedWindow)
            score += 6200;
        else if(hasRealWindow && appearance.trustedBrightCard)
            score += 1200;

        if(hasRealSample)
            score += 5200;

        let align = 0;

        if(win && sample)
        {
            const wx =
                win.x +
                win.w / 2;

            const sx =
                sample.cx;

            const dx =
                Math.abs(wx - sx);

            align =
                1 -
                Math.min(
                    1,
                    dx / (tmp.width * 0.35)
                );

            if(hasRealSample || hasRedWindow)
                score += align * 700;
        }

        return {
            score,
            align,
            f,
            appearance,
            rawRedWindow,
            hasRedWindow,
            hasRealWindow,
            hasRealSample
        };
    }
    catch(e)
    {
        return {
            score:0,
            align:0,
            f:null,
            appearance:null,
            rawRedWindow:false,
            hasRedWindow:false,
            hasRealWindow:false,
            hasRealSample:false
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
      const geo=outerGeometryScore(c,imgArea,src.cols,src.rows);
      const hasRedWindow = !!fs.hasRedWindow;
      const hasRealWindow = !!fs.hasRealWindow;
      const hasRealSample = !!fs.hasRealSample;
      const noRealSamplePenalty = hasRealSample ? 0 : (hasRedWindow ? 600 : 2200);
      const noTrustedFeaturePenalty = (hasRedWindow || hasRealSample) ? 0 : 8200;
      c.outerScore=geo.score;
      c.outerDetail=geo;
      const smallOuterTotalPenalty = (geo.smallOuterPenalty || 0) + (geo.innerWindowPenalty || 0);
      c.totalScore =
        geo.score +
        fs.score -
        noRealSamplePenalty -
        noTrustedFeaturePenalty -
        smallOuterTotalPenalty;
      c.smallOuterTotalPenalty = smallOuterTotalPenalty;
      c.featureScore=fs.score;
      c.featureDetail=fs.f;
      c.featureAlign=fs.align;
      c.appearanceDetail=fs.appearance || null;
      c.rawRedWindow=!!fs.rawRedWindow;
      c.noRealSamplePenalty=noRealSamplePenalty;
      c.noTrustedFeaturePenalty=noTrustedFeaturePenalty;
      c.hasRedWindow=hasRedWindow;
      c.hasRealWindow=hasRealWindow;
      c.hasRealSample=hasRealSample;
      scored.push(c);
    }
    scored.sort((a,b)=>b.totalScore-a.totalScore);
    const best=scored[0];

    ctx.save(); ctx.lineWidth=Math.max(3,canvas.width/250);
    // v31.0：Original Image 只畫最後選到的大外框，避免候選框造成誤會。
    if(best) drawPolygon(ctx,best.pts,'rgba(22,163,74,0.95)',ctx.lineWidth+1);
    ctx.restore();

    let result;
    if(best){
      let features=null;
      try{ warpCropToCanvas(canvas,cropCanvas,best.pts); features=detectInternalFeatures(cropCanvas); } catch(e){ console.error(e); }

      // v29.1 final gate 修正：
      // v29.0 會把「已找到正確外框 + red-line-window」的候選誤殺，
      // 因為 S Well 若是 fallback 就被 no-real-window-or-sample 擋掉。
      // 這裡把可信紅線視窗當成可信特徵；S Well 沒找到時仍可判定外框成功，但 UI 會提示 S Well 尚未確認。
      const bestAreaRatio = best.rectArea / Math.max(1, imgArea);
      const bestAppearanceOk = !!(best.appearanceDetail && best.appearanceDetail.trustedBrightCard);
      const bestCenterOk = !(best.outerDetail && best.outerDetail.centerScore !== undefined) || best.outerDetail.centerScore >= 0.25;
      const bestOuterGeometryOk =
        bestAreaRatio >= 0.045 &&
        best.ratio >= options.ratioMin * 0.82 &&
        best.ratio <= options.ratioMax * 1.22 &&
        bestAppearanceOk &&
        bestCenterOk;

      const bestHasTrustedRedWindow = !!best.hasRedWindow;
      const bestHasRealSample = !!best.hasRealSample;
      const bestHasTrustedFeature = !!(bestHasTrustedRedWindow || bestHasRealSample);

      // v29.3：Final Gate 再放寬一層：
      // 若外框幾何本身已明確成立（大面積、亮色、直向、中心、比例），即使 Window/S Well 沒被確認，也先判外框成功。
      // 這避免正確外框被框到，但因紅線太淡或 S Well 找不到而顯示失敗。
      const forceOkByFinalGate = !!(bestOuterGeometryOk && bestHasTrustedFeature);
      const forceOkByStrongCandidate = !!(
        best.totalScore > 18000 &&
        bestAreaRatio >= 0.045 &&
        best.appearanceDetail &&
        best.appearanceDetail.trustedBrightCard &&
        (bestHasTrustedRedWindow || bestHasRealSample)
      );
      const outerOnlyOk = !!(
        !bestHasTrustedFeature &&
        bestOuterGeometryOk &&
        best.outerScore >= 9000 &&
        bestAreaRatio >= 0.075 &&
        best.ratio >= 2.5 &&
        best.ratio <= 5.2 &&
        best.appearanceDetail &&
        best.appearanceDetail.trustedBrightCard &&
        (!best.outerDetail || best.outerDetail.centerScore >= 0.45)
      );
      const bestOk = !!(forceOkByFinalGate || forceOkByStrongCandidate || outerOnlyOk);

      let failReason = '';
      if(!bestOuterGeometryOk) failReason = 'bad-outer-geometry';
      else if(!bestHasTrustedFeature && !outerOnlyOk) failReason = 'no-trusted-window-or-sample';
      else failReason = '';

      const partialMessage = (bestHasTrustedRedWindow && !bestHasRealSample) || outerOnlyOk;
      

let dbg='';

dbg += '<b>Debug Summary</b><br>';
dbg += 'White Mask: generated<br>';
dbg += 'Edge: generated<br>';
dbg += 'Bright Foreground: included as candidate source<br>';
dbg += 'Raw Candidates: ' + rawCands.length + '<br>';
dbg += 'Scored Candidates: ' + scored.length + '<br>';
dbg += 'Final Gate: outer=' + (bestOuterGeometryOk ? 'PASS' : 'FAIL') + ' / trustedFeature=' + (bestHasTrustedFeature ? 'PASS' : 'FAIL') + ' / redWindow=' + (bestHasTrustedRedWindow ? 'YES' : 'NO') + ' / realSample=' + (bestHasRealSample ? 'YES' : 'NO') + '<br>';
dbg += 'UI Status: ' + (bestHasRealSample ? 'FULL PASS - S Well confirmed' : (outerOnlyOk ? 'OUTER ONLY' : (partialMessage ? 'PARTIAL' : (bestOk ? 'PASS' : 'FAIL')))) + '<br>';
dbg += 'Detection Mode: window=' + ((features && features.windowSource) ? features.windowSource : '-') + ' / sample=' + ((features && features.sampleSource) ? features.sampleSource : '-') + ' / orientation=' + ((features && features.orientation) ? features.orientation : '-') + '<br>';
dbg += 'Final Reason: ' + (bestOk ? (outerOnlyOk ? 'outer-only-ok, Window/S Well not confirmed yet' : (partialMessage ? 'outer+red-window-ok, S Well not confirmed yet' : 'outer+real-feature-ok')) : failReason) + '<br>';
dbg += 'Final Force: finalGate=' + (forceOkByFinalGate ? 'YES' : 'NO') + ' / strongCandidate=' + (forceOkByStrongCandidate ? 'YES' : 'NO') + ' / outerOnly=' + (outerOnlyOk ? 'YES' : 'NO') + '<br>';
dbg += 'Best Gate Detail: areaRatio=' + (bestAreaRatio*100).toFixed(2) + '% / ratio=' + best.ratio.toFixed(2) + ' / outerScore=' + Math.round(best.outerScore||0) + ' / appearance=' + (bestAppearanceOk ? 'PASS':'FAIL') + ' / center=' + (bestCenterOk ? 'PASS':'FAIL') + '<br><hr>';

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
    No Trusted Feature Penalty=${Math.round(c.noTrustedFeaturePenalty||0)}<br>
    Red Window=${c.hasRedWindow ? 'YES' : 'NO'} / Raw Red=${c.rawRedWindow ? 'YES' : 'NO'} / Real Sample=${c.hasRealSample ? 'YES' : 'NO'}<br>
    Appearance=${c.appearanceDetail ? (c.appearanceDetail.trustedBrightCard ? 'PASS' : 'FAIL') : '-'} / LowSatLight=${c.appearanceDetail ? c.appearanceDetail.lowSatLightRatio.toFixed(2) : '-'} / MidLight=${c.appearanceDetail ? c.appearanceDetail.midLightRatio.toFixed(2) : '-'} / Dark=${c.appearanceDetail ? c.appearanceDetail.darkRatio.toFixed(2) : '-'} / Penalty=${c.appearanceDetail ? Math.round(c.appearanceDetail.penalty) : '-'}<br>
    Window Score=${win ? 3000 : 0} / Source=${win ? win.source : '-'}<br>
    S Well Score=${realSample ? 5000 : (sample ? 600 : 0)} / Source=${sample ? sample.source : '-'}<br>
    Align Score=${Math.round((c.featureAlign||0)*1000)}<br>
    Ratio=${c.ratio.toFixed(2)}<br>
    Fill=${c.fill.toFixed(2)}<br>
    AreaRatio=${(c.areaRatio*100).toFixed(2)}%<br>
    Vertical Score=${c.outerDetail ? c.outerDetail.verticalScore.toFixed(2) : '-'} / Angle=${c.outerDetail ? c.outerDetail.verticalAngle.toFixed(1) : '-'} / H-Penalty=${c.outerDetail ? Math.round(c.outerDetail.horizontalPenalty) : '-'}<br>
    Closed Edge=${c.outerDetail ? c.outerDetail.closedEdgeScore.toFixed(2) : '-'} / LowRatioPenalty=${c.outerDetail ? Math.round(c.outerDetail.lowRatioPenalty) : '-'} / OpenEdgePenalty=${c.outerDetail ? Math.round(c.outerDetail.openEdgePenalty) : '-'}<br>
    Center Score=${c.outerDetail ? c.outerDetail.centerScore.toFixed(2) : '-'} / CenterDist=${c.outerDetail ? c.outerDetail.centerDist.toFixed(2) : '-'} / EdgePenalty=${c.outerDetail ? Math.round(c.outerDetail.edgePenalty) : '-'}<br>
    SmallOuterPenalty=${c.outerDetail ? Math.round(c.outerDetail.smallOuterPenalty||0) : '-'} / InnerWindowPenalty=${c.outerDetail ? Math.round(c.outerDetail.innerWindowPenalty||0) : '-'} / SmallTotalPenalty=${Math.round(c.smallOuterTotalPenalty||0)}<br>`;

    if (f && f.roiMetrics) {
      dbg +=
      `ROI Metrics：align=${f.roiMetrics.alignScore.toFixed(2)}, dx=${f.roiMetrics.alignDx.toFixed(0)}, yGap=${f.roiMetrics.yGap.toFixed(0)}, windowAboveS=${f.roiMetrics.windowAboveSample ? 'YES' : 'NO'}<br>`;
      if (f.chosenTemplate) {
        dbg += `ROI Template：chosen=${f.chosenTemplate} / normal=${f.roiMetrics.normalScore.toFixed(0)} / inverted=${f.roiMetrics.invertedScore.toFixed(0)} / rotate180=${f.orientationCorrected ? 'YES' : 'NO'}<br>`;
        if (f.directionAnalysis) {
          const da = f.directionAnalysis;
          dbg += `Direction Analysis：Top S Score=${da.topScore.toFixed(0)} / Bottom S Score=${da.bottomScore.toFixed(0)} / diff=${da.diff.toFixed(0)} / ratio=${da.ratio.toFixed(2)} / decision=${da.direction} / rotate180=${da.rotate180 ? 'YES' : 'NO'}<br>`;
          dbg += `Top Detail：std=${da.top.std.toFixed(1)}, dark=${da.top.darkRatio.toFixed(2)}, edge=${da.top.edgeRatio.toFixed(2)}, vertical=${da.top.verticalRatio.toFixed(2)}, horizontal=${da.top.horizontalRatio.toFixed(2)}, rowPenalty=${da.top.rowPenalty.toFixed(0)}<br>`;
          dbg += `Bottom Detail：std=${da.bottom.std.toFixed(1)}, dark=${da.bottom.darkRatio.toFixed(2)}, edge=${da.bottom.edgeRatio.toFixed(2)}, vertical=${da.bottom.verticalRatio.toFixed(2)}, horizontal=${da.bottom.horizontalRatio.toFixed(2)}, rowPenalty=${da.bottom.rowPenalty.toFixed(0)}<br>`;
        }
      }
    }

    if (f && f.ctAnalysis) {
      const ct = f.ctAnalysis;
      dbg += `<b>CT Line Analysis</b><br>`;
      dbg += `Result=${ct.result} / Peak Count=${ct.peakCount} / Threshold=${ct.threshold.toFixed(1)} / Baseline=${ct.baseline.toFixed(1)} / Max=${ct.maxScore.toFixed(1)}<br>`;
      dbg += `C Score=${ct.cPeak.score.toFixed(1)} / C Y=${ct.cPeak.absY.toFixed(0)} / C Detected=${ct.cPeak.detected ? 'YES' : 'NO'} / C Range=${ct.cRange.start}-${ct.cRange.end}<br>`;
      dbg += `C Width=${ct.cPeak.width} / MaxWidth=${ct.cPeak.maxWidth} / Drop=${ct.cPeak.drop.toFixed(1)} / Sharpness=${ct.cPeak.sharpness.toFixed(2)} / Reject=${ct.cPeak.reject}<br>`;
      dbg += `T Score=${ct.tPeak.score.toFixed(1)} / T Y=${ct.tPeak.absY.toFixed(0)} / T Detected=${ct.tPeak.detected ? 'YES' : 'NO'} / T Range=${ct.tRange.start}-${ct.tRange.end}<br>`;
      dbg += `T Width=${ct.tPeak.width} / MaxWidth=${ct.tPeak.maxWidth} / Drop=${ct.tPeak.drop.toFixed(1)} / Sharpness=${ct.tPeak.sharpness.toFixed(2)} / Reject=${ct.tPeak.reject}<br>`;
      if (ct.rejectedPeaks && ct.rejectedPeaks.length) dbg += `Rejected Peaks=${ct.rejectedPeaks.join(', ')}<br>`;
    }

    if (f && f.redWindow) {
      dbg +=
      `Red Window ROI：x=${f.redWindow.x.toFixed(0)}, y=${f.redWindow.y.toFixed(0)}, w=${f.redWindow.w.toFixed(0)}, h=${f.redWindow.h.toFixed(0)}, redCount=${f.redWindow.count || 0}<br>`;
    } else {
      dbg += 'Red Window ROI: not found<br>';
    }

    if (f && f.windowDebug && f.windowDebug.length) {
      dbg += '<b>Window Candidates</b><br>';
      f.windowDebug.forEach((w,j)=>{
        dbg += `${j+1}. ${w.reject} | x=${w.x}, y=${w.y}, w=${w.w}, h=${w.h}, aspect=${w.aspect.toFixed(2)}, fill=${w.fill.toFixed(2)}, center=${w.centerScore.toFixed(2)}, score=${Math.round(w.score)}<br>`;
      });
    } else {
      dbg += 'Window Candidates: none<br>';
    }

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
      dbg += 'Sample Candidates: none<br>';
    }

    dbg += '<hr>';
});

result={
    version:VERSION,
    ok:bestOk,
    reason:bestOk ? (bestHasRealSample ? best.method+'+third-score-real-feature-gate' : (outerOnlyOk ? best.method+'+outer-only-pass' : (partialMessage ? best.method+'+red-window-outer-pass' : best.method+'+real-feature-gate'))) : failReason,
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
    sampleConfirmed:bestHasRealSample,
    redWindowConfirmed:bestHasTrustedRedWindow,
    outerGeometryOk:bestOuterGeometryOk,
    appearanceOk:bestAppearanceOk,
    centerOk:bestCenterOk,
    partialMessage,
    outerOnlyOk,
    debug:dbg
};


    } else {
      cropCanvas.width=1; cropCanvas.height=1; result={version:VERSION,ok:false,reason:'no-candidate',candidates:rawCands.length};
    }
    src.delete(); return result;
  }

  window.AsapOuterDetector = { detectOuterFrame, VERSION };
})();
