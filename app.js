(function () {
  const ACCESS_CODE = 'ASAP2026'; // 可改成你自己的授權碼

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
    const scale = Math.min(1, maxW / img.naturalWidth);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  function drawOverlay(analysis) {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.lineWidth = Math.max(2, canvas.width / 350);

    ctx.strokeStyle = 'rgba(255, 170, 0, 0.9)';
    ctx.strokeRect(analysis.roi.x1, analysis.roi.y1, analysis.roi.x2 - analysis.roi.x1, analysis.roi.y2 - analysis.roi.y1);

    ctx.strokeStyle = 'rgba(220, 38, 38, 0.95)';
    for (const p of analysis.peaks) {
      ctx.beginPath();
      ctx.moveTo(analysis.roi.x1, p.canvasY);
      ctx.lineTo(analysis.roi.x2, p.canvasY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawChart(profile, peaks) {
    const ctx = chart.getContext('2d');
    const w = chart.clientWidth || 600;
    const h = 120;
    chart.width = w;
    chart.height = h;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = 15 + i * 24;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const maxVal = Math.max(80, ...profile);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.beginPath();
    profile.forEach((v, i) => {
      const x = i / (profile.length - 1) * w;
      const y = h - 12 - (v / maxVal) * (h - 28);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    for (const p of peaks) {
      const x = p.y / (profile.length - 1) * w;
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x, h - 8);
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

    const peakText = [
      `C線: y=${analysis.cLine.canvasY}, area=${analysis.cLine.area.toFixed(1)}, height=${analysis.cLine.height.toFixed(1)}, width=${analysis.cLine.width}px`,
      `T線: y=${analysis.tLine.canvasY}, area=${analysis.tLine.area.toFixed(1)}, height=${analysis.tLine.height.toFixed(1)}, width=${analysis.tLine.width}px`,
      `T/C Ratio=${analysis.ratio.toFixed(3)}`
    ].join('<br>');

    detailEl.innerHTML = `${analysis.label}<br>${peakText}`;
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
