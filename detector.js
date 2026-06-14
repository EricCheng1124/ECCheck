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
      out[i] = sum / count;
    }
    return out;
  }

  function median(arr) {
    const a = arr.slice().sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  function getLocalBackground(profile, center, halfWindow, excludeHalfWidth) {
    const values = [];
    const start = clamp(center - halfWindow, 0, profile.length - 1);
    const end = clamp(center + halfWindow, 0, profile.length - 1);

    for (let i = start; i <= end; i++) {
      if (Math.abs(i - center) > excludeHalfWidth) {
        values.push(profile[i]);
      }
    }

    if (values.length === 0) return 0;
    return median(values);
  }

  function measureLine(profile, expectedRatio, options) {
    const w = profile.length;
    const expectedX = Math.round(w * expectedRatio);

    const searchHalfWidth = Math.round(w * (options.positionTolerance || 0.06));
    const peakHalfWidth = options.peakHalfWidth || 6;
    const bgHalfWindow = options.bgHalfWindow || 35;

    const searchStart = clamp(expectedX - searchHalfWidth, 0, w - 1);
    const searchEnd = clamp(expectedX + searchHalfWidth, 0, w - 1);

    let peakX = expectedX;
    let peakValue = -Infinity;

    for (let x = searchStart; x <= searchEnd; x++) {
      if (profile[x] > peakValue) {
        peakValue = profile[x];
        peakX = x;
      }
    }

    const bg = getLocalBackground(profile, peakX, bgHalfWindow, peakHalfWidth + 2);

    let area = 0;
    let height = 0;
    let width = 0;

    const lineStart = clamp(peakX - peakHalfWidth, 0, w - 1);
    const lineEnd = clamp(peakX + peakHalfWidth, 0, w - 1);

    for (let x = lineStart; x <= lineEnd; x++) {
      const v = Math.max(0, profile[x] - bg);
      area += v;
      if (v > height) height = v;
      if (v > options.pixelMinSignal) width++;
    }

    return {
      expectedX,
      x: peakX,
      start: lineStart,
      end: lineEnd,
      height,
      area,
      width,
      background: bg
    };
  }

  function analyzeCanvas(canvas, options) {
    options = Object.assign({
      // ROI 高度範圍
      roiY1: 0.22,
      roiY2: 0.78,

      // T/C 線大概位置，依你的快篩圖可微調
      tPosition: 0.42,
      cPosition: 0.68,
      positionTolerance: 0.06,

      // 線寬與背景扣除
      peakHalfWidth: 6,
      bgHalfWindow: 35,
      smoothRadius: 3,

      // 判斷門檻，之後要用實測照片校正
      cMinArea: 180,
      cMinHeight: 8,
      tMinArea: 25,
      tMinHeight: 3,
      pixelMinSignal: 2,

      negativeRatio: 0.05,
      weakPositiveRatio: 0.15
    }, options || {});

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;

    const y1 = Math.floor(h * options.roiY1);
    const y2 = Math.floor(h * options.roiY2);

    const profile = new Array(w).fill(0);

    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;

      for (let y = y1; y <= y2; y++) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // 紅 / 紫紅線強度
        const redScore = r - Math.max(g, b) * 0.72;

        sum += clamp(redScore, 0, 255);
        count++;
      }

      profile[x] = sum / count;
    }

    const smooth = smoothArray(profile, options.smoothRadius);

    const tLine = measureLine(smooth, options.tPosition, options);
    const cLine = measureLine(smooth, options.cPosition, options);

    const ratio = cLine.area > 0 ? tLine.area / cLine.area : 0;

    let result = 'INVALID';
    let label = '無效 / 未找到控制線';

    const cValid =
      cLine.area >= options.cMinArea &&
      cLine.height >= options.cMinHeight;

    const tValid =
      tLine.area >= options.tMinArea &&
      tLine.height >= options.tMinHeight;

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
      result,
      label,
      ratio,
      tLine,
      cLine,
      peaks: [tLine, cLine],
      profile: smooth,
      roi: { y1, y2 }
    };
  }

  window.AsapDetector = { analyzeCanvas };
})();