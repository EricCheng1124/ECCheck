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

    const lineStart = clamp(peak - peakHalfWidth, 0, len - 1);
    const lineEnd = clamp(peak + peakHalfWidth, 0, len - 1);

    let area = 0;
    let height = 0;
    let width = 0;
    for (let i = lineStart; i <= lineEnd; i++) {
      const v = Math.max(0, profile[i]);
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
      background: 0,
      peakValue
    };
  }

  function redPinkScore(r, g, b) {
    // 粉紅/紫紅線：紅色或紫紅色都可抓；盡量避開灰影。
    const chromaRed = r - (g + b) * 0.5;
    const chromaMagenta = (r + b) * 0.5 - g;
    const saturationLike = Math.max(r, g, b) - Math.min(r, g, b);
    return clamp(Math.max(chromaRed, chromaMagenta) + saturationLike * 0.18, 0, 255);
  }

  function darkLineScore(r, g, b) {
    // 淡線有時不是很紅，而是比背景稍暗；補一點暗線訊號。
    const gray = (r + g + b) / 3;
    return clamp(210 - gray, 0, 80) * 0.15;
  }

  function analyzeCanvas(canvas, options) {
    options = Object.assign({
      // v5：只取判讀窗中間的試紙區，不要吃到右側 C/T 字樣與外殼陰影
      roiX1: 0.405,
      roiX2: 0.495,
      roiY1: 0.21,
      roiY2: 0.61,

      // ROI 內 C 在上、T 在下；目前這張照片較接近這組
      cPosition: 0.31,
      tPosition: 0.43,
      positionTolerance: 0.045,

      smoothRadius: 2,
      peakHalfWidth: 4,
      bgHalfWindow: 28,
      bgExcludeHalfWidth: 6,
      pixelMinSignal: 1.2,

      // 使用背景扣除後的 normalized profile，門檻單位約為 0~100
      cMinArea: 8.0,
      cMinHeight: 1.4,
      tMinArea: 5.0,
      tMinHeight: 1.0,

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

    const raw = new Array(roiH).fill(0);
    for (let y = y1; y <= y2; y++) {
      let sum = 0;
      let count = 0;
      for (let x = x1; x <= x2; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        sum += redPinkScore(r, g, b) + darkLineScore(r, g, b);
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

    cLine.canvasY = y1 + cLine.y;
    tLine.canvasY = y1 + tLine.y;
    cLine.expectedCanvasY = y1 + cLine.expectedY;
    tLine.expectedCanvasY = y1 + tLine.expectedY;

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
      profile,
      rawProfile: smoothRaw,
      roi: { x1, x2, y1, y2 },
      options
    };
  }

  window.AsapDetector = { analyzeCanvas };
})();
