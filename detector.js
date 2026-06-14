(function () {
  const VERSION = 'v25-feature-guided-outer-frame';

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function orderPoints(pts) {
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

  function drawCross(ctx, c, color, label) {
    const r = Math.max(8, Math.min(ctx.canvas.width, ctx.canvas.height) / 18);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, ctx.canvas.width / 180);
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.r || r, 0, Math.PI * 2);
    ctx.stroke();
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

  function warpCropToCanvas(srcCanvas, cropCanvas, pts) {
    const ordered = orderPoints(pts);
    const dist = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
    const topW = dist(ordered[0], ordered[1]);
    const bottomW = dist(ordered[3], ordered[2]);
    const leftH = dist(ordered[0], ordered[3]);
    const rightH = dist(ordered[1], ordered[2]);

    let outW = Math.round(Math.max(topW, bottomW));
    let outH = Math.round(Math.max(leftH, rightH));
    outW = clamp(outW, 80, 900);
    outH = clamp(outH, 160, 1400);
    if (outW > outH) { const tmp = outW; outW = outH; outH = tmp; }

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
    cropCanvas.width = outW;
    cropCanvas.height = outH;
    cv.imshow(cropCanvas, dst);
    src.delete(); srcTri.delete(); dstTri.delete(); M.delete(); dst.delete();
  }

  function makeNormalizedGray(src) {
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    let bg = new cv.Mat();
    cv.GaussianBlur(gray, bg, new cv.Size(0, 0), 23, 23, cv.BORDER_DEFAULT);
    let norm = new cv.Mat();
    cv.divide(gray, bg, norm, 128);
    cv.normalize(norm, norm, 0, 255, cv.NORM_MINMAX);
    norm.convertTo(norm, cv.CV_8U);
    gray.delete(); bg.delete();
    return norm;
  }

  function findWindowByContours(norm, W, H) {
    let blur = new cv.Mat();
    cv.GaussianBlur(norm, blur, new cv.Size(5,5), 0);

    let bin = new cv.Mat();
    // adaptive threshold 比 Otsu 更能處理陰影與低對比凹槽
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
      const cx = br.x + br.width / 2;
      const cy = br.y + br.height / 2;
      const aspect = br.height / Math.max(1, br.width);
      const fill = area / Math.max(1, rectArea);

      // 判讀窗：直向長條、位於上半部偏中線、面積中等
      if (
        cx > W * 0.18 && cx < W * 0.78 &&
        cy > H * 0.16 && cy < H * 0.66 &&
        br.width > W * 0.12 && br.width < W * 0.50 &&
        br.height > H * 0.12 && br.height < H * 0.50 &&
        aspect > 1.15 && aspect < 5.8 &&
        fill > 0.08 && fill < 0.95
      ) {
        const centerScore = 1 - Math.min(1, Math.abs(cx - W * 0.43) / (W * 0.45));
        const yScore = 1 - Math.min(1, Math.abs(cy - H * 0.40) / (H * 0.35));
        const score = rectArea * (0.4 + centerScore) * (0.4 + yScore) * Math.min(1.5, aspect) * (0.5 + fill);
        candidates.push({ x: br.x, y: br.y, w: br.width, h: br.height, cx, cy, area, fill, aspect, score });
      }
      cnt.delete();
    }
    candidates.sort((a,b)=>b.score-a.score);
    blur.delete(); bin.delete(); k1.delete(); contours.delete(); hierarchy.delete();
    return { win: candidates[0] || null, count: candidates.length };
  }




  function findSampleWellOuter(norm, W, H, win) {
    // V19：抓整個 Sample Well 視覺中心，不再只抓內孔中心。
    // 優先找下半部最大的橢圓/圓角凹槽；失敗時使用 Window 對齊的幾何 fallback。
    let y0 = Math.round(H * 0.43);
    if (win) y0 = Math.max(y0, Math.round(win.y + win.h * 0.75));
    y0 = clamp(y0, 0, H - 10);

    let roi = norm.roi(new cv.Rect(0, y0, W, H - y0));
    let blur = new cv.Mat();
    cv.GaussianBlur(roi, blur, new cv.Size(7,7), 0);
    let bin = new cv.Mat();
    cv.adaptiveThreshold(blur, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 51, 3);
    const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(11,11));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k);
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5,5)));

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const candidates = [];
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      const br0 = cv.boundingRect(cnt);
      const br = { x: br0.x, y: br0.y + y0, width: br0.width, height: br0.height };
      const cx = br.x + br.width / 2;
      const cy = br.y + br.height / 2;
      const peri = cv.arcLength(cnt, true);
      const circularity = peri > 0 ? 4 * Math.PI * area / (peri * peri) : 0;
      const wh = br.width / Math.max(1, br.height);
      const rectArea = br.width * br.height;
      const fill = area / Math.max(1, rectArea);
      if (
        cx > W * 0.12 && cx < W * 0.85 &&
        cy > H * 0.48 && cy < H * 0.93 &&
        br.width > W * 0.20 && br.width < W * 0.78 &&
        br.height > W * 0.18 && br.height < W * 0.92 &&
        wh > 0.45 && wh < 2.30 &&
        fill > 0.12 && circularity > 0.08
      ) {
        const expectedX = win ? (win.x + win.w / 2) : W * 0.47;
        const centerScore = 1 - Math.min(1, Math.abs(cx - expectedX) / (W * 0.38));
        const yScore = 1 - Math.min(1, Math.abs(cy - H * 0.66) / (H * 0.28));
        const score = rectArea * (0.5 + circularity) * (0.6 + centerScore) * (0.5 + yScore) * (0.5 + fill);
        candidates.push({ cx, cy, rx: br.width / 2, ry: br.height / 2, r: Math.max(br.width, br.height)/2, x:br.x, y:br.y, w:br.width, h:br.height, source:'sample-well-ellipse', circularity, fill, score });
      }
      cnt.delete();
    }
    candidates.sort((a,b)=>b.score-a.score);
    roi.delete(); blur.delete(); bin.delete(); k.delete(); contours.delete(); hierarchy.delete();
    return { sample: candidates[0] || null, count: candidates.length };
  }

  function findSampleInnerHole(norm, W, H, win, roughSample) {
    // 目標：不要抓 S 孔外圈，改抓中間較暗的內孔中心
    let x0 = Math.round(W * 0.18);
    let y0 = Math.round(H * 0.48);
    let x1 = Math.round(W * 0.82);
    let y1 = Math.round(H * 0.92);
    if (win) y0 = Math.max(y0, Math.round(win.y + win.h * 0.85));
    if (roughSample) {
      const rr = Math.max(roughSample.r || 0, roughSample.rx || 0, roughSample.ry || 0, W * 0.14);
      x0 = Math.round(clamp(roughSample.cx - rr * 1.2, 0, W - 2));
      x1 = Math.round(clamp(roughSample.cx + rr * 1.2, 1, W - 1));
      y0 = Math.round(clamp(roughSample.cy - rr * 1.2, 0, H - 2));
      y1 = Math.round(clamp(roughSample.cy + rr * 1.2, 1, H - 1));
    }
    const rw = Math.max(2, x1 - x0);
    const rh = Math.max(2, y1 - y0);
    let roi = norm.roi(new cv.Rect(x0, y0, rw, rh));
    let blur = new cv.Mat();
    cv.GaussianBlur(roi, blur, new cv.Size(5,5), 0);

    let bin = new cv.Mat();
    // 內孔通常比外殼/孔邊緣更暗，用 Otsu 反二值化抓暗區
    cv.threshold(blur, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3,3)));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5,5)));

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const candidates = [];
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      const br = cv.boundingRect(cnt);
      const rectArea = br.width * br.height;
      const cx = x0 + br.x + br.width / 2;
      const cy = y0 + br.y + br.height / 2;
      const peri = cv.arcLength(cnt, true);
      const circularity = peri > 0 ? 4 * Math.PI * area / (peri * peri) : 0;
      const wh = br.width / Math.max(1, br.height);
      const fill = area / Math.max(1, rectArea);

      if (
        area > W * H * 0.0006 && area < W * H * 0.035 &&
        cx > W * 0.15 && cx < W * 0.82 &&
        cy > H * 0.45 && cy < H * 0.93 &&
        br.width > W * 0.05 && br.width < W * 0.32 &&
        br.height > W * 0.06 && br.height < W * 0.36 &&
        wh > 0.35 && wh < 1.65 &&
        fill > 0.12 && circularity > 0.10
      ) {
        if (win) {
          const overlapX = Math.max(0, Math.min(cx + br.width/2, win.x+win.w) - Math.max(cx - br.width/2, win.x));
          const overlapY = Math.max(0, Math.min(cy + br.height/2, win.y+win.h) - Math.max(cy - br.height/2, win.y));
          if (overlapX * overlapY > rectArea * 0.10) { cnt.delete(); continue; }
        }
        const expectedX = win ? (win.x + win.w * 0.45) : W * 0.45;
        const centerScore = 1 - Math.min(1, Math.abs(cx - expectedX) / (W * 0.40));
        const yScore = 1 - Math.min(1, Math.abs(cy - H * 0.68) / (H * 0.35));
        const score = area * (0.5 + circularity) * (0.5 + centerScore) * (0.5 + yScore);
        candidates.push({ cx, cy, r: Math.max(br.width, br.height) / 2, rx: br.width/2, ry: br.height/2, x: cx-br.width/2, y: cy-br.height/2, w:br.width, h:br.height, source:'inner-hole', circularity, fill, score });
      }
      cnt.delete();
    }
    candidates.sort((a,b)=>b.score-a.score);
    roi.delete(); blur.delete(); bin.delete(); contours.delete(); hierarchy.delete();
    return { sample: candidates[0] || null, count: candidates.length };
  }

  function makeWindowSafer(win, W, H) {
    // Window 有機會被內部線條或陰影干擾，所以做二次安全檢查；不合格才退回幾何位置
    if (!win) return null;
    const cx = win.x + win.w / 2;
    const cy = win.y + win.h / 2;
    const aspect = win.h / Math.max(1, win.w);
    const ok =
      cx > W * 0.20 && cx < W * 0.72 &&
      cy > H * 0.18 && cy < H * 0.62 &&
      win.w > W * 0.12 && win.w < W * 0.42 &&
      win.h > H * 0.16 && win.h < H * 0.44 &&
      aspect > 1.35 && aspect < 4.5;
    if (!ok) return null;

    // 對找到的窗稍微往內縮，避免藍框吃到外殼高光邊緣；後面 C/T 分析會更乾淨
    const padX = Math.round(win.w * 0.05);
    const padY = Math.round(win.h * 0.04);
    return Object.assign({}, win, {
      x: clamp(win.x + padX, 0, W-1),
      y: clamp(win.y + padY, 0, H-1),
      w: clamp(win.w - padX * 2, 1, W),
      h: clamp(win.h - padY * 2, 1, H),
      sourceSafe: 'validated-shrink'
    });
  }

  function findSampleByCirclesAndContours(norm, W, H, win) {
    const candidates = [];
    // 先用 HoughCircles 找圓/橢圓中心
    let roiY0 = Math.round(H * 0.42);
    if (win) roiY0 = Math.max(roiY0, Math.round(win.y + win.h * 0.75));
    roiY0 = clamp(roiY0, 0, H - 10);
    const roiH = H - roiY0;

    let roi = norm.roi(new cv.Rect(0, roiY0, W, roiH));
    let blur = new cv.Mat();
    cv.medianBlur(roi, blur, 5);
    let circles = new cv.Mat();
    try {
      cv.HoughCircles(
        blur,
        circles,
        cv.HOUGH_GRADIENT,
        1.2,
        Math.max(18, W * 0.18),
        80,
        16,
        Math.round(W * 0.09),
        Math.round(W * 0.30)
      );
      for (let i = 0; i < circles.cols; i++) {
        const x = circles.data32F[i * 3];
        const y = circles.data32F[i * 3 + 1] + roiY0;
        const r = circles.data32F[i * 3 + 2];
        if (x > W * 0.12 && x < W * 0.88 && y > H * 0.40 && y < H * 0.92) {
          const centerScore = 1 - Math.min(1, Math.abs(x - W * 0.45) / (W * 0.45));
          const yScore = 1 - Math.min(1, Math.abs(y - H * 0.67) / (H * 0.35));
          candidates.push({ cx:x, cy:y, r, rx:r, ry:r, source:'hough-circle', score: 100000 * (0.5 + centerScore) * (0.5 + yScore) });
        }
      }
    } catch (e) { console.warn(e); }
    roi.delete(); blur.delete(); circles.delete();

    // 再用深色輪廓補充，找 S 孔外圈/內圈
    let blur2 = new cv.Mat();
    cv.GaussianBlur(norm, blur2, new cv.Size(5,5), 0);
    let bin = new cv.Mat();
    cv.adaptiveThreshold(blur2, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 41, 4);
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7,7)));
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      const br = cv.boundingRect(cnt);
      const rectArea = br.width * br.height;
      const cx = br.x + br.width / 2;
      const cy = br.y + br.height / 2;
      const peri = cv.arcLength(cnt, true);
      const circularity = peri > 0 ? 4 * Math.PI * area / (peri * peri) : 0;
      const wh = br.width / Math.max(1, br.height);
      if (
        cx > W * 0.12 && cx < W * 0.88 &&
        cy > H * 0.40 && cy < H * 0.93 &&
        br.width > W * 0.14 && br.width < W * 0.65 &&
        br.height > W * 0.14 && br.height < W * 0.75 &&
        wh > 0.45 && wh < 2.2 &&
        circularity > 0.12
      ) {
        if (win) {
          const overlapX = Math.max(0, Math.min(br.x+br.width, win.x+win.w) - Math.max(br.x, win.x));
          const overlapY = Math.max(0, Math.min(br.y+br.height, win.y+win.h) - Math.max(br.y, win.y));
          if (overlapX * overlapY > rectArea * 0.15) { cnt.delete(); continue; }
        }
        const centerScore = 1 - Math.min(1, Math.abs(cx - W * 0.45) / (W * 0.45));
        const yScore = 1 - Math.min(1, Math.abs(cy - H * 0.68) / (H * 0.35));
        const score = rectArea * (0.5 + circularity) * (0.5 + centerScore) * (0.5 + yScore);
        candidates.push({ cx, cy, r: Math.max(br.width, br.height) / 2, rx:br.width/2, ry:br.height/2, x:br.x, y:br.y, w:br.width, h:br.height, source:'contour', circularity, score });
      }
      cnt.delete();
    }
    blur2.delete(); bin.delete(); contours.delete(); hierarchy.delete();
    candidates.sort((a,b)=>b.score-a.score);
    return { sample: candidates[0] || null, count: candidates.length };
  }

  function fallbackWindow(W, H) {
    return {
      x: Math.round(W * 0.30),
      y: Math.round(H * 0.25),
      w: Math.round(W * 0.34),
      h: Math.round(H * 0.31),
      cx: Math.round(W * 0.47),
      cy: Math.round(H * 0.405),
      area: 0, fill: 0, aspect: 0, score: 0
    };
  }

  function fallbackSample(W, H) {
    const r = Math.round(W * 0.18);
    return {
      cx: Math.round(W * 0.48),
      cy: Math.round(H * 0.68),
      r, rx:r, ry:r,
      source:'fallback-geometry', score:0
    };
  }

  function findInternalFeaturesOnCrop(cropCanvas, draw) {
    const src = cv.imread(cropCanvas);
    const W = src.cols;
    const H = src.rows;
    const ctx = cropCanvas.getContext('2d');
    const norm = makeNormalizedGray(src);

    const wf = findWindowByContours(norm, W, H);
    let resultWindow = makeWindowSafer(wf.win, W, H);
    let windowSource = resultWindow ? 'opencv-window-contour-safe' : 'fallback-geometry';
    if (!resultWindow) resultWindow = fallbackWindow(W, H);

    const well = findSampleWellOuter(norm, W, H, resultWindow);
    const sf = findSampleByCirclesAndContours(norm, W, H, resultWindow);
    const inner = findSampleInnerHole(norm, W, H, resultWindow, sf.sample || well.sample);

    let sampleHole = well.sample || sf.sample || inner.sample;
    let sampleSource = sampleHole ? sampleHole.source : 'fallback-geometry';
    if (!sampleHole) {
      sampleHole = fallbackSample(W, H);
      // 幾何 fallback 也改成視覺中心：對齊 Window 中心，位置在下半部。
      if (resultWindow) sampleHole.cx = resultWindow.x + resultWindow.w / 2;
      sampleHole.rx = Math.round(W * 0.22);
      sampleHole.ry = Math.round(W * 0.26);
      sampleHole.source = 'fallback-sample-well';
      sampleSource = sampleHole.source;
    }

    if (draw) {
      if (resultWindow) drawRect(ctx, resultWindow, 'rgba(37,99,235,0.95)', 'Window');
      if (sampleHole) drawEllipseMark(ctx, sampleHole, 'rgba(168,85,247,0.95)', 'S well');
      if (inner.sample) drawCross(ctx, inner.sample, 'rgba(217,70,239,0.75)', 'inner');
    }

    src.delete(); norm.delete();
    return {
      window: resultWindow,
      sample: sampleHole,
      innerSample: inner.sample,
      windowSource,
      sampleSource,
      windowCandidates: wf.count,
      sampleCandidates: well.count + sf.count + inner.count
    };
  }

  function detectInternalFeatures(cropCanvas) {
    let f1 = findInternalFeaturesOnCrop(cropCanvas, false);
    let orientationCorrected = false;
    if (f1.window && f1.sample && f1.sample.cy < f1.window.cy) {
      rotateCanvas180(cropCanvas);
      orientationCorrected = true;
      f1 = findInternalFeaturesOnCrop(cropCanvas, false);
    }
    const f2 = findInternalFeaturesOnCrop(cropCanvas, true);
    f2.orientationCorrected = orientationCorrected;
    f2.orientation = (f2.window && f2.sample)
      ? (f2.sample.cy > f2.window.cy ? 'window-above-sample' : 'maybe-upside-down')
      : 'unknown';
    return f2;
  }

  function addCandidateFromContour(candidates, cnt, sourceName, imgArea, options) {
    const area = Math.max(1, cv.contourArea(cnt));
    const rect = cv.minAreaRect(cnt);
    const rw = Math.max(1, rect.size.width), rh = Math.max(1, rect.size.height);
    const shortSide = Math.min(rw, rh), longSide = Math.max(rw, rh);
    const ratio = longSide / Math.max(1, shortSide);
    const rectArea = rw * rh;
    const fill = area / Math.max(1, rectArea);

    // 注意：edge contour 本身 contourArea 可能很小，所以外框面積以 rectArea 為主。
    if (
      rectArea >= imgArea * options.minAreaRatio &&
      rectArea <= imgArea * 0.72 &&
      ratio >= options.ratioMin && ratio <= options.ratioMax &&
      shortSide > 25 && longSide > 90
    ) {
      let fillWeight = sourceName.indexOf('edge') >= 0 ? Math.max(0.25, Math.min(1.0, fill * 2.0)) : Math.max(0.15, Math.min(1.2, fill));
      const ratioMid = (options.ratioMin + options.ratioMax) / 2;
      const ratioScore = 1 - Math.min(0.75, Math.abs(ratio - ratioMid) / Math.max(1, ratioMid));
      candidates.push({
        area, rectArea, fill, ratio, rect,
        pts: rectPointsToArray(rect),
        source: sourceName,
        score: rectArea * fillWeight * (0.55 + ratioScore)
      });
    }
  }

  function collectEdgeCandidates(src, gray, candidates, imgArea, options) {
    let blurBig = new cv.Mat();
    cv.GaussianBlur(gray, blurBig, new cv.Size(0, 0), 25, 25, cv.BORDER_DEFAULT);
    let norm = new cv.Mat();
    cv.divide(gray, blurBig, norm, 128);
    cv.normalize(norm, norm, 0, 255, cv.NORM_MINMAX);
    norm.convertTo(norm, cv.CV_8U);

    let blur = new cv.Mat();
    cv.GaussianBlur(norm, blur, new cv.Size(5,5), 0, 0, cv.BORDER_DEFAULT);
    let edges = new cv.Mat();
    cv.Canny(blur, edges, 25, 85);
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9,9));
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
    cv.dilate(edges, edges, kernel, new cv.Point(-1,-1), 1);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      addCandidateFromContour(candidates, cnt, 'edge-contour', imgArea, options);
      cnt.delete();
    }
    blurBig.delete(); norm.delete(); blur.delete(); edges.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
  }

  function collectWhiteMaskCandidates(src, candidates, imgArea, options) {
    // 主路徑：找低飽和、高亮度的白色卡匣本體。黑色背景時應該特別穩。
    let rgb = new cv.Mat();
    let hsv = new cv.Mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

    const masks = [];
    const ranges = [
      { name:'white-mask-strict', s:70, v:135 },
      { name:'white-mask-soft',   s:95, v:115 }
    ];

    for (const rg of ranges) {
      let low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, rg.v, 0]);
      let high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, rg.s, 255, 255]);
      let mask = new cv.Mat();
      cv.inRange(hsv, low, high, mask);
      low.delete(); high.delete();

      const kClose = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(13,13));
      const kOpen = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5,5));
      cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kClose);
      cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kOpen);
      masks.push({ name: rg.name, mat: mask });
      kClose.delete(); kOpen.delete();
    }

    for (const m of masks) {
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(m.mat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        addCandidateFromContour(candidates, cnt, m.name, imgArea, options);
        cnt.delete();
      }
      contours.delete(); hierarchy.delete(); m.mat.delete();
    }
    rgb.delete(); hsv.delete();
  }

  function collectBrightForegroundCandidates(gray, candidates, imgArea, options) {
    // 輔助路徑：用亮物件區塊找卡匣。這對深色背景特別有效。
    let blur = new cv.Mat();
    cv.GaussianBlur(gray, blur, new cv.Size(5,5), 0);
    let bin = new cv.Mat();
    cv.threshold(blur, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(11,11));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k);
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5,5)));

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      addCandidateFromContour(candidates, cnt, 'bright-foreground', imgArea, options);
      cnt.delete();
    }
    blur.delete(); bin.delete(); k.delete(); contours.delete(); hierarchy.delete();
  }

  function dedupeCandidates(candidates) {
    candidates.sort((a,b)=>b.score-a.score);
    const kept = [];
    for (const c of candidates) {
      const duplicate = kept.some(k => {
        const dx = Math.abs(k.rect.center.x - c.rect.center.x);
        const dy = Math.abs(k.rect.center.y - c.rect.center.y);
        const ds = Math.abs(k.rectArea - c.rectArea) / Math.max(1, Math.max(k.rectArea, c.rectArea));
        return dx < 18 && dy < 18 && ds < 0.20;
      });
      if (!duplicate) kept.push(c);
      if (kept.length >= 12) break;
    }
    return kept;
  }

  function featureScoreOnCandidate(canvas, cand) {
    // 使用你提示的結構特徵：Window 與 S 一定接近同一直線，且大致在卡匣中間。
    // 這裡只用來幫外框候選排序，不用 C/T 線。
    let tmp = document.createElement('canvas');
    try {
      warpCropToCanvas(canvas, tmp, cand.pts);
      const f = detectInternalFeatures(tmp);
      const W = tmp.width, H = tmp.height;
      if (!f || !f.window || !f.sample) return { score: 0, features: f, tmp };
      const wx = f.window.x + f.window.w / 2;
      const sx = f.sample.cx;
      const xAlign = 1 - Math.min(1, Math.abs(wx - sx) / Math.max(1, W * 0.35));
      const centerAlign = 1 - Math.min(1, Math.abs(((wx + sx) / 2) - W * 0.50) / Math.max(1, W * 0.45));
      const yOrder = f.sample.cy > f.window.cy ? 1 : 0.25;
      const winReal = (f.windowSource || '').indexOf('fallback') < 0 ? 1 : 0.25;
      const samReal = (f.sampleSource || '').indexOf('fallback') < 0 ? 1 : 0.25;
      const winSizeOk = (f.window.w > W*0.12 && f.window.w < W*0.55 && f.window.h > H*0.10 && f.window.h < H*0.55) ? 1 : 0.2;
      const sampleSizeOk = (f.sample.rx > W*0.05 && f.sample.rx < W*0.45 && f.sample.cy > H*0.20 && f.sample.cy < H*0.95) ? 1 : 0.2;
      const score = 1000000 * (0.25 + xAlign) * (0.25 + centerAlign) * yOrder * (0.35 + winReal) * (0.35 + samReal) * winSizeOk * sampleSizeOk;
      return { score, features: f, tmp };
    } catch (e) {
      console.warn('feature candidate failed', e);
      return { score: 0, features: null, tmp };
    }
  }

  function detectOuterFrame(canvas, cropCanvas, options) {
    if (typeof cv === 'undefined' || !cv.Mat) {
      return { version: VERSION, ok:false, reason:'opencv-not-ready' };
    }
    options = Object.assign({ minAreaRatio: 0.006, ratioMin: 1.8, ratioMax: 7.2 }, options || {});
    const ctx = canvas.getContext('2d');
    const src = cv.imread(canvas);
    const imgArea = src.cols * src.rows;

    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    let candidates = [];
    collectWhiteMaskCandidates(src, candidates, imgArea, options);
    collectBrightForegroundCandidates(gray, candidates, imgArea, options);
    collectEdgeCandidates(src, gray, candidates, imgArea, options);
    candidates = dedupeCandidates(candidates);

    // 先以結構特徵重新排序：外框候選內應該能找到 Window 與 S，且兩者 X 接近同一直線。
    const evaluated = [];
    for (const c of candidates.slice(0, 8)) {
      const fs = featureScoreOnCandidate(canvas, c);
      c.featureScore = fs.score;
      c.trialFeatures = fs.features;
      c.totalScore = c.score + fs.score;
      evaluated.push(c);
    }
    evaluated.sort((a,b)=>b.totalScore-a.totalScore);
    const best = evaluated[0] || candidates[0];

    ctx.save();
    ctx.lineWidth = Math.max(3, canvas.width / 250);
    for (let i = Math.min(3, candidates.length - 1); i >= 1; i--) drawPolygon(ctx, candidates[i].pts, 'rgba(37,99,235,0.45)', ctx.lineWidth);
    if (best) drawPolygon(ctx, best.pts, 'rgba(22,163,74,0.95)', ctx.lineWidth + 1);
    ctx.restore();

    let result;
    if (best) {
      let features = null;
      try {
        warpCropToCanvas(canvas, cropCanvas, best.pts);
        features = detectInternalFeatures(cropCanvas);
      } catch (e) { console.error(e); }
      result = {
        version: VERSION,
        ok: true,
        reason: best.source + (best.featureScore > 0 ? '+feature-guided' : ''),
        ratio: best.ratio,
        areaRatio: best.rectArea / imgArea,
        fill: best.fill,
        candidates: candidates.length,
        rect: { cx: best.rect.center.x, cy: best.rect.center.y, w: best.rect.size.width, h: best.rect.size.height, angle: best.rect.angle },
        features
      };
    } else {
      cropCanvas.width = 1; cropCanvas.height = 1;
      result = { version: VERSION, ok: false, reason: 'no-candidate', candidates: candidates.length };
    }

    src.delete(); gray.delete();
    return result;
  }

  window.AsapOuterDetector = { detectOuterFrame, VERSION };
})();
