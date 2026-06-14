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

  function findPeaks(profile, options) {
    const threshold = options.redThreshold;
    const minWidth = options.minPeakWidth;
    const minDistance = options.minPeakDistance;
    const segments = [];
    let start = -1;

    for (let i = 0; i < profile.length; i++) {
      if (profile[i] >= threshold && start < 0) start = i;
      if ((profile[i] < threshold || i === profile.length - 1) && start >= 0) {
        const end = i === profile.length - 1 ? i : i - 1;
        if (end - start + 1 >= minWidth) segments.push({ start, end });
        start = -1;
      }
    }

    const peaks = segments.map(seg => {
      let maxVal = -Infinity;
      let maxIdx = seg.start;
      let area = 0;
      for (let i = seg.start; i <= seg.end; i++) {
        area += profile[i];
        if (profile[i] > maxVal) {
          maxVal = profile[i];
          maxIdx = i;
        }
      }
      return {
        x: maxIdx,
        start: seg.start,
        end: seg.end,
        width: seg.end - seg.start + 1,
        height: maxVal,
        area
      };
    }).sort((a, b) => b.height - a.height);

    const selected = [];
    for (const p of peaks) {
      const tooClose = selected.some(q => Math.abs(q.x - p.x) < minDistance);
      if (!tooClose) selected.push(p);
      if (selected.length >= 3) break;
    }

    return selected.sort((a, b) => a.x - b.x);
  }

  function analyzeCanvas(canvas, options) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;

    const y1 = Math.floor(h * 0.22);
    const y2 = Math.floor(h * 0.78);
    const profile = new Array(w).fill(0);

    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let y = y1; y <= y2; y++) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const redScore = r - Math.max(g, b) * 0.72;
        sum += clamp(redScore, 0, 255);
        count++;
      }
      profile[x] = sum / count;
    }

    const smooth = smoothArray(profile, 3);
    const peaks = findPeaks(smooth, options);

    let result = 'INVALID';
    let label = '無效 / 未找到控制線';

    if (peaks.length >= 2) {
      result = 'POSITIVE';
      label = '陽性 / 偵測到兩條線';
    } else if (peaks.length === 1) {
      result = 'NEGATIVE';
      label = '陰性 / 偵測到一條線';
    }

    return {
      result,
      label,
      peaks,
      profile: smooth,
      roi: { y1, y2 }
    };
  }

  window.AsapDetector = { analyzeCanvas };
})();
