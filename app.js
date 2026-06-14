(function () {
  const ACCESS_CODE = 'ASAP2026';

  const lockPanel = document.getElementById('lockPanel');
  const mainPanel = document.getElementById('mainPanel');
  const passInput = document.getElementById('passInput');
  const unlockBtn = document.getElementById('unlockBtn');
  const lockMsg = document.getElementById('lockMsg');

  const cameraInput = document.getElementById('cameraInput');
  const galleryInput = document.getElementById('galleryInput');
  const canvas = document.getElementById('canvas');
  const chart = document.getElementById('chart');
  const resultEl = document.getElementById('result');
  const detailEl = document.getElementById('detail');

  const redThreshold = document.getElementById('redThreshold');
  const minPeakWidth = document.getElementById('minPeakWidth');
  const minPeakDistance = document.getElementById('minPeakDistance');
  const redText = document.getElementById('redText');
  const widthText = document.getElementById('widthText');
  const distText = document.getElementById('distText');

  let lastImage = null;

  function unlock() {
    if (passInput.value === ACCESS_CODE) {
      sessionStorage.setItem('asap_access', '1');
      lockPanel.classList.add('hidden');
      mainPanel.classList.remove('hidden');
      lockMsg.textContent = '';
    } else {
      lockMsg.textContent = '授權碼錯誤';
    }
  }

  function getOptions() {
    // 這三個拉桿先保留，但新版主判斷使用 detector.js 內的 T/C Ratio 參數
    return {
      redThreshold: Number(redThreshold.value),
      minPeakWidth: Number(minPeakWidth.value),
      minPeakDistance: Number(minPeakDistance.value)
    };
  }

  function updateTexts() {
    redText.textContent = redThreshold.value;
    widthText.textContent = minPeakWidth.value;
    distText.textContent = minPeakDistance.value;
  }

  function resizeAndDrawImage(img) {
    // 縮小顯示，避免一直捲動；分析仍保留足夠解析度
    const maxW = 760;
    const maxH = 520;
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  function drawOverlay(analysis) {
    const ctx = canvas.getContext('2d');
    const roi = analysis.roi;
    const profile = analysis.profile;
    const roiW = roi.x2 - roi.x1;
    const roiH = roi.y2 - roi.y1;
    const maxVal = Math.max(1, ...profile);

    ctx.save();
    ctx.lineWidth = Math.max(2, canvas.width / 420);

    // ROI 框
    ctx.strokeStyle = 'rgba(255, 170, 0, 0.95)';
    ctx.strokeRect(roi.x1, roi.y1, roiW, roiH);

    // 直接把波形疊在照片 ROI 裡：左邊是低訊號，右邊是高訊號
    ctx.beginPath();
    profile.forEach((v, i) => {
      const y = roi.y1 + (i / Math.max(1, profile.length - 1)) * roiH;
      const x = roi.x1 + (v / maxVal) * roiW;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // C / T 偵測線
    ctx.strokeStyle = 'rgba(220, 38, 38, 0.95)';
    ctx.lineWidth = Math.max(2, canvas.width / 380);
    for (const p of analysis.peaks) {
      ctx.beginPath();
      ctx.moveTo(roi.x1, p.canvasY);
      ctx.lineTo(roi.x2, p.canvasY);
      ctx.stroke();
    }

    // 標籤
    ctx.font = `${Math.max(13, canvas.width / 48)}px sans-serif`;
    ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
    ctx.fillText('C', roi.x2 + 6, analysis.cLine.canvasY + 5);
    ctx.fillText('T', roi.x2 + 6, analysis.tLine.canvasY + 5);

    ctx.restore();
  }

  function drawChart(profile, peaks) {
    // 保留小圖，但縮到很矮；主要分析看照片上的疊圖
    const ctx = chart.getContext('2d');
    const w = chart.clientWidth || 600;
    const h = 90;
    chart.width = w;
    chart.height = h;
    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(1, ...profile);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.beginPath();
    profile.forEach((v, i) => {
      const x = i / Math.max(1, profile.length - 1) * w;
      const y = h - 8 - (v / maxVal) * (h - 16);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    for (const p of peaks) {
      const x = p.y / Math.max(1, profile.length - 1) * w;
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, h - 4);
      ctx.stroke();
    }
  }

  function setResult(analysis) {
    resultEl.className = 'result';
    if (analysis.result === 'POSITIVE') {
      resultEl.classList.add('positive');
      resultEl.textContent = '陽性';
    } else if (analysis.result === 'WEAK_POSITIVE') {
      resultEl.classList.add('positive');
      resultEl.textContent = '弱陽性';
    } else if (analysis.result === 'NEGATIVE') {
      resultEl.classList.add('negative');
      resultEl.textContent = '陰性';
    } else {
      resultEl.classList.add('invalid');
      resultEl.textContent = '無效';
    }

    detailEl.innerHTML = [
      analysis.label,
      `C線: y=${Math.round(analysis.cLine.canvasY)}, area=${analysis.cLine.area.toFixed(1)}, height=${analysis.cLine.height.toFixed(1)}, width=${analysis.cLine.width}px`,
      `T線: y=${Math.round(analysis.tLine.canvasY)}, area=${analysis.tLine.area.toFixed(1)}, height=${analysis.tLine.height.toFixed(1)}, width=${analysis.tLine.width}px`,
      `T/C Ratio=${analysis.ratio.toFixed(3)}`
    ].join('<br>');
  }

  function analyze() {
    if (!lastImage) return;
    resizeAndDrawImage(lastImage);
    const analysis = window.AsapDetector.analyzeCanvas(canvas, getOptions());
    drawOverlay(analysis);
    drawChart(analysis.profile, analysis.peaks);
    setResult(analysis);
  }

  function loadFile(file) {
    if (!file) return;
    const img = new Image();
    img.onload = function () {
      lastImage = img;
      analyze();
      URL.revokeObjectURL(img.src);
    };
    img.onerror = function () {
      resultEl.className = 'result invalid';
      resultEl.textContent = '讀圖失敗';
      detailEl.textContent = '請重新選擇照片。';
    };
    img.src = URL.createObjectURL(file);
  }

  unlockBtn.addEventListener('click', unlock);
  passInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
  cameraInput.addEventListener('change', e => loadFile(e.target.files[0]));
  galleryInput.addEventListener('change', e => loadFile(e.target.files[0]));

  [redThreshold, minPeakWidth, minPeakDistance].forEach(el => {
    el.addEventListener('input', () => {
      updateTexts();
      analyze();
    });
  });

  updateTexts();
  if (sessionStorage.getItem('asap_access') === '1') {
    lockPanel.classList.add('hidden');
    mainPanel.classList.remove('hidden');
  }
})();
