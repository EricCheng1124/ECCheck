(function () {
  const VERSION = 'v11-cassette-crop-shadow-safe';

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

  function redPinkScore(r, g, b) {
    // 對淡粉紅線比較敏感，但避免把單純暗影當紅線。
    const rg = r - g;
    const rb = r - b;
    const avg = (r + g + b) / 3;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const redExcess = Math.max(0, rg) * 0.75 + Math.max(0, rb) * 0.75;
    const pinkBoost = Math.max(0, r - (g + b) * 0.50);
    const brightnessGate = avg > 65 ? 1 : 0.35;
    const saturationGate = sat > 4 ? 1 : 0.30;
    return clamp((redExcess + pinkBoost * 0.55) * brightnessGate * saturationGate, 0, 255);
  }

  function getImageDataFast(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return { ctx, w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
  }

  function findCassetteBox(canvas) {
    const { w, h, data } = getImageDataFast(canvas);
    const target = 230;
    const step = Math.max(1, Math.round(Math.max(w, h) / target));
    const dw = Math.ceil(w / step);
    const dh = Math.ceil(h / step);

    const whiteness = new Float32Array(dw * dh);
    const values = [];

    for (let yy = 0; yy < dh; yy++) {
      const y = clamp(yy * step, 0, h - 1);
      for (let xx = 0; xx < dw; xx++) {
        const x = clamp(xx * step, 0, w - 1);
        const idx = (y * w + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const avg = (r + g + b) / 3;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        // 白塑膠分數：亮、低飽和。陰影會降低 avg，但仍可保留部分分數。
        const score = avg - sat * 1.10;
        whiteness[yy * dw + xx] = score;
        values.push(score);
      }
    }

    const p78 = percentile(values, 0.78);
    const p90 = percentile(values, 0.90);
    const threshold = Math.max(132, p78 + (p90 - p78) * 0.20);

    const mask = new Uint8Array(dw * dh);
    for (let i = 0; i < mask.length; i++) {
      mask[i] = whiteness[i] >= threshold ? 1 : 0;
    }

    // 小型形態學 closing：補快篩因陰影造成的小斷裂。
    const closed = new Uint8Array(mask.length);
    for (let y = 1; y < dh - 1; y++) {
      for (let x = 1; x < dw - 1; x++) {
        let cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) cnt += mask[(y + dy) * dw + (x + dx)];
        }
        closed[y * dw + x] = cnt >= 3 ? 1 : 0;
      }
    }

    const visited = new Uint8Array(closed.length);
    const qx = [], qy = [];
    let best = null;

    for (let sy = 1; sy < dh - 1; sy++) {
      for (let sx = 1; sx < dw - 1; sx++) {
        const startIdx = sy * dw + sx;
        if (!closed[startIdx] || visited[startIdx]) continue;

        let head = 0;
        qx.length = 0; qy.length = 0;
        qx.push(sx); qy.push(sy);
        visited[startIdx] = 1;

        let minX = sx, maxX = sx, minY = sy, maxY = sy, area = 0, border = false, sumScore = 0;
        while (head < qx.length) {
          const x = qx[head], y = qy[head]; head++;
          area++;
          sumScore += whiteness[y * dw + x];
          if (x <= 1 || y <= 1 || x >= dw - 2 || y >= dh - 2) border = true;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;

          const nx4 = [x + 1, x - 1, x, x];
          const ny4 = [y, y, y + 1, y - 1];
          for (let k = 0; k < 4; k++) {
            const nx = nx4[k], ny = ny4[k];
            if (nx < 0 || ny < 0 || nx >= dw || ny >= dh) continue;
            const ni = ny * dw + nx;
            if (closed[ni] && !visited[ni]) {
              visited[ni] = 1;
              qx.push(nx); qy.push(ny);
            }
          }
        }

        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const ar = bw / Math.max(1, bh);
        const areaRatio = area / (dw * dh);
        const fill = area / Math.max(1, bw * bh);
        const cx = (minX + maxX) / 2 / dw;
        const cy = (minY + maxY) / 2 / dh;

        // 快篩外觀：直長條、不貼邊、面積合理。排除桌面大亮區與太小反光。
        if (border) continue;
        if (ar < 0.16 || ar > 0.82) continue;
        if (bh < dh * 0.25 || bh > dh * 0.96) continue;
        if (bw < dw * 0.045 || bw > dw * 0.55) continue;
        if (areaRatio < 0.008 || areaRatio > 0.42) continue;
        if (fill < 0.18) continue;

        const centerPenalty = Math.abs(cx - 0.5) * 0.35 + Math.abs(cy - 0.52) * 0.20;
        const longScore = bh * 2.2 + area * 0.12 + (sumScore / area) * 0.02;
        const score = longScore - centerPenalty * 120;
        if (!best || score > best.score) {
          best = { minX, maxX, minY, maxY, score, ar, area, fill };
        }
      }
    }

    if (!best) {
      return { ok: false, x: 0, y: 0, w, h, reason: 'no-cassette-component', confidence: 0 };
    }

    let x = best.minX * step;
    let y = best.minY * step;
    let ww = (best.maxX - best.minX + 1) * step;
    let hh = (best.maxY - best.minY + 1) * step;

    // 外框 padding：保留整支快篩邊緣，不讓分析只剩局部。
    const padX = Math.round(ww * 0.18);
    const padY = Math.round(hh * 0.08);
    x = clamp(x - padX, 0, w - 1);
    y = clamp(y - padY, 0, h - 1);
    ww = clamp(ww + padX * 2, 1, w - x);
    hh = clamp(hh + padY * 2, 1, h - y);

    return {
      ok: true,
      x, y, w: ww, h: hh,
      reason: 'component',
      confidence: Math.round(best.score),
      aspect: best.ar,
      fill: best.fill
    };
  }

  function makeCroppedCanvas(sourceCanvas, box) {
    const maxH = 680;
    const maxW = 430;
    const scale = Math.min(1, maxH / box.h, maxW / box.w);
    const cw = Math.max(1, Math.round(box.w * scale));
    const ch = Math.max(1, Math.round(box.h * scale));
    const crop = document.createElement('canvas');
    crop.width = cw;
    crop.height = ch;
    const cctx = crop.getContext('2d');
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(0, 0, cw, ch);
    cctx.drawImage(sourceCanvas, box.x, box.y, box.w, box.h, 0, 0, cw, ch);
    return { canvas: crop, box, scale };
  }

  function findPeaks(profile, options) {
    const threshold = Math.max(2.2, (options.redThreshold || 38) / 9.5);
    const minWidth = Math.max(1, options.minPeakWidth || 3);
    const minDistance = Math.max(8, options.minPeakDistance || 25);
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

    candidates.sort((a, b) => b.area - a.area);
    const selected = [];
    for (const p of candidates) {
      if (!selected.some(q => Math.abs(q.y - p.y) < minDistance)) selected.push(p);
      if (selected.length >= 4) break;
    }
    return selected.sort((a, b) => a.y - b.y);
  }

  function analyzeCanvas(canvas, options) {
    options = Object.assign({
      autoCrop: true,
      roiX1: 0.30,
      roiX2: 0.62,
      roiY1: 0.14,
      roiY2: 0.66,
      smoothRadius: 2,
      bgHalfWindow: 22,
      bgExcludeHalfWidth: 5,
      redThreshold: 38,
      minPeakWidth: 3,
      minPeakDistance: 25,
      cMinArea: 18,
      cMinHeight: 4.0,
      tMinArea: 10,
      tMinHeight: 2.5,
      negativeRatio: 0.22,
      weakPositiveRatio: 0.50
    }, options || {});

    let preprocess = { used: false, ok: false, reason: 'off' };
    if (options.autoCrop) {
      const box = findCassetteBox(canvas);
      if (box.ok) {
        const cropped = makeCroppedCanvas(canvas, box);
        canvas.width = cropped.canvas.width;
        canvas.height = cropped.canvas.height;
        canvas.getContext('2d').drawImage(cropped.canvas, 0, 0);
        preprocess = { used: true, ok: true, reason: box.reason, confidence: box.confidence, box, aspect: box.aspect, fill: box.fill };
      } else {
        preprocess = { used: true, ok: false, reason: box.reason, confidence: 0 };
      }
    }

    const { w, h, data } = getImageDataFast(canvas);
    const x1 = Math.floor(w * options.roiX1);
    const x2 = Math.floor(w * options.roiX2);
    const y1 = Math.floor(h * options.roiY1);
    const y2 = Math.floor(h * options.roiY2);
    const len = Math.max(1, y2 - y1 + 1);
    const rawProfile = new Array(len).fill(0);

    for (let y = y1; y <= y2; y++) {
      let sum = 0, count = 0;
      for (let x = x1; x <= x2; x++) {
        const idx = (y * w + x) * 4;
        sum += redPinkScore(data[idx], data[idx + 1], data[idx + 2]);
        count++;
      }
      rawProfile[y - y1] = count ? sum / count : 0;
    }

    const smooth = smoothArray(rawProfile, options.smoothRadius);
    const bg = rollingBackground(smooth, options.bgHalfWindow, options.bgExcludeHalfWidth);
    const corrected = smooth.map((v, i) => Math.max(0, v - bg[i]));
    const profile = normalizeProfile(smoothArray(corrected, 1));
    const peaks = findPeaks(profile, options);

    let cLine = null, tLine = null;
    if (peaks.length >= 2) {
      // 從上到下：上方當 C，下方當 T。快篩線方向為水平。
      cLine = peaks[0];
      tLine = peaks[1];
    } else if (peaks.length === 1) {
      cLine = peaks[0];
      tLine = { y: Math.min(profile.length - 1, peaks[0].y + Math.round(profile.length * 0.12)), start: 0, end: 0, area: 0, height: 0, width: 0 };
    } else {
      cLine = { y: Math.round(profile.length * 0.24), start: 0, end: 0, area: 0, height: 0, width: 0 };
      tLine = { y: Math.round(profile.length * 0.36), start: 0, end: 0, area: 0, height: 0, width: 0 };
    }

    cLine.canvasY = y1 + cLine.y;
    tLine.canvasY = y1 + tLine.y;

    const ratio = cLine.area > 0 ? tLine.area / cLine.area : 0;
    const cValid = cLine.area >= options.cMinArea && cLine.height >= options.cMinHeight && cLine.width >= options.minPeakWidth;
    const tValid = tLine.area >= options.tMinArea && tLine.height >= options.tMinHeight && tLine.width >= options.minPeakWidth;

    let result = 'INVALID';
    let label = '無效 / C線不足或未出現';

    if (!cValid) {
      result = 'INVALID';
      label = '無效 / C線不足或未出現';
    } else if (!tValid || ratio < options.negativeRatio) {
      result = 'NEGATIVE';
      label = '陰性 / 僅偵測到控制線';
    } else if (ratio < options.weakPositiveRatio) {
      result = 'WEAK_POSITIVE';
      label = '弱陽性 / T線訊號偏弱';
    } else {
      result = 'POSITIVE';
      label = '陽性 / T線與C線皆有效';
    }

    return {
      version: VERSION,
      result,
      label,
      preprocess,
      ratio,
      cLine,
      tLine,
      peaks: [cLine, tLine],
      allPeaks: peaks,
      profile,
      roi: { x1, x2, y1, y2 }
    };
  }

  window.AsapDetector = { analyzeCanvas };
})();
