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
    if ((passInput.value || '').trim() === ACCESS_CODE) {
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

  function makeSourceCanvas(img) {
    const maxW = 1100;
    const maxH = 1100;
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const src = document.createElement('canvas');
    src.width = Math.round(img.naturalWidth * scale);
    src.height = Math.round(img.naturalHeight * scale);
    const ctx = src.getContext('2d');
    ctx.drawImage(img, 0, 0, src.width, src.height);
    return src;
  }

  function showProcessedImage(analysis) {
    const src = analysis.processedCanvas;
    const maxH = 460;
    const maxW = 360;
    const scale = Math.min(1, maxW / src.width, maxH / src.height);
    canvas.width = Math.round(src.width * scale);
    canvas.height = Math.round(src.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,170,0,0.95)';
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    ctx.strokeStyle = 'rgba(220,38,38,0.95)';
    for (const p of analysis.peaks) {
      const y = p.y / Math.max(1, src.height - 1) * canvas.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const cy = analysis.cLine.y / Math.max(1, src.height - 1) * canvas.height;
    const ty = analysis.tLine.y / Math.max(1, src.height - 1) * canvas.height;
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(220,38,38,0.95)';
    ctx.fillText('C', canvas.width - 18, cy - 4);
    ctx.fillText('T', canvas.width - 18, ty - 4);
    ctx.restore();
  }

  function drawChart(profile, peaks) {
    const ctx = chart.getContext('2d');
    const w = 110;
    const h = canvas.height || 420;
    chart.width = w;
    chart.height = h;
    ctx.clearRect(0, 0, w, h);

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

    const allPeaks = (analysis.allPeaks || []).map((p, i) =>
      `峰${i + 1}: y=${Math.round(p.y)}, area=${p.area.toFixed(1)}, height=${p.height.toFixed(1)}, width=${p.width}px`
    ).join('<br>');

    detailEl.innerHTML = [
      `版本: ${analysis.version || 'unknown'}`,
      analysis.label,
      `裁切模式: ${analysis.preprocess.mode}, ${analysis.preprocess.ok ? '成功' : '失敗'}, reason=${analysis.preprocess.reason}`,
      `裁切區: x=${Math.round(analysis.preprocess.x)}, y=${Math.round(analysis.preprocess.y)}, w=${Math.round(analysis.preprocess.w)}, h=${Math.round(analysis.preprocess.h)}`,
      `C線: y=${Math.round(analysis.cLine.y)}, area=${analysis.cLine.area.toFixed(1)}, height=${analysis.cLine.height.toFixed(1)}, width=${analysis.cLine.width}px`,
      `T線: y=${Math.round(analysis.tLine.y)}, area=${analysis.tLine.area.toFixed(1)}, height=${analysis.tLine.height.toFixed(1)}, width=${analysis.tLine.width}px`,
      `T/C Ratio=${analysis.ratio.toFixed(3)}`,
      allPeaks ? `<hr>${allPeaks}` : ''
    ].filter(Boolean).join('<br>');
  }

  function analyze() {
    if (!lastImage) return;
    const sourceCanvas = makeSourceCanvas(lastImage);
    const analysis = window.AsapDetector.analyzeCanvas(sourceCanvas, getOptions());
    showProcessedImage(analysis);
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
