(function () {
  const VERSION = 'v31.78-base70-qr-guided-opencv';

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

  function warpCropToCanvas(srcCanvas, cropCanvas, pts, preserveOrder) {
    // QR orientation already supplies TL,TR,BR,BL. Do not reorder those
    // points by the photo's screen coordinates or rotation will be lost.
    const ordered = preserveOrder ? pts.slice() : orderPoints(pts);
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

  function orientPointsWithQr(pts, qrCenter) {
    const p = pts.slice();
    if (!qrCenter || p.length !== 4) return { points:orderPoints(p), applied:false, rotated180:false };

    // The two shortest disjoint corner pairs are the cassette's short ends.
    // The end nearest the QR is always the physical top of the cassette.
    const pairs = [];
    for (let i=0;i<4;i++) for (let j=i+1;j<4;j++) pairs.push({i,j,d:dist(p[i],p[j])});
    pairs.sort((a,b)=>a.d-b.d);
    const endA = pairs[0];
    const endB = pairs.find(q => q.i!==endA.i && q.i!==endA.j && q.j!==endA.i && q.j!==endA.j);
    if (!endB) return { points:orderPoints(p), applied:false, rotated180:false };

    const centerOf = pair => ({x:(p[pair.i].x+p[pair.j].x)/2, y:(p[pair.i].y+p[pair.j].y)/2});
    const centerA = centerOf(endA), centerB = centerOf(endB);
    const topPair = dist(qrCenter,centerA) <= dist(qrCenter,centerB) ? endA : endB;
    const bottomPair = topPair === endA ? endB : endA;
    const topCenter = centerOf(topPair), bottomCenter = centerOf(bottomPair);

    // Device axis points from QR/top toward the sample-well/bottom.
    const vx = bottomCenter.x-topCenter.x, vy = bottomCenter.y-topCenter.y;
    const right = {x:vy, y:-vx};
    const projection = point => point.x*right.x + point.y*right.y;
    const sortLeftRight = pair => [p[pair.i],p[pair.j]].sort((a,b)=>projection(a)-projection(b));
    const topLR = sortLeftRight(topPair);
    const bottomLR = sortLeftRight(bottomPair);
    const axisAngle = Math.atan2(vy,vx)*180/Math.PI;
    return {
      points:[topLR[0],topLR[1],bottomLR[1],bottomLR[0]],
      applied:true,
      rotated180:false,
      axisAngle,
      correctionAngle:90-axisAngle,
      topCenter,
      bottomCenter
    };
  }

  function pointInPolygon(point, polygon) {
    if (!point || !polygon || polygon.length < 3) return false;
    let inside = false;
    for (let i=0, j=polygon.length-1; i<polygon.length; j=i++) {
      const a = polygon[i], b = polygon[j];
      const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
        (point.x < (b.x-a.x) * (point.y-a.y) / ((b.y-a.y) || 1e-9) + a.x);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function pointSegmentDistance(p, a, b) {
    const vx=b.x-a.x, vy=b.y-a.y;
    const denom=vx*vx+vy*vy;
    const t=denom ? clamp(((p.x-a.x)*vx+(p.y-a.y)*vy)/denom,0,1) : 0;
    return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy));
  }

  function qrEnclosureMetrics(cand, qrCenter, qrPoints) {
    const polygon = orderPoints(cand.pts || []);
    const points = (qrPoints && qrPoints.length >= 4) ? qrPoints.slice(0,4) : (qrCenter ? [qrCenter] : []);
    if (!qrCenter || polygon.length !== 4 || !points.length) {
      return {pass:false, reason:'qr-geometry-missing', centerInside:false, cornersInside:false, minClearance:0};
    }
    const centerInside = pointInPolygon(qrCenter, polygon);
    const cornersInside = points.every(p=>pointInPolygon(p,polygon));
    let minClearance = Infinity;
    for (const p of points) {
      for (let i=0;i<polygon.length;i++) {
        minClearance=Math.min(minClearance,pointSegmentDistance(p,polygon[i],polygon[(i+1)%polygon.length]));
      }
    }
    if (!Number.isFinite(minClearance)) minClearance=0;
    // This is only a small pixel clearance gate, not a QR-to-cassette size ratio.
    const clearanceOk = minClearance >= 2;
    return {
      pass:centerInside && cornersInside && clearanceOk,
      reason:!centerInside?'qr-center-outside':(!cornersInside?'qr-corner-outside':(!clearanceOk?'qr-on-candidate-edge':'PASS')),
      centerInside,cornersInside,minClearance
    };
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

    // QR-enclosing candidates come first so a strong unrelated table edge
    // cannot push the cassette out of the retained candidate set.
    for (const c of all) c.qrEnclosure = qrEnclosureMetrics(c, options.qrCenter || null, options.qrPoints || []);
    all.sort((a,b)=>(Number(b.qrEnclosure.pass)-Number(a.qrEnclosure.pass)) || (b.score-a.score));

    // 去重
    const unique = [];
    for (const c of all) {
      const dup = unique.some(u => Math.hypot(u.rect.center.x-c.rect.center.x, u.rect.center.y-c.rect.center.y) < 20 && Math.abs(u.rectArea-c.rectArea)/Math.max(u.rectArea,c.rectArea) < 0.25);
      if (!dup) unique.push(c);
      if (unique.length >= 30) break;
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
      // QR occupies the top region. The result window must be below it and
      // remain inside the cassette; this also excludes QR finder patterns.
      if (!reject && cy < H * 0.27) reject = 'above-result-zone';
      if (!reject && cy > H * 0.76) reject = 'below-result-zone';
      if (!reject && br.x < W * 0.08) reject = 'touch-left-edge';
      if (!reject && br.x + br.width > W * 0.92) reject = 'touch-right-edge';
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
    // v31.6：Window 是定位用的大範圍試紙槽，不是只框住舊版狹窄比例。
    // 翻轉校正後，真正 T 線可能落在舊 Window 下緣外，因此 normal Window 向下延伸。
    // normal：Window 在中上段但下緣延伸到約 62%H；inverted：保持上下對稱，用於旋轉前評分。
    const w = Math.round(W * 0.21);
    const h = Math.round(H * 0.38);
    const cx = Math.round(W * 0.50);
    const cy = orientation === 'inverted' ? Math.round(H * 0.57) : Math.round(H * 0.43);
    return {
      x: clamp(cx - w/2, 0, W-1),
      y: clamp(cy - h/2, 0, H-1),
      w: clamp(w, 1, W),
      h: clamp(h, 1, H),
      cx, cy,
      source:'fixed-ratio-window-extended'
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

  function fixedWindowForNewCassette(W, H, orientation) {
    // v31.41：這一代卡匣的結果槽位置固定。外框先透視校正後，
    // 直接以整支卡匣為座標系，不再讓淡色塑膠槽 contour 決定 C/T ROI。
    // 實測 26 張陽性照：結果槽約落在 x=18~66%、y=23.5~60%。
    // inverted 僅保留給沒有 QR 的舊流程；QR 模式會先把 QR 端校正到上方。
    const inverted = orientation === 'inverted';
    const x0 = 0.18, x1 = 0.66;
    const y0 = inverted ? 0.40 : 0.235;
    const y1 = inverted ? 0.765 : 0.60;
    const b = makeRatioBox(W, H, x0, y0, x1, y1);
    return {x:b.x, y:b.y, w:b.w, h:b.h, cx:b.cx, cy:b.cy, source:'qr-fixed-window-new-cassette-v3152'};
  }

  function makeFixedInternalByDirection(cropCanvas, W, H, directionAnalysis, allowQrFixedWindow) {
    const isInverted = !!directionAnalysis.rotate180;
    const name = isInverted ? 'inverted' : 'normal';

    // 注意：這裡是在「尚未旋轉前」的位置。若 inverted，S 洞在上、Window 在下。
    const windowBox = isInverted
      ? makeRatioBox(W,H,0.20,0.38,0.72,0.76)
      : makeRatioBox(W,H,0.20,0.24,0.72,0.62);

    const sampleBox = directionAnalysis.chosenBox;

    const rw = findRedWindowInBox(cropCanvas, windowBox, W, H);
    // The proportional box is only a search area. It must never become the
    // measurement window itself, because that shifts C/T after perspective rotation.
    let contourResult = {win:null, count:0, debug:[]};
    let norm = null;
    let cropMat = null;
    try {
      cropMat = cv.imread(cropCanvas);
      norm = makeNormalizedGray(cropMat);
      contourResult = findWindowByContours(norm, W, H);
    } catch (e) {
      contourResult = {win:null, count:0, debug:[]};
    } finally {
      if (norm) norm.delete();
      if (cropMat) cropMat.delete();
    }
    let contourWin = contourResult.win;
    if (contourWin && (
      contourWin.cy < H * 0.27 || contourWin.y < H * 0.18 ||
      contourWin.y + contourWin.h > H * 0.78 ||
      contourWin.x < W * 0.08 || contourWin.x + contourWin.w > W * 0.92
    )) contourWin = null;
    // v31.41：QR 模式下固定幾何 ROI 優先。
    // 舊版會被塑膠反光/槽邊 contour 拉成過窄或偏移的 Window，造成 C/T 根本沒進分析區。
    // 有 QR 時，外框已經做過透視校正，因此固定比例比再猜槽輪廓穩定。
    let win = allowQrFixedWindow ? fixedWindowForNewCassette(W, H, name) : (rw || contourWin);
    if (win) win = makeWindowSafe(win, W, H);
    const sample = fixedSampleFromBox(sampleBox, W, H, 'sample-third-score-confirmed', directionAnalysis.chosenScore);

    const wf = {
      count: contourResult.count || 0,
      debug: contourResult.debug || []
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

    // v31.20：用 50% peak height 計算核心線寬，避免背景緩坡把 width 拉成 100+ px。
    const halfLevel = Math.max(1.0, sideBase + Math.max(0, score - sideBase) * 0.50);
    let halfLeft = y;
    while (halfLeft > range.start && profile[halfLeft - 1] >= halfLevel) halfLeft--;
    let halfRight = y;
    while (halfRight < range.end && halfRight < profile.length - 1 && profile[halfRight + 1] >= halfLevel) halfRight++;
    const halfWidth = Math.max(1, halfRight - halfLeft + 1);
    const halfSharpness = score / Math.max(1, halfWidth);

    // v31.2：除了峰本身不能太寬，也要檢查主峰旁邊是否有「胖肩峰」。
    // 真正 C/T 線通常是單一乾淨尖峰；試紙槽邊緣常會在主峰旁邊拖一坨高訊號。
    const coreRadius = Math.max(2, Math.round(h * 0.010));
    const shoulderInner = Math.max(coreRadius + 2, Math.round(h * 0.026));
    const shoulderOuter = Math.max(shoulderInner + 5, Math.round(h * 0.090));

    function avgRange(a, b) {
      a = Math.max(range.start, Math.floor(a));
      b = Math.min(range.end, profile.length - 1, Math.ceil(b));
      if (b < a) return {avg:0, max:0, n:0};
      let sum = 0, maxv = 0, n = 0;
      for (let i=a; i<=b; i++) {
        const v = Math.max(0, profile[i] || 0);
        sum += v;
        if (v > maxv) maxv = v;
        n++;
      }
      return {avg:n ? sum/n : 0, max:maxv, n};
    }

    const leftShoulder = avgRange(y - shoulderOuter, y - shoulderInner);
    const rightShoulder = avgRange(y + shoulderInner, y + shoulderOuter);
    const shoulderAvg = Math.max(leftShoulder.avg, rightShoulder.avg);
    const shoulderMax = Math.max(leftShoulder.max, rightShoulder.max);
    const shoulderRatio = shoulderAvg / Math.max(1, score);
    const shoulderMaxRatio = shoulderMax / Math.max(1, score);

    // 也檢查峰值附近之外是否形成連續平台。
    const nearLeft = avgRange(y - shoulderInner, y - coreRadius - 1);
    const nearRight = avgRange(y + coreRadius + 1, y + shoulderInner);
    const nearShoulderAvg = Math.max(nearLeft.avg, nearRight.avg);
    const nearShoulderRatio = nearShoulderAvg / Math.max(1, score);

    // 真正 C/T 線是薄線，試紙邊緣通常是寬峰或平台。
    const maxWidth = Math.max(4, Math.round(h * 0.055));
    const softMaxWidth = Math.max(6, Math.round(h * 0.075));
    const minDrop = Math.max(2.2, threshold * 0.18);
    const minSharpness = Math.max(0.38, threshold / Math.max(12, maxWidth * 2.4));
    const maxShoulderRatio = 0.35;       // v31.3：肩峰平均太高，直接排除
    const maxShoulderMaxRatio = 0.55;    // v31.3：旁邊有尖刺，直接排除
    const maxNearShoulderRatio = 0.50;   // v31.3：主峰旁邊有胖平台，直接排除

    // v31.12：Shape Filter 改成 Warning，不再否決 C/T。
    // 目前實測主要問題是「已抓到真正線段，但被 shoulder / width / quality 誤殺」。
    // 因此唯一硬性淘汰條件只保留 below-threshold。
    const warnings = [];
    if (shoulderRatio > maxShoulderRatio) warnings.push('shoulder-too-fat');
    if (shoulderMaxRatio > maxShoulderMaxRatio) warnings.push('shoulder-spike-nearby');
    if (nearShoulderRatio > maxNearShoulderRatio) warnings.push('near-shoulder-platform');
    if (drop < minDrop) warnings.push('low-side-drop');
    if (sharpness < minSharpness) warnings.push('not-sharp');

    let reject = '';
    if (score < threshold) reject = 'below-threshold';

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
      shoulderAvg,
      shoulderMax,
      shoulderRatio,
      shoulderMaxRatio,
      nearShoulderAvg,
      nearShoulderRatio,
      shoulderInner,
      shoulderOuter,
      maxShoulderRatio,
      maxWidth,
      softMaxWidth,
      halfLevel,
      halfLeft,
      halfRight,
      halfWidth,
      halfSharpness,
      detected: !reject,
      reject: reject || 'PASS',
      warning: warnings.length ? warnings.join(',') : '-',
      label
    };
  }

  function analyzeCTLines(cropCanvas, win, qrNorm) {
    if (!cropCanvas || !win) return null;
    const W = cropCanvas.width;
    const H = cropCanvas.height;
    const ctx = cropCanvas.getContext('2d', {willReadFrequently:true});
    const data = ctx.getImageData(0,0,W,H).data;

    // v31.14：Peak 抓出後，不只檢查 peak 當下那一列。
    // 會回頭在 peak 附近上下搜尋，找真正「水平連續線段」的位置。
    // 目的：峰值可能落在紅線邊緣/陰影/肩峰，必須 refine 到真正 C/T 線中心後再畫線與判斷。
    function rowLineContinuity(absY, mode) {
      const faintMode = mode === 'faintT';
      const yy = clamp(Math.round(absY), 0, Math.max(0, H - 1));

      // v31.15：不要只看原本很窄的 x0~x1。
      // 真正 C/T 線可能稍微偏左或偏右，所以用較寬的判讀窗橫向區域回頭找「水平粉紅線」。
      const lx0 = clamp(Math.floor(win.x + win.w * 0.18), 0, W - 1);
      const lx1 = clamp(Math.ceil(win.x + win.w * 0.88), lx0 + 1, W);
      const lineW = Math.max(1, lx1 - lx0);
      const minRun = faintMode ? Math.max(2, Math.round(lineW * 0.055)) : Math.max(3, Math.round(lineW * 0.13));
      const minRatio = faintMode ? 0.035 : 0.10;

      const bgGap = Math.max(5, Math.round(H * 0.012));
      const bgYs = [
        clamp(yy - bgGap, 0, H - 1),
        clamp(yy + bgGap, 0, H - 1)
      ];

      let run = 0;
      let maxRun = 0;
      let redCount = 0;
      let darkCount = 0;
      let lineCount = 0;
      let total = 0;
      let redScoreSum = 0;
      let darkScoreSum = 0;
      let contrastSum = 0;

      for (let xx = lx0; xx < lx1; xx++) {
        const idx = (yy * W + xx) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const yLum = 0.299 * r + 0.587 * g + 0.114 * b;

        let bgLum = 0;
        let bgRed = 0;
        for (const by of bgYs) {
          const bi = (by * W + xx) * 4;
          const br = data[bi], bgc = data[bi + 1], bb = data[bi + 2];
          bgLum += 0.299 * br + 0.587 * bgc + 0.114 * bb;
          bgRed += (br - Math.max(bgc, bb) * 0.82) + (br - bgc) * 0.16 + (br - bb) * 0.10;
        }
        bgLum /= bgYs.length;
        bgRed /= bgYs.length;

        // 粉紅/紅線分數：比舊版更偏向「顏色」，避免把灰色陰影當 C/T 線。
        const redScore = (r - Math.max(g, b) * 0.82) + (r - g) * 0.16 + (r - b) * 0.10;
        const darkScore = bgLum - yLum;
        const redContrast = redScore - bgRed;

        const redLike =
          yLum > 45 &&
          r > 55 &&
          redScore > (faintMode ? 0.75 : 2.0) &&
          redContrast > (faintMode ? 0.25 : 0.8) &&
          r >= g * (faintMode ? 0.945 : 0.975) &&
          r >= b * (faintMode ? 0.925 : 0.955);

        // 暗線只能當輔助，必須同時有一點點紅/粉紅傾向，避免視窗陰影誤判。
        const darkLike =
          yLum > 35 &&
          darkScore > (faintMode ? 3.2 : 5.0) &&
          redScore > (faintMode ? 0.15 : 0.6) &&
          r >= g * (faintMode ? 0.925 : 0.955) &&
          r >= b * (faintMode ? 0.905 : 0.935);

        const lineLike = redLike || darkLike;
        total++;
        redScoreSum += Math.max(0, redScore);
        darkScoreSum += Math.max(0, darkScore);
        contrastSum += Math.max(0, redContrast);

        if (redLike) redCount++;
        if (darkLike) darkCount++;

        if (lineLike) {
          lineCount++;
          run++;
          if (run > maxRun) maxRun = run;
        } else {
          run = 0;
        }
      }

      const ratio = lineCount / Math.max(1, total);
      const redRatio = redCount / Math.max(1, total);
      const darkRatio = darkCount / Math.max(1, total);
      const redAvg = redScoreSum / Math.max(1, total);
      const darkAvg = darkScoreSum / Math.max(1, total);
      const contrastAvg = contrastSum / Math.max(1, total);

      // 必須真的有粉紅連續性；純暗線不直接通過。
      const strictOk = (maxRun >= minRun || ratio >= minRatio) && (redRatio >= 0.035 || redAvg >= 2.2 || contrastAvg >= 1.2);
      // v31.16：T 線常非常淡，已經有 peak score + 相對門檻保護時，
      // 連續紅色允許用較弱的水平線證據通過，避免淡陽性被判陰性。
      // v31.51: 陰性保護。T 線不能只靠灰黑陰影通過；至少要有可量測的粉紅/紅色證據。
      // 仍保留淡陽性，但移除 darkAvg 單獨放行，避免陰性卡的槽邊/髒背景被當成 T。
      const faintColorEvidence = redRatio >= 0.018 || redAvg >= 0.90 || contrastAvg >= 0.38;
      const faintOk = faintMode && (maxRun >= minRun || ratio >= minRatio) && faintColorEvidence;
      const ok = strictOk || faintOk;

      return {
        ok,
        y: yy,
        run: maxRun,
        minRun,
        ratio,
        minRatio,
        redRatio,
        darkRatio,
        redCount,
        darkCount,
        lineCount,
        redAvg,
        darkAvg,
        contrastAvg,
        x0: lx0,
        x1: lx1,
        score: maxRun * 2.2 + ratio * 22.0 + redRatio * 28.0 + redAvg * 0.55 + contrastAvg * 0.80 + darkAvg * 0.18
      };
    }

    function refinePeakToRedLine(localY, localRange, mode) {
      const absCenter = y0 + localY;

      // v31.15：真正回頭找線，不再只在 peak 附近 ±一點點找。
      // 先掃整個 C/T 合理範圍，因為 peak 可能落在陰影或肩峰，不一定在線中心。
      const rangeStart = localRange ? localRange.start : 0;
      const rangeEnd = localRange ? localRange.end : h - 1;
      // Anchor refinement near the profile peak. Scanning the full C/T range
      // could jump to a different dark row after perspective correction.
      const refineRadius = Math.max(3, Math.round(qSide * 0.045));
      const startY = clamp(Math.max(y0 + rangeStart, absCenter - refineRadius), y0, y1 - 1);
      const endY = clamp(Math.min(y0 + rangeEnd, absCenter + refineRadius), startY, y1 - 1);

      let best = null;
      for (let yy = startY; yy <= endY; yy++) {
        const local = yy - y0;
        const cont = rowLineContinuity(yy, mode);
        const profileScore = positive[local] || 0;

        // 距離 peak 太遠可扣分，但不禁止，因為這次目的就是回頭修正錯峰。
        const distancePenalty = Math.abs(yy - absCenter) * 0.045;

        // 周圍紅線連續性權重大於 profile，避免又被波峰肩膀帶走。
        const totalScore = cont.score * 1.35 + profileScore * 0.22 - distancePenalty;
        const item = Object.assign({}, cont, {
          localY: local,
          absY: yy,
          profileScore,
          totalScore,
          offset: yy - absCenter,
          anchorAbsY: absCenter,
          refineRadius,
          searchStart:startY,
          searchEnd:endY
        });
        if (!best || item.totalScore > best.totalScore) best = item;
      }

      if (!best) {
        const cont = rowLineContinuity(absCenter, mode);
        best = Object.assign({}, cont, {
          localY: Math.round(localY),
          absY: y0 + Math.round(localY),
          profileScore: positive[Math.round(localY)] || 0,
          totalScore: cont.score,
          offset: 0,
          anchorAbsY: absCenter,
          refineRadius,
          searchStart:startY,
          searchEnd:endY
        });
      }

      return best;
    }

    // v31.65：卡匣外框才是 C/T 的幾何基準；QR 只用來確認上下方向。
    // 卡匣實體長 70 mm。由上邊緣往下 30 mm、由下邊緣往上 30 mm，
    // 中間固定 10 mm 就是唯一允許分析的試紙區。
    const CASSETTE_L_MM = 70.0;
    const STRIP_TOP_MM = 30.0;
    const STRIP_H_MM = 10.0;
    const T_MIN_GAP_MM = 3.0;
    const T_MAX_GAP_MM = 6.0;
    const T_FWHM_MIN_MM = 0.15; // 放寬：排除單像素/極尖雜訊
    const T_FWHM_MAX_MM = 1.50; // 放寬：主要排除寬廣陰影/平台
    const T_RELATIVE_C_RATIO = 0.10; // T 線強度至少需達 C 線的 10%
    const pxPerMm = H / CASSETTE_L_MM;
    const qSide = Math.max(4, H * (14.0 / 70.0)); // 僅供既有平滑/最小間距參數使用，不參與定位
    const stripCenterX = W * 0.50;

    // X 方向直接以卡匣中心線為基準，避免 QR 左右小誤差帶動 CT zone。
    const stripHalfWidth = Math.max(4, W * 0.105);
    const x0 = clamp(Math.floor(stripCenterX - stripHalfWidth), 0, W-1);
    const x1 = clamp(Math.ceil(stripCenterX + stripHalfWidth), x0 + 1, W);

    const y0 = clamp(Math.floor(STRIP_TOP_MM * pxPerMm), 0, H-1);
    const y1 = clamp(Math.ceil((STRIP_TOP_MM + STRIP_H_MM) * pxPerMm), y0+1, H);
    const h = Math.max(1, y1-y0);

    // C 位於試紙區上半部；T 位於 C 下方。兩區保留重疊容差，
    // 但最終仍要求 T 在 refine 後確實位於 C 下方且有最小間距。
    const cExpectedLocalY = h * 0.25;
    let tExpectedLocalY = h * 0.68;
    const cExpectedAbsY = y0 + cExpectedLocalY;
    let tExpectedAbsY = y0 + tExpectedLocalY;
    const cSearchRange = {
      start: 0,
      end: clamp(Math.ceil(h * 0.58), 1, h-1)
    };
    let tSearchRange = {
      start: clamp(Math.floor(h * 0.28), 0, h-1),
      end: h-1
    };
    const bandHalf = h * 0.58;
    const locatorY0 = y0, locatorY1 = y1;
    const cLocatorBest = null, cLocatorHasColor = false;

    const topThirdY = H / 3;
    const topThirdPadding = 0;
    const windowInnerTop = win.y;
    const ctY0Float = y0;
    const ctStartRatio = x0 / Math.max(1,W);
    const ctEndRatio = x1 / Math.max(1,W);

    // Profile still combines chroma and darkness, but geometry is now the primary gate.
    const pinkRaw = [];
    const lumRaw = [];
    for (let yy=y0; yy<y1; yy++) {
      let pinkSum = 0, lumSum = 0, n = 0;
      for (let xx=x0; xx<x1; xx++) {
        const idx = (yy*W + xx) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        const yLum = 0.299*r + 0.587*g + 0.114*b;
        const redScore = (r - (g+b)*0.50) + (r-g)*0.18 + (r-b)*0.12;
        const pinkScore = Math.max(0, redScore) * (yLum > 55 ? 1 : 0.55);
        pinkSum += pinkScore;
        lumSum += yLum;
        n++;
      }
      pinkRaw.push(n ? pinkSum/n : 0);
      lumRaw.push(n ? lumSum/n : 0);
    }

    const pinkSmooth = smoothProfile(pinkRaw, Math.max(1, Math.round(h*0.018)));
    const lumSmooth = smoothProfile(lumRaw, Math.max(1, Math.round(h*0.018)));

    function percentile(arr, p) {
      if (!arr || !arr.length) return 0;
      const a = arr.slice().sort((x,y)=>x-y);
      const idx = Math.max(0, Math.min(a.length-1, Math.floor((a.length-1)*p)));
      return a[idx];
    }

    const pinkBaseline = percentile(pinkSmooth, 0.20);
    const pinkMedian = median(pinkSmooth);
    const pinkBg = Math.max(0, Math.min(pinkBaseline, pinkMedian));
    const pinkPositive = pinkSmooth.map(v=>Math.max(0, v-pinkBg));

    // Local-background subtraction suppresses broad lighting gradients.
    // A true horizontal C/T line survives this high-pass operation; broad slot shadows do not.
    const lumBackground = percentile(lumSmooth, 0.72);
    const lumMedian = median(lumSmooth);
    const darkRaw = lumSmooth.map(v=>Math.max(0, lumBackground - v));
    const broadDark = smoothProfile(darkRaw, Math.max(3, Math.round(h*0.10)));
    const darkHighPass = darkRaw.map((v,i)=>Math.max(0, v - broadDark[i] * 0.82));
    const darkSmooth = smoothProfile(darkHighPass, Math.max(1, Math.round(h*0.012)));

    const darkWeight = 0.72;
    const positive = pinkPositive.map((v,i)=>Math.max(v, darkSmooth[i] * darkWeight));

    const raw = positive.slice();
    const smoothed = positive.slice();
    const rawBaseline = pinkBaseline;
    const rawMedian = median(positive);
    const rawMax = Math.max(1, ...positive);
    const pinkMax = Math.max(0, ...pinkPositive);
    const darkMax = Math.max(0, ...darkSmooth);
    const combinedMax = Math.max(1, ...positive);
    const selectedMode = pinkMax >= darkMax * darkWeight ? (darkMax * darkWeight > pinkMax * 0.60 ? 'mixed' : 'pink') : (pinkMax > darkMax * darkWeight * 0.60 ? 'mixed' : 'dark');

    const bg = 0;
    const stat = meanStd(positive);
    const maxScore = Math.max(1, ...positive);
    const threshold = Math.max(4.2, stat.mean + stat.std * 1.00, maxScore * 0.16);
    const candidateFloor = Math.max(2.6, threshold * 0.42);
    const minSep = Math.max(6, Math.round(qSide * 0.16));

    function calcQuality(q) {
      let quality = q.score;
      quality *= Math.max(0.18, 1 - q.shoulderRatio * 0.55);
      quality *= Math.max(0.18, 1 - q.nearShoulderRatio * 0.38);
      quality *= Math.max(0.22, 1 - Math.max(0, q.shoulderMaxRatio - 0.55) * 0.55);
      quality *= Math.min(1.25, Math.max(0.55, q.drop / Math.max(2.0, threshold * 0.42)));
      return Math.max(0, quality);
    }

    // v31.47: C and T are selected independently in the lower, QR-anchored bands.
    // No global pair search: a large shadow elsewhere in the window can never steal C or T.
    function bestPeakInBand(label, range, expectedLocalY) {
      const rawPeak = maxInRange(positive, range.start, range.end);
      const q = qualifyPeak(positive, rawPeak, threshold, range, h, label);
      q.quality = calcQuality(q);
      q.selected = q.score >= candidateFloor;
      q.detected = false;
      q.expectedY = expectedLocalY;
      q.expectedAbsY = y0 + expectedLocalY;
      q.distanceFromExpected = Math.abs(q.y - expectedLocalY);
      q.reject = q.selected ? 'candidate' : 'below-candidate-floor';
      return q;
    }

    // v31.67：C/T 不再先靠 profile peak 過門檻才做紅線驗證。
    // 既然 30/10/30 已把 ROI 限定在唯一 10 mm 試紙區，就直接逐列搜尋
    // 「水平粉紅/紅色連續線」。這可避免清楚 C 線因 profile baseline/threshold 被判 Invalid。
    function bestContinuityInRange(range, mode) {
      let best = null;
      const start = clamp(Math.floor(range.start), 0, h-1);
      const end = clamp(Math.ceil(range.end), start, h-1);
      for (let ly=start; ly<=end; ly++) {
        const cont = rowLineContinuity(y0 + ly, mode);
        const ps = positive[ly] || 0;
        const colorBoost = (cont.redRatio || 0) * 24 + (cont.contrastAvg || 0) * 0.55;
        const lineBoost = Math.min(12, (cont.run || 0) * 0.45) + (cont.ratio || 0) * 12;
        const total = (cont.score || 0) + ps * 0.24 + colorBoost + lineBoost;
        const item = Object.assign({}, cont, {localY:ly, absY:y0+ly, profileScore:ps, totalScore:total});
        if (!best || item.totalScore > best.totalScore) best = item;
      }
      return best;
    }

    const cCont = bestContinuityInRange(cSearchRange, 'C');
    const cAnchorY = cCont ? cCont.localY : cExpectedLocalY;

    // v31.68：機構條件 hard-lock。
    // v31.72：依卡匣固定物理位置，T 線只允許出現在「實際 C 線下方 3.0 ~ 6.0 mm」。
    // 先用固定位置排除大部分非 T 區域，再用 FWHM 排除寬廣陰影。
    // FWHM 本版正式參與判定，但門檻先放寬為 0.15~1.50 mm。
    const tMinGapPx = Math.max(1, T_MIN_GAP_MM * pxPerMm);
    const tMaxGapPx = Math.max(tMinGapPx + 1, T_MAX_GAP_MM * pxPerMm);
    const dynTStart = clamp(Math.ceil(cAnchorY + tMinGapPx), 0, h-1);
    const dynTEnd = clamp(Math.floor(cAnchorY + tMaxGapPx), dynTStart, h-1);
    const dynTRange = {
      start: Math.max(tSearchRange.start, dynTStart),
      end: Math.min(tSearchRange.end, dynTEnd)
    };
    const tRangeValid = dynTRange.start <= dynTRange.end && dynTRange.start < h;
    // v31.70：T 判定改成「相對 C 強度」主導。
    // 不再要求弱 T 先通過固定 red-continuity / color hard threshold，
    // 否則肉眼可見但很淡的 T 會在進入 10% C 判斷前就被淘汰。
    function bandStrength(localY) {
      if (!Number.isFinite(localY)) return 0;
      const half = Math.max(1, Math.round(0.35 * pxPerMm));
      const a = clamp(Math.floor(localY - half), 0, h-1);
      const b = clamp(Math.ceil(localY + half), a, h-1);
      const vals = [];
      for (let i=a; i<=b; i++) vals.push(Math.max(0, positive[i] || 0));
      if (!vals.length) return 0;
      vals.sort((x,y)=>y-x);
      const n = Math.max(1, Math.ceil(vals.length * 0.60));
      let sum = 0;
      for (let i=0; i<n; i++) sum += vals[i];
      return sum / n;
    }

    // 在 C 下方 3.0~6.0 mm 的合法區域逐列掃描。
    // 主要排名依 bandStrength；水平/粉紅證據只做小幅加分，不再當第一道硬門檻。
    function bestRelativeTInRange(range) {
      if (!range || range.start > range.end) return null;
      let best = null;
      const start = clamp(Math.floor(range.start), 0, h-1);
      const end = clamp(Math.ceil(range.end), start, h-1);
      for (let ly=start; ly<=end; ly++) {
        const cont = rowLineContinuity(y0 + ly, 'faintT');
        const strength = bandStrength(ly);
        const weakShapeBoost =
          Math.min(4.0, (cont.run || 0) * 0.10) +
          (cont.ratio || 0) * 2.0 +
          (cont.redRatio || 0) * 3.0 +
          (cont.contrastAvg || 0) * 0.08;
        const rank = strength + weakShapeBoost;
        const item = Object.assign({}, cont, {
          localY: ly,
          absY: y0 + ly,
          profileScore: positive[ly] || 0,
          bandStrength: strength,
          totalScore: rank
        });
        if (!best || item.totalScore > best.totalScore) best = item;
      }
      return best;
    }

    let tCont = tRangeValid ? bestRelativeTInRange(dynTRange) : null;

    // v31.73：量測 T candidate 的半高全寬 FWHM。
    // 使用 candidate 周圍約 1.2~2.0 mm 的肩部作局部 baseline，
    // 再於 baseline + 50% 峰高的位置求左右交點。
    // 本版 FWHM 正式參與判定；門檻刻意放寬，先保護弱陽性。
    function measureFwhm(localY) {
      if (!Number.isFinite(localY) || !positive.length) {
        return {valid:false, widthPx:0, widthMm:0, peak:0, baseline:0, halfLevel:0, left:localY||0, right:localY||0};
      }
      const c = clamp(Math.round(localY), 0, h-1);
      const shoulderNear = Math.max(1, Math.round(1.2 * pxPerMm));
      const shoulderFar = Math.max(shoulderNear + 1, Math.round(2.0 * pxPerMm));
      const shoulderVals = [];
      for (let d=shoulderNear; d<=shoulderFar; d++) {
        if (c-d >= 0) shoulderVals.push(Math.max(0, positive[c-d] || 0));
        if (c+d < h) shoulderVals.push(Math.max(0, positive[c+d] || 0));
      }
      const localBaseline = shoulderVals.length ? median(shoulderVals) : 0;
      const peak = Math.max(0, positive[c] || 0);
      const amplitude = Math.max(0, peak - localBaseline);
      if (amplitude <= 0.05) {
        return {valid:false, widthPx:0, widthMm:0, peak, baseline:localBaseline, halfLevel:localBaseline, left:c, right:c};
      }
      const halfLevel = localBaseline + amplitude * 0.5;

      let li = c;
      while (li > 0 && (positive[li] || 0) > halfLevel) li--;
      let ri = c;
      while (ri < h-1 && (positive[ri] || 0) > halfLevel) ri++;

      function crossing(i0, i1) {
        const v0 = positive[i0] || 0, v1 = positive[i1] || 0;
        const dv = v1 - v0;
        if (Math.abs(dv) < 1e-9) return (i0+i1)*0.5;
        return i0 + (halfLevel-v0)/dv * (i1-i0);
      }

      let left = li;
      if (li < c && li+1 < h) left = crossing(li, li+1);
      let right = ri;
      if (ri > c && ri-1 >= 0) right = crossing(ri-1, ri);
      const widthPx = Math.max(0, right-left);
      const widthMm = widthPx / Math.max(0.0001, pxPerMm);
      return {
        valid:Number.isFinite(widthMm) && widthMm > 0,
        widthPx, widthMm, peak, baseline:localBaseline, halfLevel, left, right, amplitude
      };
    }

    // v31.74：弱 T 不再先被舊的 continuity / color 條件淘汰。
    // 在 3~6 mm 內保留局部峰，優先挑選具有合理 FWHM 的「線型峰」。
    // 目的：弱陽性即使顏色很淡，只要形成窄峰仍可進入 T/C 10% 判定；
    //      寬廣陰影則因 FWHM 過寬而降級。
    function bestWeakTPeak(range, fallback) {
      if (!range || range.start > range.end) return fallback || null;
      const start = clamp(Math.floor(range.start), 1, h-2);
      const end = clamp(Math.ceil(range.end), start, h-2);
      let bestPass = null, bestAny = null;
      for (let ly=start; ly<=end; ly++) {
        const v = Math.max(0, positive[ly] || 0);
        const vl = Math.max(0, positive[ly-1] || 0);
        const vr = Math.max(0, positive[ly+1] || 0);
        if (v < vl || v < vr) continue; // 只看局部峰頂

        const fw = measureFwhm(ly);
        const cont = rowLineContinuity(y0 + ly, 'faintT');
        const strength = bandStrength(ly);
        const amp = fw.valid ? Math.max(0, fw.amplitude || (fw.peak-fw.baseline)) : 0;
        const shapeOk = !!(fw.valid && fw.widthMm >= T_FWHM_MIN_MM && fw.widthMm <= T_FWHM_MAX_MM);
        const shapeBoost = amp * 1.35 +
          Math.min(2.0, (cont.run || 0) * 0.05) +
          (cont.ratio || 0) * 0.8 +
          (cont.redRatio || 0) * 0.8;
        const item = Object.assign({}, cont, {
          localY:ly, absY:y0+ly, profileScore:v, bandStrength:strength,
          totalScore:strength + shapeBoost, preFwhm:fw, preFwhmOk:shapeOk
        });
        if (!bestAny || item.totalScore > bestAny.totalScore) bestAny = item;
        if (shapeOk && (!bestPass || item.totalScore > bestPass.totalScore)) bestPass = item;
      }
      return bestPass || bestAny || fallback || null;
    }

    tCont = tRangeValid ? bestWeakTPeak(dynTRange, tCont) : null;
    const tFwhm = tCont ? (tCont.preFwhm || measureFwhm(tCont.localY)) : measureFwhm(NaN);
    const tFwhmOk = !!(tFwhm.valid &&
      tFwhm.widthMm >= T_FWHM_MIN_MM && tFwhm.widthMm <= T_FWHM_MAX_MM);

    // Debug 預期 T 位置放在允許區間中央，不參與最終判定。
    tExpectedLocalY = clamp(cAnchorY + ((T_MIN_GAP_MM + T_MAX_GAP_MM) * 0.5) * pxPerMm, 0, h-1);
    tExpectedAbsY = y0 + tExpectedLocalY;

    let cQ = bestPeakInBand('C', cSearchRange, cExpectedLocalY);
    let tQ = bestPeakInBand('T', dynTRange, tExpectedLocalY);
    if (cCont) { cQ.y=cCont.localY; cQ.score=Math.max(cQ.score||0,cCont.profileScore||0); }
    if (tCont) { tQ.y=tCont.localY; tQ.score=Math.max(tQ.score||0,tCont.profileScore||0); }

    const cGeometryOk = !!cCont && cCont.localY >= cSearchRange.start && cCont.localY <= cSearchRange.end;
    const cColorOk = !!cCont && ((cCont.redRatio||0) >= 0.020 || (cCont.redAvg||0) >= 0.95 || (cCont.contrastAvg||0) >= 0.42);
    const cDetected = !!(cCont && cCont.ok && cGeometryOk && cColorOk);

    const tGeometryOk = !!tCont && tCont.localY >= dynTRange.start && tCont.localY <= dynTRange.end;
    const ctGapPx = (cCont && tCont) ? (tCont.absY - cCont.absY) : -1;
    const ctGapMm = ctGapPx >= 0 ? (ctGapPx / Math.max(0.0001, pxPerMm)) : -1;
    const refinedSeparationOk = !!(cCont && tCont &&
      ctGapMm >= T_MIN_GAP_MM && ctGapMm <= T_MAX_GAP_MM);

    const cStrength = cCont ? bandStrength(cCont.localY) : 0;
    const tStrength = tCont ? bandStrength(tCont.localY) : 0;
    const tRelativeThreshold = cStrength * T_RELATIVE_C_RATIO;
    const tcStrengthRatio = cStrength > 0 ? (tStrength / cStrength) : 0;
    const tRelativeOk = !!(cDetected && tCont && cStrength > 0 && tStrength >= tRelativeThreshold);

    // 只保留非常寬鬆的「像一條水平線」保護，避免純大面積陰影。
    // 這不是固定顏色門檻；真正 Positive/Negative 的主要門檻是 T/C >= 10%。
    const tWeakHorizontalEvidence = !!tCont && (
      (tCont.run || 0) >= Math.max(2, Math.floor((tCont.minRun || 2) * 0.35)) ||
      (tCont.ratio || 0) >= 0.040 ||
      (tCont.redRatio || 0) >= 0.006 ||
      (tCont.redAvg || 0) >= 0.25 ||
      (tCont.contrastAvg || 0) >= 0.10
    );

    const tDetected = !!(cDetected && tCont && tGeometryOk && refinedSeparationOk && tRelativeOk && tFwhmOk);

    const tColorOk = tWeakHorizontalEvidence; // 保留既有 debug 欄位相容性
    const cSelected = !!cCont;
    const tSelected = !!tCont;
    const selected = [cQ,tQ].filter((q,i)=>i===0?cSelected:tSelected);
    const allPeaks = [cQ,tQ];
    const cRefineRange = Object.assign({}, cSearchRange);
    const tRefineRange = Object.assign({}, dynTRange);
    const cRed = cCont || refinePeakToRedLine(cQ.y, cRefineRange, 'C');
    const tRed = tCont || refinePeakToRedLine(tQ.y, tRefineRange, 'faintT');
    cQ.refinedLocalY = cCont ? cCont.localY : cQ.y;
    tQ.refinedLocalY = tCont ? tCont.localY : tQ.y;
    const tThreshold = tRelativeThreshold;
    const tcRatio = tcStrengthRatio;

    cQ.detected = cDetected;
    tQ.detected = tDetected;
    cQ.reject = !cCont ? 'no-horizontal-line' : !cGeometryOk ? 'outside-middle10-c-band' : !cCont.ok ? 'no-red-continuity' : !cColorOk ? 'weak-color' : 'PASS';
    tQ.reject = !tCont ? 'no-t-candidate' : !tGeometryOk ? 'outside-middle10-t-band' : !refinedSeparationOk ? 't-gap-outside-3-6mm' : !tRelativeOk ? 'below-10pct-of-c' : !tFwhm.valid ? 'fwhm-no-peak' : !tFwhmOk ? ('fwhm-outside-' + T_FWHM_MIN_MM.toFixed(2) + '-' + T_FWHM_MAX_MM.toFixed(2) + 'mm') : 'PASS';

    let result = 'Invalid';
    if (cDetected && tDetected) result = 'Positive';
    else if (cDetected && !tDetected) result = 'Negative';

    const cRange = {start:cRefineRange.start, end:cRefineRange.end};
    const tRange = {start:tRefineRange.start, end:tRefineRange.end};

    const peakDebug = allPeaks.map(p =>
      `${p.label} y=${(y0+p.y).toFixed(0)}, exp=${(p.expectedAbsY||0).toFixed(0)}, d=${(p.distanceFromExpected||0).toFixed(1)}, score=${p.score.toFixed(1)}, q=${(p.quality||0).toFixed(1)}, selected=${p.selected ? 'YES':'NO'}, reject=${p.reject}`
    );

    return {
      source:'ct-outer-middle10-v31-74-weak-t-peak',
      x0, x1, y0, y1, h,
      zone:{x:x0, y:y0, w:Math.max(1, x1-x0), h:Math.max(1, y1-y0), startRatio:ctStartRatio, endRatio:ctEndRatio, widthRatio:ctEndRatio-ctStartRatio, topThirdY:Math.round(topThirdY), topThirdPadding:topThirdPadding, yLimitedByTopThird:false, coordinateSystem:'cassette-30-10-30', qrSide:qSide, stripCenterX, cExpectedAbsY, tExpectedAbsY, bandHalf, locatorY0, locatorY1, pxPerMm, cassetteMm:CASSETTE_L_MM, stripTopMm:STRIP_TOP_MM, stripHeightMm:STRIP_H_MM, tMinGapMm:T_MIN_GAP_MM, tMaxGapMm:T_MAX_GAP_MM, tFwhmMinMm:T_FWHM_MIN_MM, tFwhmMaxMm:T_FWHM_MAX_MM, tRelativeCRatio:T_RELATIVE_C_RATIO, ctGapMm, cLocatorAbsY:null, cLocatorHasColor:false},
      raw, profile:positive, baseline:bg, rawBaseline, rawMedian, rawMax, pinkMax, darkMax, combinedMax, selectedMode, lumBackground, lumMedian, mean:stat.mean, std:stat.std,
      maxScore, threshold, tThreshold, tcRatio, cStrength, tStrength, tRelativeThreshold, tRelativeRatio:T_RELATIVE_C_RATIO, tWeakHorizontalEvidence,
      tFwhmMm:tFwhm.widthMm, tFwhmPx:tFwhm.widthPx, tFwhmValid:tFwhm.valid, tFwhmOk, tFwhmMinMm:T_FWHM_MIN_MM, tFwhmMaxMm:T_FWHM_MAX_MM, tFwhmPeak:tFwhm.peak, tFwhmBaseline:tFwhm.baseline, tFwhmHalfLevel:tFwhm.halfLevel,
      candidateFloor, minSep,
      cRange, tRange,
      cPeak:{y:cQ.y, absY:y0+cQ.y, score:cQ.score, detected:cDetected, selected:cSelected, redContinuity:cRed, width:cQ.width, left:y0+cQ.left, right:y0+cQ.right, drop:cQ.drop, sharpness:cQ.sharpness, shoulderRatio:cQ.shoulderRatio, shoulderMaxRatio:cQ.shoulderMaxRatio, nearShoulderRatio:cQ.nearShoulderRatio, quality:cQ.quality || 0, reject:cQ.reject, warning:cQ.warning || '-', maxWidth:cQ.maxWidth},
      tPeak:{y:tQ.y, absY:y0+tQ.y, score:tQ.score, detected:tDetected, selected:tSelected, redContinuity:tRed, width:tQ.width, left:y0+tQ.left, right:y0+tQ.right, drop:tQ.drop, sharpness:tQ.sharpness, shoulderRatio:tQ.shoulderRatio, shoulderMaxRatio:tQ.shoulderMaxRatio, nearShoulderRatio:tQ.nearShoulderRatio, quality:tQ.quality || 0, reject:tQ.reject, warning:tQ.warning || '-', maxWidth:tQ.maxWidth},
      rejectedPeaks:allPeaks.filter(p=>!p.detected).slice(0,6).map(p=>`y${(y0+p.y).toFixed(0)}:${p.reject}`),
      peakDebug,
      allPeakCount:allPeaks.length,
      selectedPeakCount:selected.length,
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
      const markerY = clamp(Math.round(p.absY), 2, H - 3);
      const markerX = clamp(Math.round(axisX), 2, W - 3);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(3, W/82);
      // Keep the real C/T pixels readable. The long guide stays outside the
      // physical window, while two short edge ticks show the exact sampled Y row.
      ctx.beginPath();
      ctx.moveTo(Math.max(2, win.x - W * 0.08), markerY);
      ctx.lineTo(Math.max(2, win.x - 2), markerY);
      ctx.moveTo(Math.min(W-2, win.x + win.w + 2), markerY);
      ctx.lineTo(axisX + waveW, markerY);
      ctx.stroke();

      if (ct.zone) {
        const zx0 = clamp(Math.round(ct.zone.x), 2, W - 3);
        const zx1 = clamp(Math.round(ct.zone.x + ct.zone.w), zx0 + 1, W - 2);
        const tick = Math.max(4, Math.round((zx1 - zx0) * 0.18));
        ctx.save();
        ctx.globalAlpha = 0.82;
        ctx.lineWidth = Math.max(1.5, W/170);
        ctx.setLineDash([3,2]);
        ctx.beginPath();
        ctx.moveTo(zx0, markerY); ctx.lineTo(Math.min(zx1, zx0 + tick), markerY);
        ctx.moveTo(Math.max(zx0, zx1 - tick), markerY); ctx.lineTo(zx1, markerY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Marker point sits on the waveform axis, not over the real C/T line.
      ctx.beginPath();
      ctx.arc(markerX, markerY, Math.max(5, W/32), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(1.5, W/180);
      ctx.stroke();

      // Large C/T badge at the left of the window so it remains readable
      // after the three-column image is scaled on a phone.
      const fontSize = Math.max(14, Math.round(W/17));
      const badgeW = Math.max(20, fontSize * 1.55);
      const badgeH = Math.max(20, fontSize * 1.45);
      const badgeX = clamp(win.x - badgeW - Math.max(5, W*0.025), 2, W - badgeW - 2);
      const badgeY = clamp(markerY - badgeH/2, 2, H - badgeH - 2);
      ctx.fillStyle = color;
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      ctx.font = `900 ${fontSize}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, badgeX + badgeW/2, badgeY + badgeH/2);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `800 ${Math.max(11, Math.round(W/22))}px "Segoe UI", sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(`${label} ${Math.round(p.score)}`, axisX + 3, clamp(markerY - 5, 12, H-5));
    }
    // v31.9：沒選到 Dynamic Peak 就不畫假 C/T 標線，避免標到空白處。
    if (ct.cPeak && ct.cPeak.detected) drawPeak(ct.cPeak, 'C', 'rgba(22,163,74,0.95)');
    if (ct.tPeak && ct.tPeak.detected) drawPeak(ct.tPeak, 'T', 'rgba(168,85,247,0.95)');

    if ((!ct.cPeak || !ct.cPeak.detected) && (!ct.tPeak || !ct.tPeak.detected)) {
      ctx.font = `${Math.max(9, Math.round(W/31))}px sans-serif`;
      ctx.fillStyle = 'rgba(220,38,38,0.90)';
      ctx.fillText('No CT peak selected', Math.max(2, axisX-2), Math.min(H-8, ct.y0+14));
    }

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

    // v31.78: QR defines cassette top; legacy S-direction guides removed.
    ctx.restore();

    // v31.78: Window/slot no longer used or drawn.

    // v31.4：青色框是實際 CT Analyze Zone；橘色波形只根據這個窄帶計算。
    if (f.ctAnalysis && f.ctAnalysis.zone) {
      const z = f.ctAnalysis.zone;
      ctx.save();
      ctx.strokeStyle = 'rgba(6,182,212,0.98)';
      ctx.fillStyle = 'rgba(6,182,212,0.98)';
      ctx.lineWidth = Math.max(1.5, W/210);
      ctx.strokeRect(z.x, z.y, z.w, z.h);
      ctx.font = `${Math.max(8, Math.round(W/34))}px sans-serif`;
      ctx.fillText('CT zone', z.x + 2, Math.max(10, z.y - 3));
      ctx.restore();
    }

    // v31.78: S well no longer used or drawn.
    if (f.window && f.ctAnalysis) drawCTWaveform(ctx, W, H, f.window, f.ctAnalysis);
  }

  function findInternalFeaturesOnCrop(cropCanvas, draw, forceQrTop, qrNorm) {
    const src = cv.imread(cropCanvas);
    const W = src.cols;
    const H = src.rows;
    const ctx = cropCanvas.getContext('2d');

    const directionAnalysis = analyzeThirdDirection(cropCanvas, W, H);
    if (forceQrTop) {
      directionAnalysis.rotate180 = false;
      directionAnalysis.direction = 'qr-top';
      directionAnalysis.chosenBox = directionAnalysis.bottom.box;
      directionAnalysis.chosenScore = directionAnalysis.bottom;
    }
    const chosen = makeFixedInternalByDirection(cropCanvas, W, H, directionAnalysis, !!forceQrTop);

    // No physical result window means no conclusive C/T result.
    const win = chosen.window || null;
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

    const ctAnalysis = analyzeCTLines(cropCanvas, win, qrNorm);

    const out = {
      window: win,
      sample,
      ctAnalysis,
      ctResult: ctAnalysis ? ctAnalysis.result : '-',
      windowSource: win ? win.source : 'not-detected',
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

  function detectInternalFeatures(cropCanvas, forceQrTop, qrNorm) {
    let f = findInternalFeaturesOnCrop(cropCanvas,false,forceQrTop,qrNorm);
    let orientationCorrected = false;

    if (!forceQrTop && f.needsRotation180) {
      rotateCanvas180(cropCanvas);
      orientationCorrected = true;
      f = findInternalFeaturesOnCrop(cropCanvas,false,false,qrNorm);
    }

    const finalF = findInternalFeaturesOnCrop(cropCanvas,true,forceQrTop,qrNorm);
    finalF.orientationCorrected = orientationCorrected;
    finalF.orientation = forceQrTop ? 'qr-top-window-below' : (finalF.chosenTemplate === 'normal' ? 'window-above-sample' : 'sample-above-window');
    finalF.orientationSource = forceQrTop ? 'qr-position' : 'sample-zone';
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
    const qrAnchored = !!(c.qrEnclosure && c.qrEnclosure.pass);

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

    // No manufacturer-specific aspect target. QR enclosure plus the actual
    // white boundary is the gate; aspect is retained only for debug.
    const ratioScore = qrAnchored ? 1.0 : 0.5;

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

    // Photo rotation is irrelevant once QR defines the physical top.
    const horizontalPenalty = qrAnchored ? 0 :
        (vertical.score < 0.25 ? 5600 :
        vertical.score < 0.45 ? 2600 : 0);

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
    // QR 已經把卡匣身份與位置錨定後，不再因為拍在畫面邊緣而重罰。
    // 新卡匣在實際照片中常佔畫面很小，且不一定完全置中。
    const edgePenalty = qrAnchored ? 0 :
        (centerScore < 0.22 ? 6200 :
        centerScore < 0.38 ? 3200 :
        centerScore < 0.52 ? 1200 :
        0);

    // v29.0：外框尺寸保護。
    // 判讀窗/試紙區本身也可能有紅線與橢圓形特徵，
    // 但它在整張照片中的面積會明顯小於真正卡匣外框。
    // 因此候選太小時即使有 Window/S Well，也不能當成外框。
    // 新卡匣批次中，遠拍時卡匣本體可能只有約 2~5% 畫面。
    // 若 QR 四角確實被候選外框包住，就把『小物件』懲罰大幅放寬；
    // 沒有 QR 錨定時仍保留原本嚴格防呆，避免把判讀窗當外框。
    const smallOuterPenalty = qrAnchored ?
        (areaRatio < 0.012 ? 12000 : areaRatio < 0.020 ? 3500 : 0) :
        (areaRatio < 0.020 ? 24000 : areaRatio < 0.030 ? 18000 : areaRatio < 0.050 ? 9000 : 0);

    const innerWindowPenalty = qrAnchored ? 0 :
        (areaRatio < 0.020 && c.ratio > 2.4 && c.ratio < 5.2 ? 12000 :
        areaRatio < 0.030 && c.ratio > 2.4 && c.ratio < 5.2 ? 6000 : 0);

    const score =
        areaScore * 4200 +
        ratioScore * 1300 +
        fillScore * 750 +
        (qrAnchored ? 3000 : vertical.score * 3000) +
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
        qrAnchored,
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
    let coloredBackground = 0;
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
        if(y < 215 && sat > 42) coloredBackground++;
    }

    const lightRatio = light / total;
    const midLightRatio = midLight / total;
    const darkRatio = dark / total;
    const veryDarkRatio = veryDark / total;
    const lowSatLightRatio = lowSatLight / total;
    const coloredBackgroundRatio = coloredBackground / total;

    function patchIsPlastic(cx, cy) {
        const rx = Math.max(2, Math.round(W * 0.07));
        const ry = Math.max(2, Math.round(H * 0.045));
        let good = 0, n = 0;
        for (let y=Math.max(0,cy-ry); y<Math.min(H,cy+ry); y+=2) {
            for (let x=Math.max(0,cx-rx); x<Math.min(W,cx+rx); x+=2) {
                const i=(y*W+x)*4, r=data[i], g=data[i+1], b=data[i+2];
                const lum=0.299*r+0.587*g+0.114*b;
                const sat=Math.max(r,g,b)-Math.min(r,g,b);
                if (lum >= 125 && sat <= 62) good++;
                n++;
            }
        }
        return good / Math.max(1,n);
    }
    const cornerPlastic = [
        patchIsPlastic(Math.round(W*.14),Math.round(H*.08)),
        patchIsPlastic(Math.round(W*.86),Math.round(H*.08)),
        patchIsPlastic(Math.round(W*.14),Math.round(H*.92)),
        patchIsPlastic(Math.round(W*.86),Math.round(H*.92))
    ];
    const plasticCornerCount = cornerPlastic.filter(v=>v>=0.58).length;

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
    if(coloredBackgroundRatio > 0.22) penalty += 6800;
    if(plasticCornerCount < 3) penalty += 9000;

    const trustedBrightCard =
        lowSatLightRatio >= 0.52 &&
        midLightRatio >= 0.62 &&
        darkRatio <= 0.25 &&
        veryDarkRatio <= 0.15 &&
        coloredBackgroundRatio <= 0.22 &&
        plasticCornerCount >= 3;

    return {
        score: bonus - penalty,
        bonus,
        penalty,
        lightRatio,
        midLightRatio,
        darkRatio,
        veryDarkRatio,
        lowSatLightRatio,
        coloredBackgroundRatio,
        cornerPlastic,
        plasticCornerCount,
        trustedBrightCard
    };
}

function candidateFeatureScore(srcCanvas, cand, qrCenter)
{
    const tmp =
        document.createElement('canvas');

    try
    {
        const qrOrientation = orientPointsWithQr(cand.pts, qrCenter || null);
        warpCropToCanvas(srcCanvas,tmp,qrOrientation.points,qrOrientation.applied);

        const appearance = candidateAppearanceScore(tmp);

        const f =
            findInternalFeaturesOnCrop(
                tmp,
                !!qrOrientation.applied
            );

        let score = appearance.score;

        const win = f && f.window;
        const sample = f && f.sample;

        const rawRedWindow =
            !!(win && win.source && win.source.includes('red-line-window'));

        const hasRedWindow =
            !!(rawRedWindow && appearance.trustedBrightCard);

        const hasRealWindow =
            !!(win && win.source && (win.source.includes('red-line-window') || win.source.includes('opencv-window-contour') || win.source.includes('qr-fixed-window-new-cassette')));

        const hasRealSample =
            !!(sample && sample.source && sample.source.includes('contour'));

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


  // v31.41：用 QR 尺寸直接產生 4 個「整支卡匣」幾何候選。
  // 這是為了解決白色卡匣放在白紙上時，外框 contour 很容易只抓到 QR 或結果槽。
  // QR 寬約為卡匣寬 64~67%，卡匣長約為 QR 邊長 5.2~5.5 倍。
  function buildQrCassetteTemplates(qrPoints, imgArea) {
    if (!Array.isArray(qrPoints) || qrPoints.length < 4) return [];
    const q = qrPoints.slice(0,4).map(p=>({x:Number(p.x),y:Number(p.y)}));
    if (q.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) return [];
    const center={x:q.reduce((a,p)=>a+p.x,0)/4,y:q.reduce((a,p)=>a+p.y,0)/4};

    // jsQR / BarcodeDetector 通常回傳相鄰四角。兩組平均邊向量可降低透視誤差。
    let ux=((q[1].x-q[0].x)+(q[2].x-q[3].x))*0.5;
    let uy=((q[1].y-q[0].y)+(q[2].y-q[3].y))*0.5;
    let vx=((q[3].x-q[0].x)+(q[2].x-q[1].x))*0.5;
    let vy=((q[3].y-q[0].y)+(q[2].y-q[1].y))*0.5;
    const un=Math.hypot(ux,uy), vn=Math.hypot(vx,vy);
    if (un < 4 || vn < 4) return [];
    const qSide=(un+vn)*0.5;
    ux/=un; uy/=un; vx/=vn; vy/=vn;

    // v31.54：不要再猜 4 個方向。jsQR 的 corner 順序是
    // TL, TR, BR, BL，因此 TL→BL（v+）就是 QR 圖樣的「下方」。
    // 本卡匣的 QR 印刷方向固定，卡匣本體永遠位於 QR 的下方；
    // 直接使用 v+ 可避免背景/螢幕被誤選成卡匣延伸方向。
    const dirs=[
      {x:vx,y:vy,name:'qr-dir-body-v+'}
    ];
    // v31.64: use measured physical geometry instead of empirical cassette/Q ratios.
    // Cassette = 70 x 20 mm, QR = 14 x 14 mm.
    const QR_MM=14.0;
    const CASSETTE_L_MM=70.0;
    const CASSETTE_W_MM=20.0;
    const L=qSide*(CASSETTE_L_MM/QR_MM);       // 5.000 Q
    const CW=qSide*(CASSETTE_W_MM/QR_MM);     // 1.42857 Q
    // Existing photos place QR center at about 11.5% of cassette length.
    // This only controls the displayed cassette frame; C/T analysis below is anchored directly to QR.
    const qrCenterFromTop=L*0.115;
    const out=[];
    for (const d of dirs) {
      // perp 的正負只影響左右，不影響物理 top/bottom。
      const px=d.y, py=-d.x;
      const topC={x:center.x-d.x*qrCenterFromTop,y:center.y-d.y*qrCenterFromTop};
      const botC={x:topC.x+d.x*L,y:topC.y+d.y*L};
      const pts=[
        {x:topC.x-px*CW/2,y:topC.y-py*CW/2},
        {x:topC.x+px*CW/2,y:topC.y+py*CW/2},
        {x:botC.x+px*CW/2,y:botC.y+py*CW/2},
        {x:botC.x-px*CW/2,y:botC.y-py*CW/2}
      ];
      out.push({
        method:d.name,
        rect:{center:{x:(topC.x+botC.x)/2,y:(topC.y+botC.y)/2},size:{width:CW,height:L},angle:Math.atan2(d.y,d.x)*180/Math.PI},
        pts,
        ratio:L/Math.max(1,CW), fill:0.72,
        rectArea:CW*L, area:CW*L*0.72,
        areaRatio:(CW*L)/Math.max(1,imgArea),
        score:CW*L,
        qrTemplate:true
      });
    }
    return out;
  }

  function qrSizeGate(cand, qrPoints) {
    if (!Array.isArray(qrPoints) || qrPoints.length < 4) return {pass:true, reason:'qr-size-unavailable'};
    const q=qrPoints.slice(0,4);
    const ds=[];
    for(let i=0;i<4;i++) for(let j=i+1;j<4;j++) ds.push(dist(q[i],q[j]));
    ds.sort((a,b)=>a-b);
    const qSide=(ds[0]+ds[1]+ds[2]+ds[3])/4;
    const rw=cand.rect && cand.rect.size ? cand.rect.size.width : 0;
    const rh=cand.rect && cand.rect.size ? cand.rect.size.height : 0;
    const shortSide=Math.min(rw,rh), longSide=Math.max(rw,rh);
    if (!qSide || !shortSide || !longSide) return {pass:false,reason:'qr-size-invalid'};
    const longQ=longSide/qSide, shortQ=shortSide/qSide;
    // 真卡匣約 long=5.35Q / short=1.55Q。放寬透視與 contour 誤差，
    // 但明確排除「只框 QR」及「QR + 一小段塑膠」的候選。
    const pass=longQ>=3.55 && longQ<=7.4 && shortQ>=1.08 && shortQ<=2.65;
    return {pass,reason:pass?'PASS':`bad-qr-scale L=${longQ.toFixed(2)}Q W=${shortQ.toFixed(2)}Q`,qSide,longQ,shortQ};
  }






  // v31.66：在 contour 候選選定後，再用原圖真正的亮/暗邊界把四邊「吸附」到卡匣外緣。
  // QR 仍只負責方向；這個步驟不使用 QR 尺寸推算卡匣長度。
  function refineOuterByImageEdges(canvas, pts, qrCenter) {
    try {
      if (!canvas || !Array.isArray(pts) || pts.length !== 4) return null;
      const oriented = orientPointsWithQr(pts, qrCenter || null);
      const p = oriented.points; // TL,TR,BR,BL；QR 端應在 top
      if (!p || p.length !== 4) return null;

      const ctx = canvas.getContext('2d', {willReadFrequently:true});
      const W = canvas.width, H = canvas.height;
      const im = ctx.getImageData(0,0,W,H).data;

      const topMid={x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2};
      const botMid={x:(p[3].x+p[2].x)/2,y:(p[3].y+p[2].y)/2};
      const leftMid={x:(p[0].x+p[3].x)/2,y:(p[0].y+p[3].y)/2};
      const rightMid={x:(p[1].x+p[2].x)/2,y:(p[1].y+p[2].y)/2};
      const cx=(topMid.x+botMid.x)/2, cy=(topMid.y+botMid.y)/2;

      let vx=botMid.x-topMid.x, vy=botMid.y-topMid.y;
      let ux=rightMid.x-leftMid.x, uy=rightMid.y-leftMid.y;
      const L=Math.max(1,Math.hypot(vx,vy)), CW=Math.max(1,Math.hypot(ux,uy));
      vx/=L; vy/=L; ux/=CW; uy/=CW;
      const halfL=L/2, halfW=CW/2;

      function rgbAt(x,y){
        const xx=Math.max(0,Math.min(W-1,Math.round(x))), yy=Math.max(0,Math.min(H-1,Math.round(y)));
        const i=(yy*W+xx)*4;
        return [im[i],im[i+1],im[i+2]];
      }
      function sideScore(axis, pos, tangentHalf, insideSign){
        // 比較邊界內外約 2~4px 的 RGB 差；同時偏好「卡匣內側較亮」。
        const normal = axis==='v' ? {x:vx,y:vy} : {x:ux,y:uy};
        const tangent = axis==='v' ? {x:ux,y:uy} : {x:vx,y:vy};
        const base={x:cx+normal.x*pos,y:cy+normal.y*pos};
        const d=Math.max(2,Math.min(5,Math.round(Math.min(CW,L)*0.018)));
        let diff=0, bright=0, n=0;
        for(let k=-12;k<=12;k++){
          const t=(k/12)*tangentHalf;
          const bx=base.x+tangent.x*t, by=base.y+tangent.y*t;
          const a=rgbAt(bx-normal.x*d, by-normal.y*d);
          const b=rgbAt(bx+normal.x*d, by+normal.y*d);
          const dr=a[0]-b[0], dg=a[1]-b[1], db=a[2]-b[2];
          diff += Math.sqrt(dr*dr+dg*dg+db*db);
          const la=.299*a[0]+.587*a[1]+.114*a[2];
          const lb=.299*b[0]+.587*b[1]+.114*b[2];
          // insideSign<0 => negative side is inside; >0 => positive side is inside
          bright += insideSign<0 ? (la-lb) : (lb-la);
          n++;
        }
        return n ? diff/n + Math.max(-8,Math.min(20,bright/n))*0.45 : 0;
      }
      function search(axis, expected, span, tangentHalf, insideSign){
        let best={pos:expected,score:-1e9};
        const step=Math.max(1,Math.min(3,Math.round(Math.min(CW,L)/180)));
        for(let s=expected-span;s<=expected+span;s+=step){
          const sc=sideScore(axis,s,tangentHalf,insideSign);
          const proximity=Math.abs(s-expected)/Math.max(1,span);
          const total=sc - proximity*5.0;
          if(total>best.score) best={pos:s,score:total,raw:sc};
        }
        return best;
      }

      const top=search('v',-halfL,Math.max(8,L*0.13),CW*0.30,+1);   // inside 朝 +v
      const bottom=search('v',halfL,Math.max(8,L*0.16),CW*0.30,-1); // inside 朝 -v
      const left=search('u',-halfW,Math.max(5,CW*0.22),L*0.30,+1);  // inside 朝 +u
      const right=search('u',halfW,Math.max(5,CW*0.22),L*0.30,-1); // inside 朝 -u

      const rawL=bottom.pos-top.pos, newW=right.pos-left.pos;
      if(rawL < L*0.70 || rawL > L*1.28 || newW < CW*0.68 || newW > CW*1.30) return null;

      // v31.67：卡匣實體 70x20 mm，外框長寬比必須是 3.50。
      // 不再讓 top/bottom 各自搜尋後形成 2.7~4.6 的任意長度；那會把桌面陰影/內部結構吃進外框。
      // 先由較穩定的左右邊取得實際寬度，再以固定 3.50 倍長度成對搜尋上下邊。
      const targetL = newW * 3.50;
      const rawCenterV = (top.pos + bottom.pos) / 2;
      let pair={center:rawCenterV,score:-1e9,top:null,bottom:null};
      const centerSpan=Math.max(6,Math.min(L*0.16,targetL*0.12));
      const centerStep=Math.max(1,Math.round(newW/90));
      for(let cc=rawCenterV-centerSpan;cc<=rawCenterV+centerSpan;cc+=centerStep){
        const tp=cc-targetL/2, bp=cc+targetL/2;
        const ts=sideScore('v',tp,newW*0.30,+1);
        const bs=sideScore('v',bp,newW*0.30,-1);
        // QR 端(top)通常很清楚，稍提高 top 權重；同時避免離原候選中心太遠。
        const prox=Math.abs(cc-rawCenterV)/Math.max(1,centerSpan);
        const sc=ts*1.08+bs-prox*4.0;
        if(sc>pair.score) pair={center:cc,score:sc,top:{pos:tp,raw:ts},bottom:{pos:bp,raw:bs}};
      }
      const top2=pair.top||top, bottom2=pair.bottom||bottom;
      const newL=targetL, ratio=3.50;
      const c2={x:cx+vx*pair.center+ux*((left.pos+right.pos)/2),
                y:cy+vy*pair.center+uy*((left.pos+right.pos)/2)};
      const hL=newL/2, hW=newW/2;
      const np=[
        {x:c2.x-vx*hL-ux*hW,y:c2.y-vy*hL-uy*hW},
        {x:c2.x-vx*hL+ux*hW,y:c2.y-vy*hL+uy*hW},
        {x:c2.x+vx*hL+ux*hW,y:c2.y+vy*hL+uy*hW},
        {x:c2.x+vx*hL-ux*hW,y:c2.y+vy*hL-uy*hW}
      ];
      // QR 必須仍被包含；否則不要接受 snap。
      const fake={pts:np};
      const enc=qrEnclosureMetrics(fake, qrCenter || null, []);
      if(qrCenter && !enc.pass) return null;
      return {pts:np, ratio, oldL:L,oldW:CW,newL,newW,top:top2,bottom:bottom2,left,right,applied:true,aspectLocked:true};
    } catch(e) { console.warn('edge snap failed',e); return null; }
  }



  // v31.78: QR-guided OpenCV outer-frame geometry.
  // QR = 14x14 mm, cassette = 70x20 mm, QR is always at the cassette top.
  function qrGuidedOuterMetrics(cand, qrCenter, qrPoints) {
    if (!cand || !qrCenter || !Array.isArray(qrPoints) || qrPoints.length < 4)
      return {pass:false, reason:'qr-geometry-missing', score:0};
    const qp=qrPoints.slice(0,4);
    const qEdges=[];
    for(let i=0;i<4;i++) qEdges.push(dist(qp[i], qp[(i+1)%4]));
    const qSide=qEdges.reduce((a,b)=>a+b,0)/4;
    if (!Number.isFinite(qSide) || qSide < 4) return {pass:false,reason:'qr-side-invalid',score:0};

    const op=orientPointsWithQr(cand.pts, qrCenter);
    const pts=op && op.points ? op.points : orderPoints(cand.pts||[]);
    if (!pts || pts.length!==4) return {pass:false,reason:'outer-points-invalid',score:0};
    const top={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
    const bottom={x:(pts[3].x+pts[2].x)/2,y:(pts[3].y+pts[2].y)/2};
    const left={x:(pts[0].x+pts[3].x)/2,y:(pts[0].y+pts[3].y)/2};
    const right={x:(pts[1].x+pts[2].x)/2,y:(pts[1].y+pts[2].y)/2};
    let lx=bottom.x-top.x, ly=bottom.y-top.y;
    let wx=right.x-left.x, wy=right.y-left.y;
    const L=Math.max(1,Math.hypot(lx,ly)), W=Math.max(1,Math.hypot(wx,wy));
    lx/=L; ly/=L; wx/=W; wy/=W;

    let qdx=((qp[3].x-qp[0].x)+(qp[2].x-qp[1].x))*0.5;
    let qdy=((qp[3].y-qp[0].y)+(qp[2].y-qp[1].y))*0.5;
    const qdn=Math.max(1,Math.hypot(qdx,qdy)); qdx/=qdn; qdy/=qdn;
    const dot=clamp(lx*qdx+ly*qdy,-1,1);
    const angleDiff=Math.acos(Math.abs(dot))*180/Math.PI;

    const longQ=L/qSide, shortQ=W/qSide, aspect=L/W;
    const qrFromTop=((qrCenter.x-top.x)*lx+(qrCenter.y-top.y)*ly)/L;
    const mid={x:(top.x+bottom.x)/2,y:(top.y+bottom.y)/2};
    const lateral=((qrCenter.x-mid.x)*wx+(qrCenter.y-mid.y)*wy)/W;
    const eL=Math.abs(longQ-5.0)/5.0;
    const eW=Math.abs(shortQ-(20/14))/(20/14);
    const eA=Math.abs(aspect-3.5)/3.5;
    const eY=Math.abs(qrFromTop-0.115)/0.115;
    const eX=Math.abs(lateral);
    const pass = longQ>=4.05 && longQ<=6.15 && shortQ>=1.12 && shortQ<=1.92 &&
      aspect>=2.85 && aspect<=4.25 && angleDiff<=18 &&
      qrFromTop>=0.035 && qrFromTop<=0.24 && eX<=0.24;
    const score=Math.max(0, 30000 - eL*12000 - eW*10000 - eA*7000 -
      Math.min(1,eY)*3500 - Math.min(1,eX/0.24)*2500 - Math.min(1,angleDiff/18)*2500);
    return {pass,score,qSide,longQ,shortQ,aspect,angleDiff,qrFromTop,lateral,
      reason:pass?'PASS':`QR-geometry mismatch L=${longQ.toFixed(2)}Q W=${shortQ.toFixed(2)}Q AR=${aspect.toFixed(2)} angle=${angleDiff.toFixed(1)} top=${qrFromTop.toFixed(3)} lat=${lateral.toFixed(3)}`};
  }

  function detectOuterFrame(canvas, cropCanvas, options) {
    if (typeof cv === 'undefined' || !cv.Mat) return {version:VERSION,ok:false,reason:'opencv-not-ready'};
    options = Object.assign({ minAreaRatio:0.01, ratioMin:1.20, ratioMax:10.0 }, options||{});
    const ctx=canvas.getContext('2d'); const src=cv.imread(canvas); const imgArea=src.cols*src.rows;
    const rawCands=collectOuterCandidates(src, options);
    const qrCenter=options.qrCenter || null;
    const qrPoints=Array.isArray(options.qrPoints) ? options.qrPoints : [];
    // v31.65：QR 只負責辨別方向，不再用 QR 尺寸硬推整支卡匣外框。
    // 最終綠框優先使用影像中真正的卡匣外緣 contour；只有完全找不到可信外框時，
    // 才使用 QR 幾何 template 當 fallback。這樣 70mm 的長度不會放大 QR 尺寸誤差。
    const qrTemplates=buildQrCassetteTemplates(qrPoints,imgArea);
    const qrDirectMode=false;
    let rawQualified=[];
    for (const c of rawCands) {
      c.qrEnclosure=qrEnclosureMetrics(c,qrCenter,qrPoints);
      c.qrGuide=qrGuidedOuterMetrics(c,qrCenter,qrPoints);
      if (c.qrEnclosure.pass && c.qrGuide.pass) rawQualified.push(c);
    }
    const allCands=rawQualified.slice();
    const qrRejected=[];
    const enclosingCands=[];
    for (const c of allCands) {
      c.qrEnclosure=c.qrEnclosure || qrEnclosureMetrics(c,qrCenter,qrPoints);
      c.qrGuide=c.qrGuide || qrGuidedOuterMetrics(c,qrCenter,qrPoints);
      c.qrScale={pass:c.qrGuide.pass,reason:c.qrGuide.reason,qSide:c.qrGuide.qSide,longQ:c.qrGuide.longQ,shortQ:c.qrGuide.shortQ};
      if (c.qrEnclosure.pass && c.qrGuide.pass) enclosingCands.push(c);
      else qrRejected.push(c);
    }
    // v31.75: if image contour gating rejects the only cassette even though QR is valid,
    // fall back to the physically known QR->70x20 mm cassette geometry.
    // This does NOT replace a valid contour candidate; it is used only when none survives.
    let qrGeometryBackupUsed=false;
    if (!enclosingCands.length && qrTemplates.length && options.qrGeometryBackup !== false) {
      for (const t of qrTemplates) {
        t.qrEnclosure={pass:true,reason:'qr-geometry-backup',minClearance:0};
        t.qrScale={pass:true,reason:'qr-geometry-backup'};
        t.qrGuide={pass:true,score:16000,reason:'qr-template-backup',longQ:5.0,shortQ:20/14,aspect:3.5,angleDiff:0,qrFromTop:0.115,lateral:0};
        t.qrGeometryBackup=true;
        enclosingCands.push(t);
      }
      qrGeometryBackupUsed=true;
    }
    const scored=[];
    for(const c of enclosingCands.slice(0,18)){
      const geo=outerGeometryScore(c,imgArea,src.cols,src.rows);
      const guide=c.qrGuide || qrGuidedOuterMetrics(c,qrCenter,qrPoints);
      c.outerScore=geo.score; c.outerDetail=geo;
      c.featureScore=0; c.featureDetail=null; c.featureAlign=0; c.appearanceDetail=null;
      c.hasRedWindow=false; c.hasRealWindow=false; c.hasRealSample=false;
      const contourBonus=c.qrTemplate ? 0 : 4500;
      c.totalScore=(guide.score||0) + geo.score*0.35 + contourBonus;
      scored.push(c);
    }
    scored.sort((a,b)=>b.totalScore-a.totalScore);
    const best=scored[0];

    // v31.66：候選選定後，把四邊吸附到原圖真正卡匣邊緣。
    // 這只修正外框/透視，不會用 QR 尺寸硬算 70 mm。
    if (best && !best.qrTemplate) {
      const snap=refineOuterByImageEdges(canvas,best.pts,qrCenter);
      if (snap && snap.applied) {
        const trial={pts:snap.pts,rect:{center:{x:(snap.pts[0].x+snap.pts[2].x)/2,y:(snap.pts[0].y+snap.pts[2].y)/2},size:{width:snap.newW,height:snap.newL},angle:Math.atan2(snap.pts[3].y-snap.pts[0].y,snap.pts[3].x-snap.pts[0].x)*180/Math.PI}};
        const gm=qrGuidedOuterMetrics(trial,qrCenter,qrPoints);
        if (gm.pass) {
          best.edgeSnap=snap; best.pts=snap.pts; best.ratio=snap.ratio; best.rectArea=snap.newL*snap.newW; best.rect=trial.rect; best.qrGuide=gm;
        } else best.edgeSnap={applied:false,reason:'rejected-by-qr-geometry',attempt:gm};
      }
    }

    ctx.save(); ctx.lineWidth=Math.max(3,canvas.width/250);
    // v31.0：Original Image 只畫最後選到的大外框，避免候選框造成誤會。
    if(best) drawPolygon(ctx,best.pts,'rgba(22,163,74,0.95)',ctx.lineWidth+1);
    ctx.restore();

    let result;
    if(best){
      let features=null;
      const qrOrientation = orientPointsWithQr(best.pts, options.qrCenter || null);

      // v31.62：先完成透視校正，再建立 QR local coordinate。
      // 若最終外框來自 QR template，標準化後 QR 的位置/尺寸直接由已知幾何常數決定，
      // 不再由外框 contour 長度反推，因此外框邊緣即使在原圖上不清楚也不會讓 CT ROI 漂移。
      let qrNorm = null;
      try{
        warpCropToCanvas(canvas,cropCanvas,qrOrientation.points,qrOrientation.applied);
        const qp = Array.isArray(options.qrPoints) ? options.qrPoints : [];
        const qc = options.qrCenter || null;
        const cp = qrOrientation.points; // TL,TR,BR,BL
        const outW=cropCanvas.width, outH=cropCanvas.height;

        if (best.qrTemplate && qp.length >= 4) {
          const sideByW=outW/(20.0/14.0);
          const sideByH=outH/(70.0/14.0);
          qrNorm={
            cx:outW*0.50,
            cy:outH*0.115,
            side:(sideByW+sideByH)*0.5,
            source:'qr-direct-template-v3162'
          };
        } else if (qc && qp.length >= 4 && cp && cp.length === 4) {
          const topMid={x:(cp[0].x+cp[1].x)/2,y:(cp[0].y+cp[1].y)/2};
          const botMid={x:(cp[3].x+cp[2].x)/2,y:(cp[3].y+cp[2].y)/2};
          const leftMid={x:(cp[0].x+cp[3].x)/2,y:(cp[0].y+cp[3].y)/2};
          const rightMid={x:(cp[1].x+cp[2].x)/2,y:(cp[1].y+cp[2].y)/2};
          const lx=botMid.x-topMid.x, ly=botMid.y-topMid.y, ll=Math.max(1,Math.hypot(lx,ly));
          const wx=rightMid.x-leftMid.x, wy=rightMid.y-leftMid.y, wl=Math.max(1,Math.hypot(wx,wy));
          const along=((qc.x-topMid.x)*lx+(qc.y-topMid.y)*ly)/(ll*ll);
          const across=((qc.x-leftMid.x)*wx+(qc.y-leftMid.y)*wy)/(wl*wl);
          const qLens=[]; for(let i=0;i<4;i++){const a=qp[i],b=qp[(i+1)%4];qLens.push(Math.hypot(a.x-b.x,a.y-b.y));}
          const qSrc=qLens.reduce((a,b)=>a+b,0)/Math.max(1,qLens.length);
          const sideByW=qSrc/wl*outW, sideByH=qSrc/ll*outH;
          qrNorm={cx:across*outW,cy:along*outH,side:(sideByW+sideByH)*0.5,source:'qr-measured-fallback'};
        }
        features=detectInternalFeatures(cropCanvas,qrOrientation.applied,qrNorm);
        if (features) { features.qrOrientation = qrOrientation; best.featureDetail = features; }
      } catch(e){ console.error(e); }

      // v29.1 final gate 修正：
      // v29.0 會把「已找到正確外框 + red-line-window」的候選誤殺，
      // 因為 S Well 若是 fallback 就被 no-real-window-or-sample 擋掉。
      // 這裡把可信紅線視窗當成可信特徵；S Well 沒找到時仍可判定外框成功，但 UI 會提示 S Well 尚未確認。
      const bestAreaRatio = best.rectArea / Math.max(1, imgArea);
      const guideFinal = best.qrTemplate ? (best.qrGuide||{pass:true}) : qrGuidedOuterMetrics(best,qrCenter,qrPoints);
      const bestOuterGeometryOk = !!(guideFinal && guideFinal.pass);
      const bestAppearanceOk = true;
      const bestCenterOk = true;
      const bestHasTrustedRedWindow = false;
      const bestHasRealSample = false;
      const bestHasTrustedFeature = false;
      const forceOkByFinalGate = bestOuterGeometryOk;
      const forceOkByStrongCandidate = false;
      const outerOnlyOk = bestOuterGeometryOk;
      const bestOk = bestOuterGeometryOk;
      const partialMessage = false;

      let failReason = '';
      if(!bestOuterGeometryOk) failReason = (guideFinal && guideFinal.reason) ? guideFinal.reason : 'qr-guided-outer-geometry-fail';
      else failReason = 'PASS';

let dbg='';

dbg += '<b>Debug Summary</b><br>';
dbg += 'White Mask: generated<br>';
dbg += 'Edge: generated<br>';
dbg += 'Bright Foreground: included as candidate source<br>';
dbg += 'Raw Candidates: ' + rawCands.length + '<br>';
dbg += 'QR template candidates: ' + qrTemplates.length + '<br>';
dbg += 'All Candidates: ' + allCands.length + '<br>';
dbg += 'QR-enclosing cassette candidates: ' + enclosingCands.length + '<br>';
if (qrGeometryBackupUsed) dbg += '<b>QR Geometry Backup: USED (70x20 mm from QR)</b><br>';
else dbg += 'QR Geometry Backup: not needed<br>';
dbg += 'QR rejected candidates: ' + qrRejected.length + '<br>';
if (qrRejected.length) dbg += 'QR rejection detail: ' + qrRejected.slice(0,8).map(c=>`${c.method}:${c.qrEnclosure.reason},clear=${c.qrEnclosure.minClearance.toFixed(1)}`).join(' | ') + '<br>';
dbg += 'Scored Candidates: ' + scored.length + '<br>';
dbg += '<b>Outer Mode: QR-Guided OpenCV (Window/S well NOT used)</b><br>';
      dbg += 'Final Gate: QR geometry=' + (bestOuterGeometryOk ? 'PASS' : 'FAIL') + '<br>';
      if (guideFinal) dbg += `QR Guide: L=${Number(guideFinal.longQ||5).toFixed(2)}Q / W=${Number(guideFinal.shortQ||20/14).toFixed(2)}Q / AR=${Number(guideFinal.aspect||3.5).toFixed(2)} / angle=${Number(guideFinal.angleDiff||0).toFixed(1)}° / QR top=${Number(guideFinal.qrFromTop||0.115).toFixed(3)} / lateral=${Number(guideFinal.lateral||0).toFixed(3)}<br>`;
dbg += 'UI Status: ' + (bestOk ? 'PASS - QR Guided Outer' : 'FAIL') + '<br>';
dbg += 'Detection Mode: QR defines TOP / OpenCV finds OUTER / CT uses physical 70mm coordinate<br>';
dbg += 'Outer Anchor: ' + (best && best.qrTemplate ? 'QR template fallback' : 'Contour + image edge snap') + '<br>';
if (best && best.edgeSnap && best.edgeSnap.applied) dbg += 'Edge Snap: APPLIED / L ' + best.edgeSnap.oldL.toFixed(1) + '→' + best.edgeSnap.newL.toFixed(1) + ' / W ' + best.edgeSnap.oldW.toFixed(1) + '→' + best.edgeSnap.newW.toFixed(1) + '<br>';
else if (best && best.edgeSnap && best.edgeSnap.reason) dbg += 'Edge Snap: rejected (' + best.edgeSnap.reason + ')<br>';
else dbg += 'Edge Snap: not applied<br>';
dbg += 'Final Reason: ' + (bestOk ? 'qr-guided-opencv-outer-ok' : failReason) + '<br>';
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
    Candidate Score=${Math.round(c.totalScore)} / QRTemplate=${c.qrTemplate ? 'YES':'NO'} / CBonus=${Math.round(c.cLineBonus||0)} / TBonus=${Math.round(c.tLineBonus||0)}<br>
    Outer Score=${Math.round(c.outerScore||0)}<br>
    Feature Score=${Math.round(c.featureScore||0)}<br>
    No Real S Penalty=${Math.round(c.noRealSamplePenalty||0)}<br>
    No Trusted Feature Penalty=${Math.round(c.noTrustedFeaturePenalty||0)}<br>
    Red Window=${c.hasRedWindow ? 'YES' : 'NO'} / Raw Red=${c.rawRedWindow ? 'YES' : 'NO'} / Real Sample=${c.hasRealSample ? 'YES' : 'NO'}<br>
    Appearance=${c.appearanceDetail ? (c.appearanceDetail.trustedBrightCard ? 'PASS' : 'FAIL') : '-'} / LowSatLight=${c.appearanceDetail ? c.appearanceDetail.lowSatLightRatio.toFixed(2) : '-'} / MidLight=${c.appearanceDetail ? c.appearanceDetail.midLightRatio.toFixed(2) : '-'} / Dark=${c.appearanceDetail ? c.appearanceDetail.darkRatio.toFixed(2) : '-'} / ColoredBG=${c.appearanceDetail ? c.appearanceDetail.coloredBackgroundRatio.toFixed(2) : '-'} / PlasticCorners=${c.appearanceDetail ? c.appearanceDetail.plasticCornerCount+'/4' : '-'} / Penalty=${c.appearanceDetail ? Math.round(c.appearanceDetail.penalty) : '-'}<br>
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
      dbg += `RawBaseline=${(ct.rawBaseline || 0).toFixed(1)} / RawMedian=${(ct.rawMedian || 0).toFixed(1)} / RawMax=${(ct.rawMax || 0).toFixed(1)}<br>PinkMax=${(ct.pinkMax || 0).toFixed(1)} / DarkMax=${(ct.darkMax || 0).toFixed(1)} / CombinedMax=${(ct.combinedMax || 0).toFixed(1)} / Mode=${ct.selectedMode || '-'}<br>`;
      if (!(ct.selectedPeakCount || 0)) dbg += `<b style="color:#dc2626">No CT peak selected：C/T guide lines are hidden.</b><br>`;
      if (ct.zone) dbg += `CT Analyze Zone=x${ct.zone.x}, y${ct.zone.y}, w=${ct.zone.w}, h=${ct.zone.h} / ratio=${(ct.zone.widthRatio*100).toFixed(1)}% / xRatio=${(ct.zone.startRatio*100).toFixed(1)}-${(ct.zone.endRatio*100).toFixed(1)}%<br>`;
      dbg += `Dynamic Peaks=${ct.allPeakCount || 0} / Selected=${ct.selectedPeakCount || 0} / CandidateFloor=${(ct.candidateFloor || 0).toFixed(1)} / MinSep=${ct.minSep || 0}<br>`;
      dbg += `C Score=${ct.cPeak.score.toFixed(1)} / C Y=${ct.cPeak.absY.toFixed(0)} / C Detected=${ct.cPeak.detected ? 'YES' : 'NO'} / C Selected=${ct.cPeak.selected ? 'YES' : 'NO'} / C Range=${ct.cRange.start}-${ct.cRange.end}<br>`;
      dbg += `C Red Continuity=${ct.cPeak.redContinuity.ok ? 'YES' : 'NO'} / Run=${ct.cPeak.redContinuity.run}/${ct.cPeak.redContinuity.minRun} / Ratio=${ct.cPeak.redContinuity.ratio.toFixed(2)}<br>`;
      dbg += `C Width=${ct.cPeak.width} / HalfWidth=${ct.cPeak.halfWidth || ct.cPeak.width} / MaxWidth=${ct.cPeak.maxWidth} / Drop=${ct.cPeak.drop.toFixed(1)} / Sharpness=${ct.cPeak.sharpness.toFixed(2)} / Quality=${(ct.cPeak.quality || 0).toFixed(1)} / Shoulder=${ct.cPeak.shoulderRatio.toFixed(2)} / NearShoulder=${ct.cPeak.nearShoulderRatio.toFixed(2)} / Reject=${ct.cPeak.reject}<br>`;
      dbg += `T Score=${ct.tPeak.score.toFixed(1)} / T Y=${ct.tPeak.absY.toFixed(0)} / T Detected=${ct.tPeak.detected ? 'YES' : 'NO'} / T Selected=${ct.tPeak.selected ? 'YES' : 'NO'} / T Range=${ct.tRange.start}-${ct.tRange.end}<br>`;
      dbg += `T Relative Threshold=${ct.tThreshold.toFixed(1)} / T/C Ratio=${ct.tcRatio.toFixed(2)}<br>`;
      dbg += `T FWHM=${Number.isFinite(ct.tFwhmMm) ? ct.tFwhmMm.toFixed(3) : '-'} mm / ${Number.isFinite(ct.tFwhmPx) ? ct.tFwhmPx.toFixed(2) : '-'} px / Gate=${ct.tFwhmOk ? 'PASS' : 'FAIL'} / Range=${Number.isFinite(ct.tFwhmMinMm) ? ct.tFwhmMinMm.toFixed(2) : '0.15'}~${Number.isFinite(ct.tFwhmMaxMm) ? ct.tFwhmMaxMm.toFixed(2) : '1.50'} mm<br>`;
      dbg += `T FWHM Baseline=${Number.isFinite(ct.tFwhmBaseline) ? ct.tFwhmBaseline.toFixed(2) : '-'} / Peak=${Number.isFinite(ct.tFwhmPeak) ? ct.tFwhmPeak.toFixed(2) : '-'} / Half=${Number.isFinite(ct.tFwhmHalfLevel) ? ct.tFwhmHalfLevel.toFixed(2) : '-'}<br>`;
      dbg += `T Red Continuity=${ct.tPeak.redContinuity.ok ? 'YES' : 'NO'} / Run=${ct.tPeak.redContinuity.run}/${ct.tPeak.redContinuity.minRun} / Ratio=${ct.tPeak.redContinuity.ratio.toFixed(2)}<br>`;
      dbg += `T Width=${ct.tPeak.width} / HalfWidth=${ct.tPeak.halfWidth || ct.tPeak.width} / MaxWidth=${ct.tPeak.maxWidth} / Drop=${ct.tPeak.drop.toFixed(1)} / Sharpness=${ct.tPeak.sharpness.toFixed(2)} / Quality=${(ct.tPeak.quality || 0).toFixed(1)} / Shoulder=${ct.tPeak.shoulderRatio.toFixed(2)} / NearShoulder=${ct.tPeak.nearShoulderRatio.toFixed(2)} / Reject=${ct.tPeak.reject}<br>`;
      if (ct.rejectedPeaks && ct.rejectedPeaks.length) dbg += `Rejected Peaks=${ct.rejectedPeaks.join(', ')}<br>`;
      if (ct.peakDebug && ct.peakDebug.length) dbg += `Peak Candidates：${ct.peakDebug.join(' | ')}<br>`;
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
    reason:bestOk ? ((best.qrGeometryBackup ? 'qr-geometry-backup+' : '') + best.method + '+qr-guided-opencv-pass') : ((best.qrGeometryBackup ? 'qr-geometry-backup+' : '') + failReason),
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
    outerPoints: Array.isArray(best.pts) ? best.pts.map(p => ({x:Number(p.x), y:Number(p.y)})) : [],
    debug:dbg
};


    } else {
      cropCanvas.width=1; cropCanvas.height=1; result={version:VERSION,ok:false,reason:(rawCands.length && !enclosingCands.length)?'no-qr-guided-outer-contour':'no-candidate',candidates:enclosingCands.length,rawCandidates:rawCands.length};
    }
    src.delete(); return result;
  }

  window.AsapOuterDetector = { detectOuterFrame, VERSION };
})();
