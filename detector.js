(function () {
  const VERSION = 'v14-opencv-outer-frame';

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function orderPoints(pts) {
    // pts: [{x,y} * 4]
    const sorted = pts.slice().sort((a,b)=>a.x-b.x);
    const left = sorted.slice(0,2).sort((a,b)=>a.y-b.y);
    const right = sorted.slice(2,4).sort((a,b)=>a.y-b.y);
    return [left[0], right[0], right[1], left[1]]; // tl,tr,br,bl
  }

  function rectPointsToArray(rect) {
    const vertices = cv.RotatedRect.points(rect);
    return vertices.map(p => ({ x: p.x, y: p.y }));
  }

  function drawCandidate(ctx, pts, color, lineWidth) {
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

    // Ensure portrait output for cassette
    if (outW > outH) {
      const tmp = outW; outW = outH; outH = tmp;
    }

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

  function detectOuterFrame(canvas, cropCanvas, options) {
    if (typeof cv === 'undefined' || !cv.Mat) {
      return { version: VERSION, ok:false, reason:'opencv-not-ready' };
    }

    options = Object.assign({
      minAreaRatio: 0.01,
      ratioMin: 2.2,
      ratioMax: 6.5
    }, options || {});

    const ctx = canvas.getContext('2d');
    const src = cv.imread(canvas);
    const imgArea = src.cols * src.rows;

    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 陰影安全：大模糊做背景光照，取得 normalized gray
    let blurBig = new cv.Mat();
    cv.GaussianBlur(gray, blurBig, new cv.Size(0, 0), 25, 25, cv.BORDER_DEFAULT);
    let norm = new cv.Mat();
    cv.divide(gray, blurBig, norm, 128);
    cv.normalize(norm, norm, 0, 255, cv.NORM_MINMAX);
    norm.convertTo(norm, cv.CV_8U);

    // 方法 A：OpenCV 邊緣找外框
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
      const rw = rect.size.width;
      const rh = rect.size.height;
      const shortSide = Math.min(rw, rh);
      const longSide = Math.max(rw, rh);
      const ratio = longSide / Math.max(1, shortSide);
      const rectArea = rw * rh;
      const fill = area / Math.max(1, rectArea);

      // 快篩卡匣：長條，且不要是整張背景邊界
      const notFullImage = rectArea < imgArea * 0.75;
      if (ratio >= options.ratioMin && ratio <= options.ratioMax && fill > 0.18 && notFullImage) {
        candidates.push({ area, rectArea, fill, ratio, rect, pts: rectPointsToArray(rect), score: area * fill });
      }
      cnt.delete();
    }

    candidates.sort((a,b)=>b.score-a.score);
    const best = candidates[0];

    // 畫回原圖
    ctx.save();
    ctx.lineWidth = Math.max(3, canvas.width / 250);
    // 可視化前3候選藍框
    for (let i = Math.min(2, candidates.length - 1); i >= 1; i--) {
      drawCandidate(ctx, candidates[i].pts, 'rgba(37,99,235,0.6)', ctx.lineWidth);
    }
    if (best) drawCandidate(ctx, best.pts, 'rgba(22,163,74,0.95)', ctx.lineWidth + 1);
    ctx.restore();

    let result;
    if (best) {
      try { warpCropToCanvas(canvas, cropCanvas, best.pts); } catch (e) { console.error(e); }
      result = {
        version: VERSION,
        ok: true,
        reason: 'opencv-contour',
        ratio: best.ratio,
        areaRatio: best.area / imgArea,
        fill: best.fill,
        candidates: candidates.length,
        rect: {
          cx: best.rect.center.x,
          cy: best.rect.center.y,
          w: best.rect.size.width,
          h: best.rect.size.height,
          angle: best.rect.angle
        }
      };
    } else {
      cropCanvas.width = 1; cropCanvas.height = 1;
      result = {
        version: VERSION,
        ok: false,
        reason: 'no-candidate',
        candidates: candidates.length
      };
    }

    src.delete(); gray.delete(); blurBig.delete(); norm.delete(); blur.delete(); edges.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
    return result;
  }

  window.AsapOuterDetector = { detectOuterFrame, VERSION };
})();
