(function () {
  const VERSION = 'v22-stable-frame-window-sample-orientation';

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

  function orderPoints(pts) {
    // return TL, TR, BR, BL
    const sorted = pts.slice().sort((a,b)=>a.x-b.x);
    const left = sorted.slice(0,2).sort((a,b)=>a.y-b.y);
    const right = sorted.slice(2,4).sort((a,b)=>a.y-b.y);
    return [left[0], right[0], right[1], left[1]];
  }

  function rectPointsToArray(rect) {
    const vertices = cv.RotatedRect.points(rect);
    return vertices.map(p => ({ x: p.x, y: p.y }));
  }

  function drawPolygon(ctx, pts, color, lineWidth) {
    const p = orderPoints(pts);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawRect(ctx, r, color, label) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, ctx.canvas.width / 180);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.font = `${Math.max(12, Math.round(ctx.canvas.width / 30))}px sans-serif`;
    ctx.fillText(label, r.x + 4, Math.max(16, r.y - 5));
    ctx.restore();
  }

  function drawEllipseMark(ctx, e, color, label) {
    const rx = e.rx || e.r || 20;
    const ry = e.ry || e.r || 20;
    const cross = Math.max(8, Math.min(ctx.canvas.width, ctx.canvas.height) / 22);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, ctx.canvas.width / 180);
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.cx - cross, e.cy);
    ctx.lineTo(e.cx + cross, e.cy);
    ctx.moveTo(e.cx, e.cy - cross);
    ctx.lineTo(e.cx, e.cy + cross);
    ctx.stroke();
    ctx.font = `${Math.max(12, Math.round(ctx.canvas.width / 30))}px sans-serif`;
    ctx.fillText(label, e.cx + cross + 4, e.cy + 4);
    ctx.restore();
  }

  function drawCross(ctx, c, color, label) {
    const r = Math.max(8, Math.min(ctx.canvas.width, ctx.canvas.height) / 22);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, ctx.canvas.width / 180);
    ctx.beginPath();
    ctx.moveTo(c.cx - r, c.cy);
    ctx.lineTo(c.cx + r, c.cy);
    ctx.moveTo(c.cx, c.cy - r);
    ctx.lineTo(c.cx, c.cy + r);
    ctx.stroke();
    ctx.font = `${Math.max(12, Math.round(ctx.canvas.width / 30))}px sans-serif`;
    ctx.fillText(label, c.cx + r + 4, c.cy + 4);
    ctx.restore();
  }

  function rotateCanvas180(canvas) {
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tctx = tmp.getContext('2d');
    tctx.translate(tmp.width, tmp.height);
    tctx.rotate(Math.PI);
    tctx.drawImage(canvas, 0, 0);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0);
  }

  function makeNormalizedGray(src) {
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    let bg = new cv.Mat();
    // 大範圍模糊作為背景光照，降低黑/白桌面與陰影影響
    cv.GaussianBlur(gray, bg, new cv.Size(0, 0), 31, 31, cv.BORDER_DEFAULT);
    let norm = new cv.Mat();
    cv.divide(gray, bg, norm, 128);
    cv.normalize(norm, norm, 0, 255, cv.NORM_MINMAX);
    norm.convertTo(norm, cv.CV_8U);
    gray.delete(); bg.delete();
    return norm;
  }

  function warpCropToCanvas(srcCanvas, cropCanvas, pts) {
    const ordered = orderPoints(pts);
    const topW = dist(ordered[0], ordered[1]);
    const bottomW = dist(ordered[3], ordered[2]);
    const leftH = dist(ordered[0], ordered[3]);
    const rightH = dist(ordered[1], ordered[2]);
    let outW = Math.round(Math.max(topW, bottomW));
    let outH = Math.round(Math.max(leftH, rightH));
    outW = clamp(outW, 80, 900);
    outH = clamp(outH, 160, 1400);

    const src = cv.imread(srcCanvas);
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      ordered[0].x, ordered[0].y,
      ordered[1].x, ordered[1].y,
      ordered[2].x, ordered[2].y,
      ordered[3].x, ordered[3].y
    ]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      outW - 1, 0,
      outW - 1, outH - 1,
      0, outH - 1
    ]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_REPLICATE);

    // 若輸出變橫向，先順時針轉成直向卡匣
    let show = dst;
    let rotated = null;
    if (outW > outH) {
      rotated = new cv.Mat();
      cv.rotate(dst, rotated, cv.ROTATE_90_CLOCKWISE);
      show = rotated;
      outW = show.cols;
      outH = show.rows;
    }

    cropCanvas.width = outW;
    cropCanvas.height = outH;
    cv.imshow(cropCanvas, show);
    src.delete(); srcTri.delete(); dstTri.delete(); M.delete(); dst.delete();
    if (rotated) rotated.delete();
  }

  function addOuterCandidatesFromMask(mask, imgArea, options, sourceName, list) {
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < imgArea * options.minAreaRatio) { cnt.delete(); continue; }
      const rect = cv.minAreaRect(cnt);
      const rw = rect.size.width, rh = rect.size.height;
      const shortSide = Math.min(rw, rh), longSide = Math.max(rw, rh);
      const ratio = longSide / Math.max(1, shortSide);
      const rectArea = rw * rh;
      const fill = area / Math.max(1, rectArea);
      const notFullImage = rectArea < imgArea * 0.78;
      const pts = rectPointsToArray(rect);
      const cx = rect.center.x;
      const cy = rect.center.y;
      const centerScore = 1 - Math.min(1, Math.hypot(cx - mask.cols/2, cy - mask.rows/2) / Math.hypot(mask.cols/2, mask.rows/2));
      if (ratio >= options.ratioMin && ratio <= options.ratioMax && fill > 0.16 && notFullImage) {
        let score = area * (0.45 + fill) * (0.65 + centerScore);
        if (sourceName === 'white-mask') score *= 1.25;
        list.push({ area, rectArea, fill, ratio, rect, pts, score, source: sourceName });
      }
      cnt.delete();
    }
    contours.delete(); hierarchy.delete();
  }

  function findOuterCandidates(src, options) {
    const imgArea = src.cols * src.rows;
    const candidates = [];

    // 路徑A：邊緣輪廓，適合淺色桌面
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    let blurBig = new cv.Mat();
    cv.GaussianBlur(gray, blurBig, new cv.Size(0, 0), 25, 25, cv.BORDER_DEFAULT);
    let norm = new cv.Mat();
    cv.divide(gray, blurBig, norm, 128);
    cv.normalize(norm, norm, 0, 255, cv.NORM_MINMAX);
    norm.convertTo(norm, cv.CV_8U);
    let blur = new cv.Mat();
    cv.GaussianBlur(norm, blur, new cv.Size(5,5), 0);
    let edges = new cv.Mat();
    cv.Canny(blur, edges, 30, 90);
    let kEdge = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7,7));
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kEdge);
    cv.dilate(edges, edges, kEdge, new cv.Point(-1,-1), 1);
    addOuterCandidatesFromMask(edges, imgArea, options, 'edge-contour', candidates);

    // 路徑B：白色/低飽和遮罩，適合黑色背景或高對比背景
    let hsv = new cv.Mat();
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
    let whiteMask = new cv.Mat();
    // H 不限制；S 低、V 亮 = 白色卡匣。黑背景會被排除。
    const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 95, 0]);
    const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [179, 95, 255, 255]);
    cv.inRange(hsv, low, high, whiteMask);
    let kWhite = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9,9));
    cv.morphologyEx(whiteMask, whiteMask, cv.MORPH_CLOSE, kWhite);
    cv.morphologyEx(whiteMask, whiteMask, cv.MORPH_OPEN, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5,5)));
    addOuterCandidatesFromMask(whiteMask, imgArea, options, 'white-mask', candidates);

    gray.delete(); blurBig.delete(); norm.delete(); blur.delete(); edges.delete(); kEdge.delete();
    hsv.delete(); whiteMask.delete(); low.delete(); high.delete(); kWhite.delete();

    // 去除近似重複候選
    candidates.sort((a,b)=>b.score-a.score);
    const unique = [];
    for (const c of candidates) {
      const duplicate = unique.some(u => Math.hypot(u.rect.center.x-c.rect.center.x, u.rect.center.y-c.rect.center.y) < Math.min(c.rect.size.width,c.rect.size.height)*0.35);
      if (!duplicate) unique.push(c);
      if (unique.length >= 6) break;
    }
    return unique;
  }

  function findWindowByDarkProfile(norm, W, H) {
    const data = norm.data;
    const x0 = Math.round(W * 0.18), x1 = Math.round(W * 0.78);
    const y0 = Math.round(H * 0.12), y1 = Math.round(H * 0.68);
    let best = null;
    const widths = [Math.round(W*0.22), Math.round(W*0.26), Math.round(W*0.30), Math.round(W*0.34)];
    const heights = [Math.round(H*0.20), Math.round(H*0.25), Math.round(H*0.30), Math.round(H*0.35)];
    for (const ww of widths) {
      for (const hh of heights) {
        const stepX = Math.max(2, Math.round(ww/8));
        const stepY = Math.max(3, Math.round(hh/10));
        for (let y = y0; y <= y1-hh; y += stepY) {
          for (let x = x0; x <= x1-ww; x += stepX) {
            let sum = 0, cnt = 0;
            // 只抽樣，不要每像素全掃，手機快很多
            for (let yy = y; yy < y+hh; yy += 3) {
              for (let xx = x; xx < x+ww; xx += 3) {
                sum += (255 - data[yy*W + xx]);
                cnt++;
              }
            }
            const avgDark = sum / Math.max(1,cnt);
            const cx = x + ww/2, cy = y + hh/2;
            const centerScore = 1 - Math.min(1, Math.abs(cx - W*0.47)/(W*0.35));
            const yScore = 1 - Math.min(1, Math.abs(cy - H*0.38)/(H*0.32));
            const aspect = hh / Math.max(1, ww);
            const aspectScore = 1 - Math.min(1, Math.abs(aspect - 2.7)/2.5);
            const score = avgDark * (0.5+centerScore) * (0.5+yScore) * (0.5+aspectScore);
            if (!best || score > best.score) best = {x,y,w:ww,h:hh,cx,cy,score,source:'dark-profile-window'};
          }
        }
      }
    }
    return best;
  }

  function findWindowByContours(norm, W, H) {
    let blur = new cv.Mat();
    cv.GaussianBlur(norm, blur, new cv.Size(5,5), 0);
    let bin = new cv.Mat();
    cv.adaptiveThreshold(blur, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 5);
    const k1 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 9));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k1);
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3,3)));
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const candidates = [];
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      const br = cv.boundingRect(cnt);
      const rectArea = br.width * br.height;
      const cx = br.x + br.width/2;
      const cy = br.y + br.height/2;
      const aspect = br.height / Math.max(1, br.width);
      const fill = area / Math.max(1, rectArea);
      if (cx > W*0.16 && cx < W*0.82 && cy > H*0.12 && cy < H*0.68 &&
          br.width > W*0.10 && br.width < W*0.48 && br.height > H*0.12 && br.height < H*0.52 &&
          aspect > 1.15 && aspect < 5.8 && fill > 0.06) {
        const centerScore = 1 - Math.min(1, Math.abs(cx-W*0.47)/(W*0.38));
        const yScore = 1 - Math.min(1, Math.abs(cy-H*0.38)/(H*0.34));
        candidates.push({x:br.x,y:br.y,w:br.width,h:br.height,cx,cy,area,fill,aspect,score:rectArea*(0.5+centerScore)*(0.5+yScore),source:'opencv-window-contour'});
      }
      cnt.delete();
    }
    candidates.sort((a,b)=>b.score-a.score);
    blur.delete(); bin.delete(); k1.delete(); contours.delete(); hierarchy.delete();
    return {win:candidates[0] || null, count:candidates.length};
  }

  function validateAndShrinkWindow(win, W, H) {
    if (!win) return null;
    const cx = win.x + win.w/2;
    const cy = win.y + win.h/2;
    const aspect = win.h / Math.max(1, win.w);
    const ok = cx > W*0.18 && cx < W*0.80 && cy > H*0.12 && cy < H*0.70 &&
      win.w > W*0.10 && win.w < W*0.50 && win.h > H*0.14 && win.h < H*0.55 &&
      aspect > 1.2 && aspect < 5.2;
    if (!ok) return null;
    const padX = Math.round(win.w * 0.04);
    const padY = Math.round(win.h * 0.03);
    return Object.assign({}, win, {
      x: clamp(win.x + padX, 0, W-1),
      y: clamp(win.y + padY, 0, H-1),
      w: clamp(win.w - padX*2, 1, W),
      h: clamp(win.h - padY*2, 1, H),
      sourceSafe: win.source || 'window-safe'
    });
  }

  function findSampleInnerHole(norm, W, H, win) {
    let x0 = Math.round(W * 0.10), x1 = Math.round(W * 0.90);
    let y0 = Math.round(H * 0.38), y1 = Math.round(H * 0.94);
    if (win) {
      // 只限定不要壓到 Window，但不限定一定在下半部，這樣倒放時也能抓到 S 孔
      y0 = Math.max(Math.round(H*0.08), Math.round(Math.min(win.y + win.h*0.8, H*0.42)));
    }
    let roi = norm.roi(new cv.Rect(x0, y0, x1-x0, y1-y0));
    let blur = new cv.Mat();
    cv.GaussianBlur(roi, blur, new cv.Size(5,5), 0);
    let bin = new cv.Mat();
    cv.threshold(blur, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3,3)));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5,5)));
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const candidates = [];
    for (let i=0;i<contours.size();i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      const br0 = cv.boundingRect(cnt);
      const br = {x:x0+br0.x, y:y0+br0.y, width:br0.width, height:br0.height};
      const cx = br.x + br.width/2, cy = br.y + br.height/2;
      const peri = cv.arcLength(cnt,true);
      const circularity = peri>0 ? 4*Math.PI*area/(peri*peri) : 0;
      const wh = br.width/Math.max(1,br.height);
      const fill = area/Math.max(1,br.width*br.height);
      if (area > W*H*0.0005 && area < W*H*0.05 &&
          br.width > W*0.04 && br.width < W*0.40 && br.height > W*0.05 && br.height < W*0.45 &&
          wh > 0.25 && wh < 1.9 && circularity > 0.08 && fill > 0.08) {
        if (win) {
          const overlapX = Math.max(0, Math.min(br.x+br.width, win.x+win.w) - Math.max(br.x, win.x));
          const overlapY = Math.max(0, Math.min(br.y+br.height, win.y+win.h) - Math.max(br.y, win.y));
          if (overlapX*overlapY > br.width*br.height*0.10) { cnt.delete(); continue; }
        }
        const expectedX = win ? (win.x + win.w/2) : W*0.47;
        const centerScore = 1 - Math.min(1, Math.abs(cx-expectedX)/(W*0.40));
        const score = area * (0.5+circularity) * (0.5+centerScore) * (0.5+fill);
        candidates.push({cx,cy,r:Math.max(br.width,br.height)/2,rx:br.width/2,ry:br.height/2,x:br.x,y:br.y,w:br.width,h:br.height,source:'inner-hole',circularity,fill,score});
      }
      cnt.delete();
    }
    candidates.sort((a,b)=>b.score-a.score);
    roi.delete(); blur.delete(); bin.delete(); contours.delete(); hierarchy.delete();
    return {sample:candidates[0] || null, count:candidates.length};
  }

  function findSampleWellAroundInner(norm, W, H, inner, win) {
    if (!inner) return {sample:null,count:0};
    // 用內孔中心建立比較漂亮、穩定的 S Well 視覺橢圓，而不是讓陰影決定大橢圓
    const rx = Math.round(clamp(W * 0.22, W*0.12, W*0.32));
    const ry = Math.round(clamp(W * 0.25, W*0.14, W*0.36));
    return {sample:{cx:inner.cx, cy:inner.cy, rx, ry, r:Math.max(rx,ry), source:'inner-hole-guided-well'}, count:1};
  }

  function fallbackWindow(W,H) {
    return {x:Math.round(W*0.30),y:Math.round(H*0.24),w:Math.round(W*0.34),h:Math.round(H*0.32),cx:Math.round(W*0.47),cy:Math.round(H*0.40),source:'fallback-window'};
  }

  function fallbackSample(W,H,win) {
    const cx = win ? win.x + win.w/2 : W*0.47;
    return {cx,cy:Math.round(H*0.68),rx:Math.round(W*0.20),ry:Math.round(W*0.24),r:Math.round(W*0.24),source:'fallback-sample'};
  }

  function findInternalFeaturesOnCrop(cropCanvas, draw) {
    const src = cv.imread(cropCanvas);
    const W = src.cols, H = src.rows;
    const ctx = cropCanvas.getContext('2d');
    const norm = makeNormalizedGray(src);

    const wc = findWindowByContours(norm,W,H);
    const wp = findWindowByDarkProfile(norm,W,H);
    const rawWin = (wc.win && (!wp || wc.win.score > wp.score*0.75)) ? wc.win : wp;
    let win = validateAndShrinkWindow(rawWin,W,H);
    let windowSource = win ? (rawWin.source || 'window') : 'fallback-geometry';
    if (!win) win = fallbackWindow(W,H);

    const inner = findSampleInnerHole(norm,W,H,win);
    let well = findSampleWellAroundInner(norm,W,H,inner.sample,win);
    let sample = well.sample || fallbackSample(W,H,win);
    let sampleSource = sample.source;

    if (draw) {
      drawRect(ctx, win, 'rgba(37,99,235,0.95)', 'Window');
      drawEllipseMark(ctx, sample, 'rgba(168,85,247,0.95)', 'S well');
      if (inner.sample) drawCross(ctx, inner.sample, 'rgba(217,70,239,0.85)', 'inner');
      drawCross(ctx, {cx:win.x+win.w/2, cy:win.y+win.h/2}, 'rgba(239,68,68,0.85)', 'W center');
    }
    src.delete(); norm.delete();
    return {
      window: win,
      sample,
      innerSample: inner.sample,
      windowSource,
      sampleSource,
      windowCandidates: wc.count + (wp ? 1 : 0),
      sampleCandidates: inner.count + well.count
    };
  }

  function detectInternalFeatures(cropCanvas) {
    // 先找一次 Window + S，若 S 在 Window 上方，才做 180 度校正；不使用 C/T 線判斷方向
    let f1 = findInternalFeaturesOnCrop(cropCanvas, false);
    let orientationCorrected = false;
    if (f1.window && f1.sample && f1.sample.cy < (f1.window.y + f1.window.h/2)) {
      rotateCanvas180(cropCanvas);
      orientationCorrected = true;
    }
    const f2 = findInternalFeaturesOnCrop(cropCanvas, true);
    f2.orientationCorrected = orientationCorrected;
    f2.orientation = (f2.window && f2.sample)
      ? (f2.sample.cy > (f2.window.y + f2.window.h/2) ? 'window-above-sample' : 'sample-above-window')
      : 'unknown';
    return f2;
  }

  function detectOuterFrame(canvas, cropCanvas, options) {
    if (typeof cv === 'undefined' || !cv.Mat) return {version:VERSION,ok:false,reason:'opencv-not-ready'};
    options = Object.assign({minAreaRatio:0.006,ratioMin:1.7,ratioMax:7.5}, options || {});
    const ctx = canvas.getContext('2d');
    const src = cv.imread(canvas);
    const imgArea = src.cols * src.rows;
    const candidates = findOuterCandidates(src, options);
    const best = candidates[0];

    ctx.save();
    ctx.lineWidth = Math.max(3, canvas.width/250);
    for (let i=Math.min(2,candidates.length-1); i>=1; i--) drawPolygon(ctx,candidates[i].pts,'rgba(37,99,235,0.5)',ctx.lineWidth);
    if (best) drawPolygon(ctx,best.pts,'rgba(22,163,74,0.95)',ctx.lineWidth+1);
    ctx.restore();

    let result;
    if (best) {
      let features = null;
      try {
        warpCropToCanvas(canvas,cropCanvas,best.pts);
        features = detectInternalFeatures(cropCanvas);
      } catch(e) { console.error(e); }
      result = {
        version: VERSION,
        ok: true,
        reason: `${best.source}`,
        ratio: best.ratio,
        areaRatio: best.area / imgArea,
        fill: best.fill,
        candidates: candidates.length,
        rect: {cx:best.rect.center.x, cy:best.rect.center.y, w:best.rect.size.width, h:best.rect.size.height, angle:best.rect.angle},
        features
      };
    } else {
      cropCanvas.width = 1; cropCanvas.height = 1;
      result = {version:VERSION,ok:false,reason:'no-candidate',candidates:candidates.length};
    }
    src.delete();
    return result;
  }

  window.AsapOuterDetector = { detectOuterFrame, VERSION };
})();
