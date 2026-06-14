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
      background: bg
    };
  }

  function redScoreRGB(r, g, b) {
    // 快篩線通常是紅/粉紅/紫紅；用「紅色相對於 G/B 的差值」比單純 R 更穩
    return clamp(r - Math.max(g, b) * 0.72, 0, 255);
  }

  function analyzeCanvas(canvas, options) {
    options = Object.assign({
      // 這張快篩是直放，T/C 線是「水平線」，所以要在 X 範圍內沿 Y 方向分析
      roiX1: 0.40,
      roiX2: 0.56,
      roiY1: 0.22,
      roiY2: 0.78,

      // 在 ROI 高度內，C 在上、T 在下。這兩個值依品牌微調
      cPosition: 0.38,
      tPosition: 0.50,
      positionTolerance: 0.08,

      smoothRadius: 2,
      peakHalfWidth: 4,
      bgHalfWindow: 28,
      pixelMinSignal: 1.2,

      cMinArea: 25,
      cMinHeight: 2.2,
      tMinArea: 10,
      tMinHeight: 1.2,

      negativeRatio: 0.08,
      weakPositiveRatio: 0.18
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

    // profile[y]：每一列的紅線強度。真正的 C/T 水平線會形成峰值
    const profile = new Array(roiH).fill(0);
    for (let y = y1; y <= y2; y++) {
      let sum = 0;
      let count = 0;
      for (let x = x1; x <= x2; x++) {
        const idx = (y * w + x) * 4;
        sum += redScoreRGB(data[idx], data[idx + 1], data[idx + 2]);
        count++;
      }
      profile[y - y1] = count ? sum / count : 0;
    }

    const smooth = smoothArray(profile, options.smoothRadius);
    const cLine = measureLine(smooth, options.cPosition, options);
    const tLine = measureLine(smooth, options.tPosition, options);

    // 補上 canvas 絕對座標，給畫面 overlay 用
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
      roi: { x1, x2, y1, y2 }
    };
  }

  window.AsapDetector = { analyzeCanvas };
})();
