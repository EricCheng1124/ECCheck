(function () {
  const VERSION = 'v7-autocrop-rotate';

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function smoothArray(arr, radius) {
    const out = new Array(arr.length).fill(0);
    for (let i = 0; i < arr.length; i++) {
      let sum = 0, count = 0;
      for (let j = -radius; j <= radius; j++) {
        const k = i + j;
        if (k >= 0 && k < arr.length) { sum += arr[k]; count++; }
      }
      out[i] = count ? sum / count : 0;
    }
    return out;
  }

  function median(arr) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  function rollingBackground(profile, halfWindow, excludeHalfWidth) {
    const out = new Array(profile.length).fill(0);
    for (let i = 0; i < profile.length; i++) {
      const values = [];
      const s = clamp(i - halfWindow, 0, profile.length - 1);
      const e = clamp(i + halfWindow, 0, profile.length - 1);
      for (let k = s; k <= e; k++) {
        if (Math.abs(k - i) > excludeHalfWidth) values.push(profile[k]);
      }
      out[i] = median(values);
    }
    return out;
  }

  function normalizeProfile(profile) {
    const maxVal = Math.max(1, ...profile);
    return profile.map(v => v / maxVal * 100);
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    return { h, s, v: max };
  }

  function redPinkScore(r, g, b) {
    const hsv = rgbToHsv(r, g, b);
    const redHue = (hsv.h <= 25 || hsv.h >= 330) ? 1 : 0;
    const pinkHue = (hsv.h >= 285 && hsv.h <= 345) ? 0.75 : 0;
    const hueGate = Math.max(redHue, pinkHue);
    const chromaRed = r - (g + b) * 0.5;
    const chromaMagenta = (r + b) * 0.5 - g;
    const saturationLike = Math.max(r, g, b) - Math.min(r, g, b);
    const score = Math.max(chromaRed, chromaMagenta) * 0.85 + saturationLike * 0.35;
    return clamp(score * (0.55 + hueGate * 0.45), 0, 255);
  }

  function isCassettePixel(r, g, b) {
    // 白色/米白塑膠卡匣：亮、低飽和。背景灰桌面會比較暗或偏色。
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max - min;
    const avg = (r + g + b) / 3;
    return avg > 135 && sat < 62 && r > 125 && g > 115 && b > 95;
  }

  function findCassetteBox(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width, h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h).data;

    const step = Math.max(2, Math.round(Math.max(w, h) / 420));
    let minX = w, minY = h, maxX = 0, maxY = 0, n = 0;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;

    // 只看中間 80%，避免白色網頁邊框或桌面亮區干擾
    const marginX = Math.floor(w * 0.08);
    const marginY = Math.floor(h * 0.04);

    for (let y = marginY; y < h - marginY; y += step) {
      for (let x = marginX; x < w - marginX; x += step) {
        const idx = (y * w + x) * 4;
        const r = img[idx], g = img[idx + 1], b = img[idx + 2];
        if (isCassettePixel(r, g, b)) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        }
      }
    }

    if (n < 80) {
      return { ok: false, x: 0, y: 0, w, h, angle: 0, confidence: 0 };
    }

    const mx = sx / n, my = sy / n;
    const covXX = sxx / n - mx * mx;
    const covYY = syy / n - my * my;
    const covXY = sxy / n - mx * my;
    let angle = 0.5 * Math.atan2(2 * covXY, covXX - covYY);
    // 主軸若接近水平，轉成垂直方向角度
    if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) angle += Math.PI / 2;
    const deg = angle * 180 / Math.PI;
    const rotateDeg = clamp(deg - 90, -25, 25);

    const padX = Math.round((maxX - minX) * 0.09);
    const padY = Math.round((maxY - minY) * 0.06);
    return {
      ok: true,
      x: clamp(minX - padX, 0, w - 1),
      y: clamp(minY - padY, 0, h - 1),
      w: clamp(maxX - minX + 1 + padX * 2, 1, w),
      h: clamp(maxY - minY + 1 + padY * 2, 1, h),
      angle: rotateDeg,
      confidence: n
    };
  }

  function makeCroppedCanvas(sourceCanvas, box) {
    // 先旋轉校正，再重新找一次卡匣 box，再裁切成統一尺寸。
    const w = sourceCanvas.width, h = sourceCanvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d');
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, w, h);
    tctx.translate(w / 2, h / 2);
    tctx.rotate(-box.angle * Math.PI / 180);
    tctx.drawImage(sourceCanvas, -w / 2, -h / 2);

    const box2 = findCassetteBox(tmp);
    const b = box2.ok ? box2 : box;

    const crop = document.createElement('canvas');
    crop.width = 360;
    crop.height = 760;
    const cctx = crop.getContext('2d');
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(0, 0, crop.width, crop.height);
    cctx.drawImage(tmp, b.x, b.y, b.w, b.h, 0, 0, crop.width, crop.height);
    return { canvas: crop, box: b, angle: box.angle };
  }

  function measureLine(profile, expectedRatio, options) {
    const len = profile.length;
    const expected = Math.round(len * expectedRatio);
    const searchHalfWidth = Math.round(len * options.positionTolerance);
    const peakHalfWidth = options.peakHalfWidth;
    const searchStart = clamp(expected - searchHalfWidth, 0, len - 1);
    const searchEnd = clamp(expected + searchHalfWidth, 0, len - 1);
    let peak = expected, peakValue = -Infinity;
    for (let i = searchStart; i <= searchEnd; i++) {
      if (profile[i] > peakValue) { peakValue = profile[i]; peak = i; }
    }
    const lineStart = clamp(peak - peakHalfWidth, 0, len - 1);
    const lineEnd = clamp(peak + peakHalfWidth, 0, len - 1);
    let area = 0, height = 0, width = 0;
    for (let i = lineStart; i <= lineEnd; i++) {
      const v = Math.max(0, profile[i]);
      area += v;
      height = Math.max(height, v);
      if (v > options.pixelMinSignal) width++;
    }
    return { y: peak, expectedY: expected, start: lineStart, end: lineEnd, height, area, width, peakValue };
  }

  function analyzeCanvas(canvas, options) {
    options = Object.assign({
      autoCrop: true,
      roiX1: 0.36,
      roiX2: 0.53,
      roiY1: 0.11,
      roiY2: 0.58,
      cPosition: 0.225,
      tPosition: 0.335,
      positionTolerance: 0.05,
      smoothRadius: 2,
      peakHalfWidth: 5,
      bgHalfWindow: 34,
      bgExcludeHalfWidth: 8,
      pixelMinSignal: 1.0,
      cMinArea: 7.0,
      cMinHeight: 1.2,
      tMinArea: 4.0,
      tMinHeight: 0.8,
      negativeRatio: 0.22,
      weakPositiveRatio: 0.50
    }, options || {});

    let sourceCanvas = canvas;
    let preprocess = { used: false, ok: false, angle: 0, confidence: 0 };
    if (options.autoCrop) {
      const box = findCassetteBox(canvas);
      if (box.ok) {
        const cropped = makeCroppedCanvas(canvas, box);
        canvas.width = cropped.canvas.width;
        canvas.height = cropped.canvas.height;
        canvas.getContext('2d').drawImage(cropped.canvas, 0, 0);
        sourceCanvas = canvas;
        preprocess = { used: true, ok: true, angle: cropped.angle, confidence: box.confidence, box: cropped.box };
      } else {
        preprocess = { used: true, ok: false, angle: 0, confidence: box.confidence };
      }
    }

    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const w = sourceCanvas.width, h = sourceCanvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    const x1 = Math.floor(w * options.roiX1);
    const x2 = Math.floor(w * options.roiX2);
    const y1 = Math.floor(h * options.roiY1);
    const y2 = Math.floor(h * options.roiY2);
    const roiH = Math.max(1, y2 - y1 + 1);
    const raw = new Array(roiH).fill(0);

    for (let y = y1; y <= y2; y++) {
      let sum = 0, count = 0;
      for (let x = x1; x <= x2; x++) {
        const idx = (y * w + x) * 4;
        sum += redPinkScore(data[idx], data[idx + 1], data[idx + 2]);
        count++;
      }
      raw[y - y1] = count ? sum / count : 0;
    }

    const smoothRaw = smoothArray(raw, options.smoothRadius);
    const bg = rollingBackground(smoothRaw, options.bgHalfWindow, options.bgExcludeHalfWidth);
    const corrected = smoothRaw.map((v, i) => Math.max(0, v - bg[i]));
    const profile = normalizeProfile(smoothArray(corrected, options.smoothRadius));

    const cLine = measureLine(profile, options.cPosition, options);
    const tLine = measureLine(profile, options.tPosition, options);
    cLine.canvasY = y1 + cLine.y; tLine.canvasY = y1 + tLine.y;
    cLine.expectedCanvasY = y1 + cLine.expectedY; tLine.expectedCanvasY = y1 + tLine.expectedY;

    const ratio = cLine.area > 0 ? tLine.area / cLine.area : 0;
    const cValid = cLine.area >= options.cMinArea && cLine.height >= options.cMinHeight;
    const tValid = tLine.area >= options.tMinArea && tLine.height >= options.tMinHeight;

    let result, label;
    if (!preprocess.ok && options.autoCrop) { result = 'INVALID'; label = '無效 / 未能自動裁切快篩外框'; }
    else if (!cValid) { result = 'INVALID'; label = '無效 / C線不足或未出現'; }
    else if (!tValid || ratio < options.negativeRatio) { result = 'NEGATIVE'; label = '陰性 / C線有效，T線未達門檻'; }
    else if (ratio < options.weakPositiveRatio) { result = 'WEAK_POSITIVE'; label = '弱陽性 / T線訊號偏弱'; }
    else { result = 'POSITIVE'; label = '陽性 / T線與C線皆有效'; }

    return { version: VERSION, result, label, ratio, cLine, tLine, peaks: [cLine, tLine], profile, rawProfile: smoothRaw, roi: { x1, x2, y1, y2 }, options, preprocess };
  }

  window.AsapDetector = { analyzeCanvas, version: VERSION };
})();
