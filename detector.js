(function () {
  const VERSION = 'v16-window-sample-hybrid';

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
    ctx.font = `${Math.max(13, Math.round(ctx.canvas.width / 28))}px sans-serif`;
    ctx.fillText(label, r.x + 4, Math.max(16, r.y - 5));
    ctx.restore();
  }

  function drawCircle(ctx, c, color, label) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, ctx.canvas.width / 180);
    ctx.beginPath();
    ctx.ellipse(c.cx, c.cy, c.rx, c.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `${Math.max(13, Math.round(ctx.canvas.width / 28))}px sans-serif`;
    ctx.fillText(label, c.cx + c.rx + 4, c.cy);
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

  function findInternalFeaturesOnCrop(cropCanvas, draw) {
    const src = cv.imread(cropCanvas);
    const W = src.cols;
    const H = src.rows;
    const ctx = cropCanvas.getContext('2d');

    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 陰影補償：把大範圍光照變化扣掉，讓凹槽/孔洞比較明顯
    let bg = new cv.Mat();
    cv.GaussianBlur(gray, bg, new cv.Size(0, 0), 21, 21, cv.BORDER_DEFAULT);
    let norm = new cv.Mat();
    cv.divide(gray, bg, norm, 128);
    cv.normalize(norm, norm, 0, 255, cv.NORM_MINMAX);
    norm.convertTo(norm, cv.CV_8U);

    let blur = new cv.Mat();
    cv.GaussianBlur(norm, blur, new cv.Size(5,5), 0, 0, cv.BORDER_DEFAULT);

    // 找比卡匣白色外殼更暗的內部結構：判讀窗、S孔、文字、線條
    let bin = new cv.Mat();
    cv.threshold(blur, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5,5));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kernel);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const windowCandidates = [];
    const sampleCandidates = [];

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      const br = cv.boundingRect(cnt);
      const rectArea = br.width * br.height;
      if (rectArea < W * H * 0.002 || rectArea > W * H * 0.35) { cnt.delete(); continue; }

      const aspect = br.height / Math.max(1, br.width);
      const fill = area / Math.max(1, rectArea);
      const cx = br.x + br.width / 2;
      const cy = br.y + br.height / 2;
      const marginOK = cx > W * 0.10 && cx < W * 0.90 && cy > H * 0.05 && cy < H * 0.95;
      if (!marginOK) { cnt.delete(); continue; }

      const peri = cv.arcLength(cnt, true);
      const circularity = peri > 0 ? (4 * Math.PI * area / (peri * peri)) : 0;

      // 判讀窗：直向長條/凹槽，通常在卡匣中上部，寬度不會太大
      if (
        aspect >= 1.3 && aspect <= 6.5 &&
        br.width >= W * 0.10 && br.width <= W * 0.55 &&
        br.height >= H * 0.10 && br.height <= H * 0.55 &&
        cy < H * 0.75 && fill > 0.12
      ) {
        const centerBonus = 1 - Math.min(1, Math.abs(cx - W * 0.48) / (W * 0.45));
        const score = rectArea * (0.5 + centerBonus) * Math.min(1.8, aspect) * fill;
        windowCandidates.push({ x:br.x, y:br.y, w:br.width, h:br.height, cx, cy, area, fill, aspect, score });
      }

      // S孔：接近圓/橢圓，通常較靠下，寬高比接近1
      const whAspect = br.width / Math.max(1, br.height);
      if (
        whAspect >= 0.45 && whAspect <= 2.2 &&
        br.width >= W * 0.12 && br.width <= W * 0.65 &&
        br.height >= W * 0.12 && br.height <= W * 0.75 &&
        cy > H * 0.35 && circularity > 0.18
      ) {
        const lowerBonus = cy / H;
        const score = rectArea * (0.6 + lowerBonus) * (0.5 + circularity);
        sampleCandidates.push({ cx, cy, rx:br.width/2, ry:br.height/2, x:br.x, y:br.y, w:br.width, h:br.height, area, circularity, score });
      }
      cnt.delete();
    }

    windowCandidates.sort((a,b)=>b.score-a.score);
    sampleCandidates.sort((a,b)=>b.score-a.score);

    let resultWindow = windowCandidates[0] || null;
    let sampleHole = null;
    let windowSource = resultWindow ? 'opencv-contour' : 'none';
    let sampleSource = 'none';

    // S孔不可選到判讀窗本身；盡量選在判讀窗下方
    for (const s of sampleCandidates) {
      if (resultWindow) {
        const overlapX = Math.max(0, Math.min(s.x+s.w, resultWindow.x+resultWindow.w) - Math.max(s.x, resultWindow.x));
        const overlapY = Math.max(0, Math.min(s.y+s.h, resultWindow.y+resultWindow.h) - Math.max(s.y, resultWindow.y));
        const overlap = overlapX * overlapY;
        if (overlap > Math.min(s.w*s.h, resultWindow.w*resultWindow.h) * 0.25) continue;
      }
      sampleHole = s;
      sampleSource = 'opencv-contour';
      break;
    }

    // V16 fallback：外框已正確裁切後，內部結構會落在相對固定位置。
    // OpenCV找不到低對比凹槽時，先用幾何區域補上，避免整個流程卡住。
    if (!resultWindow) {
      resultWindow = {
        x: Math.round(W * 0.28),
        y: Math.round(H * 0.26),
        w: Math.round(W * 0.30),
        h: Math.round(H * 0.30),
        cx: Math.round(W * 0.43),
        cy: Math.round(H * 0.41),
        area: 0, fill: 0, aspect: 0, score: 0
      };
      windowSource = 'fallback-geometry';
    }

    if (!sampleHole) {
      sampleHole = {
        cx: Math.round(W * 0.42),
        cy: Math.round(H * 0.68),
        rx: Math.round(W * 0.16),
        ry: Math.round(W * 0.18),
        x: Math.round(W * 0.42 - W * 0.16),
        y: Math.round(H * 0.68 - W * 0.18),
        w: Math.round(W * 0.32),
        h: Math.round(W * 0.36),
        area: 0, circularity: 0, score: 0
      };
      sampleSource = 'fallback-geometry';
    }

    if (draw) {
      if (resultWindow) drawRect(ctx, resultWindow, 'rgba(37,99,235,0.95)', 'Window');
      if (sampleHole) drawCircle(ctx, sampleHole, 'rgba(168,85,247,0.95)', 'S');
    }

    src.delete(); gray.delete(); bg.delete(); norm.delete(); blur.delete(); bin.delete(); kernel.delete(); contours.delete(); hierarchy.delete();

    return {
      window: resultWindow,
      sample: sampleHole,
      windowSource,
      sampleSource,
      windowCandidates: windowCandidates.length,
      sampleCandidates: sampleCandidates.length
    };
  }

  function detectInternalFeatures(cropCanvas) {
    // 第一次偵測，不畫圖；若發現 S 孔在 Window 上方，就旋轉180度後重抓
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

  function detectOuterFrame(canvas, cropCanvas, options) {
    if (typeof cv === 'undefined' || !cv.Mat) {
      return { version: VERSION, ok:false, reason:'opencv-not-ready' };
    }

    options = Object.assign({ minAreaRatio: 0.01, ratioMin: 2.2, ratioMax: 6.5 }, options || {});

    const ctx = canvas.getContext('2d');
    const src = cv.imread(canvas);
    const imgArea = src.cols * src.rows;

    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    let blurBig = new cv.Mat();
    cv.GaussianBlur(gray, blurBig, new cv.Size(0, 0), 25, 25, cv.BORDER_DEFAULT);
    let norm = new cv.Mat();
    cv.divide(gray, blurBig, norm, 128);
    cv.normalize(norm, norm, 0, 255, cv.NORM_MINMAX);
    norm.convertTo(norm, cv.CV_8U);

    let blur = new cv.Mat();
    cv.GaussianBlur(norm, blur, new cv.Size(5,5), 0, 0, cv.BORDER_DEFAULT);
    let edges = new cv.Mat();
    cv.Canny(blur, edges, 35, 95);
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7,7));
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
    cv.dilate(edges, edges, kernel, new cv.Point(-1,-1), 1);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const candidates = [];
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
      const notFullImage = rectArea < imgArea * 0.75;
      if (ratio >= options.ratioMin && ratio <= options.ratioMax && fill > 0.18 && notFullImage) {
        candidates.push({ area, rectArea, fill, ratio, rect, pts: rectPointsToArray(rect), score: area * fill });
      }
      cnt.delete();
    }

    candidates.sort((a,b)=>b.score-a.score);
    const best = candidates[0];

    ctx.save();
    ctx.lineWidth = Math.max(3, canvas.width / 250);
    for (let i = Math.min(2, candidates.length - 1); i >= 1; i--) drawPolygon(ctx, candidates[i].pts, 'rgba(37,99,235,0.6)', ctx.lineWidth);
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
        reason: 'opencv-contour',
        ratio: best.ratio,
        areaRatio: best.area / imgArea,
        fill: best.fill,
        candidates: candidates.length,
        rect: { cx: best.rect.center.x, cy: best.rect.center.y, w: best.rect.size.width, h: best.rect.size.height, angle: best.rect.angle },
        features
      };
    } else {
      cropCanvas.width = 1; cropCanvas.height = 1;
      result = { version: VERSION, ok: false, reason: 'no-candidate', candidates: candidates.length };
    }

    src.delete(); gray.delete(); blurBig.delete(); norm.delete(); blur.delete(); edges.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
    return result;
  }

  window.AsapOuterDetector = { detectOuterFrame, VERSION };
})();
