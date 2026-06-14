(function () {
  const VERSION = 'v10-autocrop-no-stretch';

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
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max - min;
    const avg = (r + g + b) / 3;
    // v10: stricter white-plastic mask. 先避免把桌面整片吃進來。
    return avg > 145 && sat < 48 && r > 135 && g > 130 && b > 115;
  }

  function findCassetteBox(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width, h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h).data;
    const step = Math.max(2, Math.round(Math.max(w, h) / 520));

    const col = new Array(w).fill(0);
    const row = new Array(h).fill(0);

    // 先建立投影，不做旋轉。自動旋轉很容易誤判，v10 只裁切不拉伸。
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const idx = (y * w + x) * 4;
        const r = img[idx], g = img[idx + 1], b = img[idx + 2];
        if (isCassettePixel(r, g, b)) {
          col[x] += step;
          row[y] += step;
        }
      }
    }

    function smoothProjection(a, radius) {
      const out = new Array(a.length).fill(0);
      for (let i = 0; i < a.length; i++) {
        let sum = 0, count = 0;
        for (let j = -radius; j <= radius; j++) {
          const k = i + j;
          if (k >= 0 && k < a.length) { sum += a[k]; count++; }
        }
        out[i] = count ? sum / count : 0;
      }
      return out;
    }

    function segmentsFromProjection(proj, threshold, minLen) {
      const segs = [];
      let start = -1;
      for (let i = 0; i < proj.length; i++) {
        if (proj[i] >= threshold && start < 0) start = i;
        if ((proj[i] < threshold || i === proj.length - 1) && start >= 0) {
          const end = (proj[i] < threshold) ? i - 1 : i;
          if (end - start + 1 >= minLen) segs.push({ start, end, len: end - start + 1 });
          start = -1;
        }
      }
      return segs;
    }

    const scol = smoothProjection(col, Math.max(3, Math.round(w / 160)));
    const srow = smoothProjection(row, Math.max(3, Math.round(h / 160)));

    // threshold 用相對最大值，桌面太亮時也不會直接全吃。
    const colMax = Math.max(1, ...scol);
    const rowMax = Math.max(1, ...srow);
    const xSegs = segmentsFromProjection(scol, colMax * 0.42, Math.round(w * 0.045));
    const ySegs = segmentsFromProjection(srow, rowMax * 0.32, Math.round(h * 0.20));

    let best = null;
    for (const xs of xSegs) {
      for (const ys of ySegs) {
        const bw = xs.end - xs.start + 1;
        const bh = ys.end - ys.start + 1;
        const ar = bw / Math.max(1, bh);
        const cx = (xs.start + xs.end) / 2;
        const cy = (ys.start + ys.end) / 2;

        // 快篩卡通常是直長條；排除整片桌面與太小區塊。
        if (ar < 0.18 || ar > 0.70) continue;
        if (bh < h * 0.35 || bh > h * 0.98) continue;
        if (bw < w * 0.06 || bw > w * 0.55) continue;

        // 中央優先，但不強制。
        const centerPenalty = Math.abs(cx - w * 0.5) / w + Math.abs(cy - h * 0.52) / h;
        const sizeScore = bh * 1.6 - bw * 0.2;
        const score = sizeScore - centerPenalty * 600;
        if (!best || score > best.score) best = { xs, ys, score, ar };
      }
    }

    if (!best) {
      return { ok: false, x: 0, y: 0, w, h, angle: 0, confidence: 0, reason: 'no-cassette-segment' };
    }

    const xs = best.xs, ys = best.ys;
    const bw = xs.end - xs.start + 1;
    const bh = ys.end - ys.start + 1;
    const padX = Math.round(bw * 0.10);
    const padY = Math.round(bh * 0.06);
    const x = clamp(xs.start - padX, 0, w - 1);
    const y = clamp(ys.start - padY, 0, h - 1);
    const ww = clamp(bw + padX * 2, 1, w - x);
    const hh = clamp(bh + padY * 2, 1, h - y);

    return { ok: true, x, y, w: ww, h: hh, angle: 0, confidence: Math.round(best.score), aspect: best.ar };
  }

  function makeCroppedCanvas(sourceCanvas, box) {
    // v10：裁切後保留原比例，不再強制壓成 360x760，避免畫面被拉長。
    const maxH = 760;
    const scale = Math.min(1, maxH / box.h);
    const cw = Math.max(1, Math.round(box.w * scale));
    const ch = Math.max(1, Math.round(box.h * scale));
    const crop = document.createElement('canvas');
    crop.width = cw;
    crop.height = ch;
    const cctx = crop.getContext('2d');
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(0, 0, cw, ch);
    cctx.drawImage(sourceCanvas, box.x, box.y, box.w, box.h, 0, 0, cw, ch);
    return { canvas: crop, box, angle: 0 };
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
      roiX1: 0.35,
      roiX2: 0.58,
      roiY1: 0.10,
      roiY2: 0.62,
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
    if (!preprocess.ok && options.autoCrop) { result = 'INVALID'; label = '無效 / 未能自動裁切快篩外框，請靠近一點拍或放深色背景'; }
    else if (!cValid) { result = 'INVALID'; label = '無效 / C線不足或未出現'; }
    else if (!tValid || ratio < options.negativeRatio) { result = 'NEGATIVE'; label = '陰性 / C線有效，T線未達門檻'; }
    else if (ratio < options.weakPositiveRatio) { result = 'WEAK_POSITIVE'; label = '弱陽性 / T線訊號偏弱'; }
    else { result = 'POSITIVE'; label = '陽性 / T線與C線皆有效'; }

    return { version: VERSION, result, label, ratio, cLine, tLine, peaks: [cLine, tLine], profile, rawProfile: smoothRaw, roi: { x1, x2, y1, y2 }, options, preprocess };
  }

  window.AsapDetector = { analyzeCanvas, version: VERSION };
})();
