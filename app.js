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
    // 保留拉桿相容舊版；v5主判斷用 detector.js 內建參數
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
    const maxW = 520;
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
    const roiW = roi.x2 - roi.x1;
    const roiH = roi.y2 - roi.y1;

    ctx.save();
    ctx.lineWidth = Math.max(2, canvas.width / 420);

    ctx.strokeStyle = 'rgba(255, 170, 0, 0.95)';
    ctx.strokeRect(roi.x1, roi.y1, roiW, roiH);

    // C/T 偵測線
    ctx.strokeStyle = 'rgba(220, 38, 38, 0.95)';
    ctx.lineWidth = Math.max(2, canvas.width / 380);
    for (const p of analysis.peaks) {
      ctx.beginPath();
      ctx.moveTo(roi.x1, p.canvasY);
      ctx.lineTo(roi.x2, p.canvasY);
      ctx.stroke();
    }

    ctx.font = `${Math.max(12, canvas.width / 52)}px sans-serif`;
    ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
    ctx.fillText('C', roi.x2 + 5, analysis.cLine.canvasY + 4);
    ctx.fillText('T', roi.x2 + 5, analysis.tLine.canvasY + 4);

    ctx.restore();
  }

  function drawChart(profile, peaks) {
    const ctx = chart.getContext('2d');
    const w = 130;
    const h = canvas.height || 420;
    chart.width = w;
    chart.height = h;
    ctx.clearRect(0, 0, w, h);

    // 背景格線
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = 8 + i * ((w - 18) / 4);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const maxVal = Math.max(1, ...profile);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.beginPath();
    profile.forEach((v, i) => {
      const y = i / Math.max(1, profile.length - 1) * h;
      const x = 8 + (v / maxVal) * (w - 18);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    for (const p of peaks) {
      const y = p.y / Math.max(1, profile.length - 1) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
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
