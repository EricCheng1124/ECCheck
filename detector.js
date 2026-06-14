(function () {
  const VERSION = 'v12-line-window-crop';

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

  function percentile(arr, p) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    const idx = clamp(Math.round((a.length - 1) * p), 0, a.length - 1);
    return a[idx];
  }

  function redPinkScore(r, g, b) {
    // 對淡粉紅/紫紅快篩線比較敏感，同時壓低陰影與白塑膠反光。
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const avg = (r + g + b) / 3;
    const sat = max - min;

    const redExcess = Math.max(0, r - g) * 0.9 + Math.max(0, r - b) * 0.9;
    const pinkRatio = r / Math.max(1, (g + b) / 2);
    const ratioBoost = Math.max(0, pinkRatio - 1.015) * 95;

    const brightnessGate = avg > 55 ? 1 : 0.25;
    const saturationGate = sat > 3 ? 1 : 0.25;

    return clamp((redExcess + ratioBoost) * brightnessGate * saturationGate, 0, 255);
  }

  function getImage(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return { ctx, w: canvas.width, h: canvas.height, img: ctx.getImageData(0, 0, canvas.width, canvas.height), data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
  }

  function buildRedMap(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width, h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    const score = new Float32Array(w * h);
    const row = new Array(h).fill(0);
    const vals = [];

    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const s = redPinkScore(data[idx], data[idx + 1], data[idx + 2]);
        score[y * w + x] = s;
        sum += s;
      }
      row[y] = sum / w;
      if (y % 3 === 0) vals.push(row[y]);
    }

    const bg = median(vals);
    const corrected = row.map(v => Math.max(0, v - bg));
    return { w, h, score, row: smoothArray(corrected, 2) };
  }

  function findPeaks(profile, options) {
    const maxVal = Math.max(1, ...profile);
    const threshold = Math.max(0.8, maxVal * 0.18, (options.redThreshold || 38) / 32);
    const minWidth = Math.max(1, options.minPeakWidth || 3);
    const candidates = [];
    let start = -1;

    for (let i = 0; i < profile.length; i++) {
      if (profile[i] >= threshold && start < 0) start = i;
      if ((profile[i] < threshold || i === profile.length - 1) && start >= 0) {
        const end = profile[i] < threshold ? i - 1 : i;
        if (end - start + 1 >= minWidth) {
          let area = 0, height = 0, y = start;
          for (let k = start; k <= end; k++) {
            area += profile[k];
            if (profile[k] > height) { height = profile[k]; y = k; }
          }
          candidates.push({ y, start, end, area, height, width: end - start + 1 });
        }
        start = -1;
      }
    }

    return candidates.sort((a, b) => b.area - a.area);
  }

  function xStatsForBand(redMap, yCenter, halfY) {
    const { w, h, score } = redMap;
    const xs = [];
    const sY = clamp(Math.round(yCenter - halfY), 0, h - 1);
    const eY = clamp(Math.round(yCenter + halfY), 0, h - 1);
    let maxS = 0;
    for (let y = sY; y <= eY; y++) {
      for (let x = 0; x < w; x++) {
        const s = score[y * w + x];
        if (s > maxS) maxS = s;
      }
    }
    const th = Math.max(5, maxS * 0.45);
    for (let y = sY; y <= eY; y++) {
      for (let x = 0; x < w; x++) {
        if (score[y * w + x] >= th) xs.push(x);
      }
    }
    if (!xs.length) return null;
    xs.sort((a, b) => a - b);
    return {
      minX: percentile(xs, 0.05),
      maxX: percentile(xs, 0.95),
      centerX: median(xs),
      count: xs.length
    };
  }

  function findLinePairInOriginal(canvas, options) {
    const redMap = buildRedMap(canvas);
    const peaks = findPeaks(redMap.row, options)
      .filter(p => p.y > redMap.h * 0.08 && p.y < redMap.h * 0.92)
      .slice(0, 12);

    let best = null;
    for (let i = 0; i < peaks.length; i++) {
      for (let j = i + 1; j < peaks.length; j++) {
        const a = peaks[i].y < peaks[j].y ? peaks[i] : peaks[j];
        const b = peaks[i].y < peaks[j].y ? peaks[j] : peaks[i];
        const d = b.y - a.y;
        if (d < redMap.h * 0.012 || d > redMap.h * 0.16) continue;
        const xsA = xStatsForBand(redMap, a.y, Math.max(3, a.width));
        const xsB = xStatsForBand(redMap, b.y, Math.max(3, b.width));
        if (!xsA || !xsB) continue;
        if (Math.abs(xsA.centerX - xsB.centerX) > redMap.w * 0.09) continue;

        const centerX = (xsA.centerX + xsB.centerX) / 2;
        const centerPenalty = Math.abs(centerX - redMap.w * 0.5) / redMap.w;
        const score = a.area + b.area - centerPenalty * 8;
        if (!best || score > best.score) {
          best = { c: a, t: b, xA: xsA, xB: xsB, redMap, score, distance: d };
        }
      }
    }

    return best || { redMap, c: null, t: null, score: 0 };
  }

  function cropWindowFromLines(sourceCanvas, pair) {
    const w = sourceCanvas.width, h = sourceCanvas.height;

    if (!pair || !pair.c || !pair.t) {
      return {
        ok: false,
        reason: 'no-line-pair',
        x: 0, y: 0, w, h,
        canvas: sourceCanvas
      };
    }

    const cY = pair.c.y;
    const tY = pair.t.y;
    const d = Math.max(10, tY - cY);
    const cx = (pair.xA.centerX + pair.xB.centerX) / 2;
    const lineW = Math.max(pair.xA.maxX - pair.xA.minX, pair.xB.maxX - pair.xB.minX, 12);

    // 這裡是「判讀窗」裁切，不是整張快篩卡匣裁切。
    const cropW = Math.max(lineW * 5.0, w * 0.085, 72);
    const topPad = Math.max(d * 2.2, 45);
    const bottomPad = Math.max(d * 3.1, 70);

    let x = Math.round(cx - cropW / 2);
    let y = Math.round(cY - topPad);
    let cw = Math.round(cropW);
    let ch = Math.round((tY + bottomPad) - y);

    x = clamp(x, 0, w - 2);
    y = clamp(y, 0, h - 2);
    cw = clamp(cw, 2, w - x);
    ch = clamp(ch, 2, h - y);

    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    const ctx = out.getContext('2d');
    ctx.drawImage(sourceCanvas, x, y, cw, ch, 0, 0, cw, ch);

    return {
      ok: true,
      reason: 'line-window',
      x, y, w: cw, h: ch,
      canvas: out,
      cYOriginal: cY,
      tYOriginal: tY,
      cYInCrop: cY - y,
      tYInCrop: tY - y,
      pairDistance: d,
      lineCenterX: cx
    };
  }

  function makeProfileFromCrop(cropCanvas) {
    const ctx = cropCanvas.getContext('2d', { willReadFrequently: true });
    const w = cropCanvas.width, h = cropCanvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    const raw = new Array(h).fill(0);

    const x1 = Math.round(w * 0.12);
    const x2 = Math.round(w * 0.88);
    for (let y = 0; y < h; y++) {
      let sum = 0, count = 0;
      for (let x = x1; x <= x2; x++) {
        const idx = (y * w + x) * 4;
        sum += redPinkScore(data[idx], data[idx + 1], data[idx + 2]);
        count++;
      }
      raw[y] = count ? sum / count : 0;
    }

    const smooth = smoothArray(raw, 2);
    const base = median(smooth);
    return smooth.map(v => Math.max(0, v - base));
  }

  function measureAround(profile, expectedY, halfWindow) {
    const y0 = clamp(Math.round(expectedY - halfWindow), 0, profile.length - 1);
    const y1 = clamp(Math.round(expectedY + halfWindow), 0, profile.length - 1);
    let peakY = expectedY, height = 0;
    for (let y = y0; y <= y1; y++) {
      if (profile[y] > height) { height = profile[y]; peakY = y; }
    }

    const areaHalf = Math.max(4, Math.round(halfWindow * 0.8));
    let area = 0, width = 0;
    const s = clamp(Math.round(peakY - areaHalf), 0, profile.length - 1);
    const e = clamp(Math.round(peakY + areaHalf), 0, profile.length - 1);
    const th = Math.max(0.8, height * 0.35);
    for (let y = s; y <= e; y++) {
      area += profile[y];
      if (profile[y] >= th) width++;
    }
    return { y: peakY, canvasY: peakY, start: s, end: e, area, height, width };
  }

  function analyzeCanvas(canvas, options) {
    options = Object.assign({ redThreshold: 38, minPeakWidth: 3, minPeakDistance: 25 }, options || {});

    const pair = findLinePairInOriginal(canvas, options);
    const crop = cropWindowFromLines(canvas, pair);
    const cropCanvas = crop.canvas;
    const profile = makeProfileFromCrop(cropCanvas);

    let cLine, tLine;
    if (crop.ok) {
      const half = Math.max(5, crop.pairDistance * 0.45);
      cLine = measureAround(profile, crop.cYInCrop, half);
      tLine = measureAround(profile, crop.tYInCrop, half);
    } else {
      const peaks = findPeaks(profile, options).slice(0, 2).sort((a, b) => a.y - b.y);
      cLine = peaks[0] || { y: 0, canvasY: 0, area: 0, height: 0, width: 0 };
      tLine = peaks[1] || { y: 0, canvasY: 0, area: 0, height: 0, width: 0 };
    }

    const ratio = cLine.area > 0 ? tLine.area / cLine.area : 0;
    const cValid = cLine.area > 12 && cLine.height > 1.0;
    const tValid = tLine.area > 8 && tLine.height > 0.8;

    let result = 'INVALID', label = '無效 / 找不到有效C線';
    if (!crop.ok) {
      result = 'INVALID';
      label = '無效 / 找不到成對 C/T 線，無法裁切判讀窗';
    } else if (!cValid) {
      result = 'INVALID';
      label = '無效 / C線訊號不足';
    } else if (!tValid || ratio < 0.08) {
      result = 'NEGATIVE';
      label = '陰性 / 只有C線有效';
    } else if (ratio < 0.22) {
      result = 'WEAK_POSITIVE';
      label = '弱陽性 / T線較弱';
    } else {
      result = 'POSITIVE';
      label = '陽性 / C線與T線皆有效';
    }

    return {
      version: VERSION,
      result,
      label,
      ratio,
      processedCanvas: cropCanvas,
      preprocess: {
        ok: crop.ok,
        reason: crop.reason,
        x: crop.x, y: crop.y, w: crop.w, h: crop.h,
        mode: 'line-window-crop'
      },
      roi: { x1: 0, y1: 0, x2: cropCanvas.width, y2: cropCanvas.height },
      cLine,
      tLine,
      peaks: [cLine, tLine],
      allPeaks: findPeaks(profile, options).slice(0, 6),
      profile
    };
  }

  window.AsapDetector = { analyzeCanvas };
})();
