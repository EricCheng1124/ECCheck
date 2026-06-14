(function () {
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function smoothArray(arr, radius) {
    const out = new Array(arr.length).fill(0);
    for (let i = 0; i < arr.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = -radius; j <= radius; j++) {
        const k = i + j;
        if (k >= 0 && k < arr.length) {
          sum += arr[k];
          count++;
        }
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

  function getLocalBackground(profile, center, halfWindow, excludeHalfWidth) {
    const values = [];
    const start = clamp(center - halfWindow, 0, profile.length - 1);
    const end = clamp(center + halfWindow, 0, profile.length - 1);
    for (let i = start; i <= end; i++) {
      if (Math.abs(i - center) > excludeHalfWidth) values.push(profile[i]);
    }
    return median(values);
  }

  function measureLine(profile, expectedRatio, options) {
    const len = profile.length;
    const expected = Math.round(len * expectedRatio);
    const searchHalfWidth = Math.round(len * options.positionTolerance);
    const peakHalfWidth = options.peakHalfWidth;

    const searchStart = clamp(expected - searchHalfWidth, 0, len - 1);
    const searchEnd = clamp(expected + searchHalfWidth, 0, len - 1);

    let peak = expected;
    let peakValue = -Infinity;
    for (let i = searchStart; i <= searchEnd; i++) {
      if (profile[i] > peakValue) {
        peakValue = profile[i];
        peak = i;
      }
    }

    const bg = getLocalBackground(profile, peak, options.bgHalfWindow, peakHalfWidth + 2);
    const lineStart = clamp(peak - peakHalfWidth, 0, len - 1);
    const lineEnd = clamp(peak + peakHalfWidth, 0, len - 1);

    let area = 0;
    let height = 0;
    let width = 0;
    for (let i = lineStart; i <= lineEnd; i++) {
      const v = Math.max(0, profile[i] - bg);
      area += v;
      if (v > height) height = v;
      if (v > options.pixelMinSignal) width++;
    }

    return {
      y: peak,
      expectedY: expected,
      start: lineStart,
      end: lineEnd,
      height,
      area,
      width,
      background: bg,
      peakValue
    };
  }

  function redPinkScore(r, g, b) {
    // 對粉紅/紫紅線加權；同時壓掉純陰影。
    const redPart = r - Math.max(g, b) * 0.58;
    const magentaPart = (r + b) * 0.5 - g * 0.78;
    return clamp(Math.max(redPart, magentaPart), 0, 255);
  }

  function analyzeCanvas(canvas, options) {
    options = Object.assign({
      // 直放快篩：C/T 是水平線，所以沿 Y 方向分析
      roiX1: 0.40,
      roiX2: 0.56,
      roiY1: 0.20,
      roiY2: 0.74,

      // ROI 內 C 在上、T 在下；依照片目前位置調整過
      cPosition: 0.36,
      tPosition: 0.48,
      positionTolerance: 0.075,

      smoothRadius: 2,
      peakHalfWidth: 4,
      bgHalfWindow: 24,
      pixelMinSignal: 0.55,

      // 先放寬門檻，讓弱線也能進入判斷；之後用實測照片再校正
      cMinArea: 5.0,
      cMinHeight: 0.65,
      tMinArea: 4.5,
      tMinHeight: 0.60,

      negativeRatio: 0.25,
      weakPositiveRatio: 0.55
    }, options || {});

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;

    const x1 = Math.floor(w * options.roiX1);
    const x2 = Math.floor(w * options.roiX2);
    const y1 = Math.floor(h * options.roiY1);
    const y2 = Math.floor(h * options.roiY2);
    const roiH = Math.max(1, y2 - y1 + 1);

    const profile = new Array(roiH).fill(0);
    for (let y = y1; y <= y2; y++) {
      let sum = 0;
      let count = 0;
      for (let x = x1; x <= x2; x++) {
        const idx = (y * w + x) * 4;
        sum += redPinkScore(data[idx], data[idx + 1], data[idx + 2]);
        count++;
      }
      profile[y - y1] = count ? sum / count : 0;
    }

    const smooth = smoothArray(profile, options.smoothRadius);
    const cLine = measureLine(smooth, options.cPosition, options);
    const tLine = measureLine(smooth, options.tPosition, options);

    cLine.canvasY = y1 + cLine.y;
    tLine.canvasY = y1 + tLine.y;

    const ratio = cLine.area > 0 ? tLine.area / cLine.area : 0;

    const cValid = cLine.area >= options.cMinArea && cLine.height >= options.cMinHeight;
    const tValid = tLine.area >= options.tMinArea && tLine.height >= options.tMinHeight;

    let result;
    let label;
    if (!cValid) {
      result = 'INVALID';
      label = '無效 / C線不足或未出現';
    } else if (!tValid || ratio < options.negativeRatio) {
      result = 'NEGATIVE';
      label = '陰性 / C線有效，T線未達門檻';
    } else if (ratio < options.weakPositiveRatio) {
      result = 'WEAK_POSITIVE';
      label = '弱陽性 / T線訊號偏弱';
    } else {
      result = 'POSITIVE';
      label = '陽性 / T線與C線皆有效';
    }

    return {
      result,
      label,
      ratio,
      cLine,
      tLine,
      peaks: [cLine, tLine],
      profile: smooth,
      roi: { x1, x2, y1, y2 },
      options
    };
  }

  window.AsapDetector = { analyzeCanvas };
})();
