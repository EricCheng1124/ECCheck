(function () {
  const ACCESS_CODE = 'ASAP';
  let cvReady = false;
  let lastImage = null;

  const lockPanel = document.getElementById('lockPanel');
  const mainPanel = document.getElementById('mainPanel');
  const passInput = document.getElementById('passInput');
  const unlockBtn = document.getElementById('unlockBtn');
  const lockMsg = document.getElementById('lockMsg');
  const cvStatus = document.getElementById('cvStatus');

  const cameraInput = document.getElementById('cameraInput');
  const galleryInput = document.getElementById('galleryInput');
  const canvas = document.getElementById('canvas');
  const cropCanvas = document.getElementById('cropCanvas');
  const combinedCanvas = document.getElementById('combinedCanvas');
  const roiCanvas = document.getElementById('roiCanvas');
  const resultEl = document.getElementById('result');
  const detailEl = document.getElementById('detail');
  const debugGray=document.getElementById('debugGray');
  const debugMask=document.getElementById('debugMask');
  const debugEdge=document.getElementById('debugEdge');
  const debugBright=document.getElementById('debugBright');
  const debugText=document.getElementById('debugText');
  const regionInput = document.getElementById('regionInput');
  const gpsStatus = document.getElementById('gpsStatus');
  let lastResultText = 'Invalid';
  const advancedLock = document.getElementById('advancedLock');
  const advancedContent = document.getElementById('advancedContent');
  const advancedPassInput = document.getElementById('advancedPassInput');
  const advancedUnlockBtn = document.getElementById('advancedUnlockBtn');
  const advancedMsg = document.getElementById('advancedMsg');


  // Settings UI removed; keep fixed detection defaults here.
  const DEFAULT_OPTIONS = {
    minAreaRatio: 0.01,
    ratioMin: 2.2,
    ratioMax: 6.5
  };

  function unlock() {
    if ((passInput.value || '').trim() === ACCESS_CODE) {
      sessionStorage.setItem('asap_access', '1');
      lockPanel.classList.add('hidden');
      mainPanel.classList.remove('hidden');
      lockMsg.textContent = '';
      autoFetchGps();
    } else {
      lockMsg.textContent = 'Invalid access code';
    }
  }

  window.__opencvLoaded = function () {
    if (window.cv && cv.onRuntimeInitialized !== undefined) {
      cv.onRuntimeInitialized = onCvReady;
    } else {
      onCvReady();
    }
  };

  function onCvReady() {
    cvReady = true;
    cvStatus.textContent = '';
    if (lastImage) analyze();
  }

  function unlockAdvanced() {
    if (!advancedPassInput || !advancedContent || !advancedLock) return;
    if ((advancedPassInput.value || '').trim() === ACCESS_CODE) {
      sessionStorage.setItem('asap_advanced', '1');
      advancedLock.classList.add('hidden');
      advancedContent.classList.remove('hidden');
      if (advancedMsg) advancedMsg.textContent = '';
    } else if (advancedMsg) {
      advancedMsg.textContent = 'Invalid access code';
    }
  }

  function applyAdvancedState() {
    if (!advancedContent || !advancedLock) return;
    if (sessionStorage.getItem('asap_advanced') === '1') {
      advancedLock.classList.add('hidden');
      advancedContent.classList.remove('hidden');
    } else {
      advancedLock.classList.remove('hidden');
      advancedContent.classList.add('hidden');
    }
  }

  function getCtResultText(r) {
    const ct = r && r.features && r.features.ctAnalysis ? r.features.ctAnalysis : null;
    if (!ct || !ct.result) return 'Invalid';
    return ct.result;
  }

  function getRegionText() {
    const value = regionInput ? (regionInput.value || '').trim() : '';
    return value || 'GPS locating...';
  }

  function getTimestampParts() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    return { date, time };
  }

  function drawMetadataOverlay(ctx, W, H, opt) {
    const ts = getTimestampParts();
    const lines = [
      `Result : ${lastResultText || 'Invalid'}`,
      `Date   : ${ts.date}`,
      `Time   : ${ts.time}`,
      `Region : ${getRegionText()}`
    ];

    const area = opt || {};
    const x0 = area.x || 0;
    const y0 = area.y || 0;
    const areaW = area.w || W;
    const areaH = area.h || H;

    const fontSize = Math.max(14, Math.round(Math.min(W, H) / 23));
    const pad = Math.max(12, Math.round(fontSize * 0.75));
    const lineH = Math.round(fontSize * 1.45);

    ctx.save();
    ctx.font = `900 ${fontSize}px sans-serif`;

    const textW = Math.max(...lines.map(t => ctx.measureText(t).width));
    const boxW = Math.min(areaW - pad * 2, textW + pad * 2.4);
    const boxH = lineH * lines.length + pad * 1.6;

    const x = Math.round(x0 + Math.max(pad, (areaW - boxW) / 2));
    const y = Math.round(y0 + Math.max(pad, areaH - boxH - pad));
    const r = Math.max(10, Math.round(fontSize * 0.65));

    ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
    ctx.shadowBlur = Math.round(fontSize * 0.7);
    ctx.shadowOffsetY = Math.round(fontSize * 0.25);

    ctx.fillStyle = 'rgba(15, 88, 180, 0.92)';
    roundRect(ctx, x, y, boxW, boxH, r);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.lineWidth = Math.max(2, Math.round(fontSize / 7));
    ctx.strokeStyle = 'rgba(91, 201, 255, 0.95)';
    roundRect(ctx, x, y, boxW, boxH, r);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + pad, y + pad + fontSize + i * lineH);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function renderCombinedDetectionView() {
    if (!combinedCanvas || !cropCanvas || !canvas || !cropCanvas.width || !cropCanvas.height) return;

    const cropW = cropCanvas.width;
    const cropH = cropCanvas.height;
    const sideW = Math.max(190, Math.round(cropW * 0.72));
    const gap = Math.max(16, Math.round(cropW * 0.055));
    const W = cropW + gap + sideW;
    const H = cropH;

    combinedCanvas.width = W;
    combinedCanvas.height = H;

    const ctx = combinedCanvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#f8fbff');
    grad.addColorStop(1, '#eaf3ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.drawImage(cropCanvas, 0, 0, cropW, cropH);

    ctx.save();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.18)';
    ctx.lineWidth = Math.max(1, Math.round(cropW / 260));
    ctx.beginPath();
    ctx.moveTo(cropW + gap / 2, Math.round(cropH * 0.08));
    ctx.lineTo(cropW + gap / 2, Math.round(cropH * 0.92));
    ctx.stroke();
    ctx.restore();

    if (canvas.width && canvas.height) {
      const thumbW = Math.max(110, Math.round(sideW * 0.72));
      const thumbH = Math.round(canvas.height * thumbW / Math.max(1, canvas.width));
      const pad = Math.max(10, Math.round(sideW * 0.045));
      const x = cropW + gap + Math.round((sideW - thumbW) / 2);
      const y = pad;
      const r = Math.max(10, Math.round(thumbW * 0.045));

      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      roundRect(ctx, x - 5, y - 5, thumbW + 10, thumbH + 10, r);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.95)';
      ctx.lineWidth = Math.max(2, Math.round(cropW / 150));
      roundRect(ctx, x - 5, y - 5, thumbW + 10, thumbH + 10, r);
      ctx.stroke();
      ctx.drawImage(canvas, x, y, thumbW, thumbH);
      ctx.fillStyle = '#0f172a';
      ctx.font = `900 ${Math.max(11, Math.round(sideW / 18))}px sans-serif`;
      ctx.fillText('Original Image', x, y + thumbH + Math.max(16, Math.round(sideW / 12)));
      ctx.restore();
    }

    drawMetadataOverlay(ctx, W, H, {
      x: cropW + gap,
      y: Math.round(cropH * 0.30),
      w: sideW,
      h: Math.round(cropH * 0.68)
    });
  }

  function updateTexts() {
    // Settings UI removed.
  }

  function getOptions() {
    return DEFAULT_OPTIONS;
  }

  function resizeAndDrawImage(img) {
    const maxW = 900;
    const scale = Math.min(1, maxW / img.naturalWidth);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }



  function showMat(canvasEl, mat) {
    if (!canvasEl || !mat || mat.empty()) return;
    cv.imshow(canvasEl, mat);
  }

  function renderDebugViews() {
    if (!cvReady || !canvas || !canvas.width || !canvas.height) return;

    let src = null;
    let gray = null;
    let bg = null;
    let norm = null;
    let rgb = null;
    let hsv = null;
    let lower = null;
    let upper = null;
    let white = null;
    let blur = null;
    let edge = null;
    let k = null;
    let bright = null;
    let kOpen = null;
    let kClose = null;

    try {
      src = cv.imread(canvas);

      gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      bg = new cv.Mat();
      cv.GaussianBlur(gray, bg, new cv.Size(0,0), 31, 31, cv.BORDER_DEFAULT);
      norm = new cv.Mat();
      cv.divide(gray, bg, norm, 128);
      cv.normalize(norm, norm, 0, 255, cv.NORM_MINMAX);
      norm.convertTo(norm, cv.CV_8U);
      showMat(debugGray, norm);

      rgb = new cv.Mat();
      hsv = new cv.Mat();
      cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
      white = new cv.Mat();
      lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0,0,118,0]);
      upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180,92,255,255]);
      cv.inRange(hsv, lower, upper, white);
      kOpen = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5,5));
      kClose = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(13,13));
      cv.morphologyEx(white, white, cv.MORPH_OPEN, kOpen);
      cv.morphologyEx(white, white, cv.MORPH_CLOSE, kClose);
      showMat(debugMask, white);

      blur = new cv.Mat();
      edge = new cv.Mat();
      cv.GaussianBlur(norm, blur, new cv.Size(5,5), 0);
      cv.Canny(blur, edge, 28, 90);
      k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9,9));
      cv.morphologyEx(edge, edge, cv.MORPH_CLOSE, k);
      cv.dilate(edge, edge, k, new cv.Point(-1,-1), 1);
      showMat(debugEdge, edge);

      bright = new cv.Mat();
      cv.threshold(norm, bright, 145, 255, cv.THRESH_BINARY);
      cv.morphologyEx(bright, bright, cv.MORPH_OPEN, kOpen);
      cv.morphologyEx(bright, bright, cv.MORPH_CLOSE, kClose);
      showMat(debugBright, bright);
    }
    catch (ex) {
      console.error('Debug view failed:', ex);
    }
    finally {
      [src, gray, bg, norm, rgb, hsv, lower, upper, white, blur, edge, k, bright, kOpen, kClose]
        .forEach(m => { if (m) m.delete(); });
    }
  }


  function clearRoiOnlyView() {
    if (!roiCanvas) return;
    const ctx = roiCanvas.getContext('2d');
    roiCanvas.width = Math.max(1, cropCanvas ? cropCanvas.width : 1);
    roiCanvas.height = Math.max(1, cropCanvas ? cropCanvas.height : 1);
    ctx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);
  }

  function renderRoiOnlyView(r) {
    if (!roiCanvas || !cropCanvas || !cropCanvas.width || !cropCanvas.height) return;

    const W = cropCanvas.width;
    const H = cropCanvas.height;
    roiCanvas.width = W;
    roiCanvas.height = H;

    const ctx = roiCanvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const f = r && r.features ? r.features : null;

    // Outer frame
    ctx.save();
    ctx.strokeStyle = 'rgba(34,197,94,0.98)';
    ctx.lineWidth = Math.max(3, W / 160);
    ctx.strokeRect(2, 2, W - 4, H - 4);

    // Third guide lines for S direction scoring
    ctx.setLineDash([6,4]);
    ctx.strokeStyle = 'rgba(245,158,11,0.95)';
    ctx.lineWidth = Math.max(1, W / 220);
    ctx.beginPath();
    ctx.moveTo(2, H / 3); ctx.lineTo(W - 2, H / 3);
    ctx.moveTo(2, H * 2 / 3); ctx.lineTo(W - 2, H * 2 / 3);
    ctx.stroke();
    ctx.setLineDash([]);

    if (f && f.directionAnalysis) {
      ctx.fillStyle = 'rgba(245,158,11,0.95)';
      ctx.font = `${Math.max(10, Math.round(W / 24))}px sans-serif`;
      ctx.fillText(`Top S ${Math.round(f.directionAnalysis.topScore)}`, 6, Math.max(14, H / 3 - 6));
      ctx.fillText(`Bottom S ${Math.round(f.directionAnalysis.bottomScore)}`, 6, Math.min(H - 8, H * 2 / 3 + 18));
    }
    ctx.restore();

    // Window box
    if (f && f.window) {
      const win = f.window;
      ctx.save();
      ctx.strokeStyle = 'rgba(37,99,235,0.98)';
      ctx.fillStyle = 'rgba(37,99,235,0.98)';
      ctx.lineWidth = Math.max(2, W / 180);
      ctx.strokeRect(win.x, win.y, win.w, win.h);
      ctx.font = `${Math.max(10, Math.round(W / 28))}px sans-serif`;
      ctx.fillText('Window', win.x + 2, Math.max(13, win.y - 4));
      ctx.restore();
    }

    // S zone ellipse
    if (f && f.sample) {
      const s = f.sample;
      const rx = s.rx || s.r || W * 0.17;
      const ry = s.ry || s.r || W * 0.20;
      ctx.save();
      ctx.strokeStyle = 'rgba(168,85,247,0.98)';
      ctx.fillStyle = 'rgba(168,85,247,0.98)';
      ctx.lineWidth = Math.max(2, W / 180);
      ctx.beginPath();
      ctx.ellipse(s.cx, s.cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      const cross = Math.max(7, W / 24);
      ctx.beginPath();
      ctx.moveTo(s.cx - cross, s.cy); ctx.lineTo(s.cx + cross, s.cy);
      ctx.moveTo(s.cx, s.cy - cross); ctx.lineTo(s.cx, s.cy + cross);
      ctx.stroke();
      ctx.font = `${Math.max(10, Math.round(W / 28))}px sans-serif`;
      ctx.fillText('S zone', s.cx + cross + 3, s.cy + 4);
      ctx.restore();
    }
  }

  function formatFeatures(f) {
    if (!f) return '<br>Internal features: not executed';
    let html = '<hr>';
    html += `Window candidates: ${f.windowCandidates}, source: ${f.windowSource || '-'}<br>`;
    html += `S Well candidates: ${f.sampleCandidates}, source: ${f.sampleSource || '-'}<br>`;
    if (f.sampleSource && f.sampleSource.indexOf('fallback') >= 0) {
      html += '<b style="color:#dc2626">Note: S Well is fallback, meaning the sample well was not truly detected.</b><br>';
    }
    html += `Orientation: ${f.orientation}<br>`;
    html += `180-degree correction: ${f.orientationCorrected ? 'Yes' : 'No'}<br>`;
    if (f.roiMetrics) {
      html += `ROI alignment: align=${f.roiMetrics.alignScore.toFixed(2)}, dx=${f.roiMetrics.alignDx.toFixed(0)}, yGap=${f.roiMetrics.yGap.toFixed(0)}, Window above S=${f.roiMetrics.windowAboveSample ? 'YES' : 'NO'}<br>`;
    }
    if (f.window) {
      html += `Window: x=${f.window.x.toFixed(0)}, y=${f.window.y.toFixed(0)}, w=${f.window.w.toFixed(0)}, h=${f.window.h.toFixed(0)}<br>`;
    } else {
      html += 'Window: not found<br>';
    }
    if (f.sample) {
      html += `S Well: x=${f.sample.cx.toFixed(0)}, y=${f.sample.cy.toFixed(0)}, rx=${f.sample.rx.toFixed(0)}, ry=${f.sample.ry.toFixed(0)}<br>`;
    } else {
      html += 'S Well: not found<br>';
    }
    if (f.ctAnalysis) {
      const ct = f.ctAnalysis;
      html += '<hr>';
      html += `<b>CT Result: ${ct.result}</b><br>`;
      html += `C Score: ${ct.cPeak.score.toFixed(1)} / detected=${ct.cPeak.detected ? 'YES' : 'NO'}<br>`;
      html += `T Score: ${ct.tPeak.score.toFixed(1)} / detected=${ct.tPeak.detected ? 'YES' : 'NO'}<br>`;
      if (ct.tThreshold !== undefined) html += `T Relative Threshold: ${ct.tThreshold.toFixed(1)} / T/C Ratio: ${ct.tcRatio.toFixed(2)}<br>`;
      if (ct.cPeak.redContinuity) html += `C Red Continuity: ${ct.cPeak.redContinuity.ok ? 'YES' : 'NO'} / ratio=${ct.cPeak.redContinuity.ratio.toFixed(2)}<br>`;
      if (ct.tPeak.redContinuity) html += `T Red Continuity: ${ct.tPeak.redContinuity.ok ? 'YES' : 'NO'} / ratio=${ct.tPeak.redContinuity.ratio.toFixed(2)}<br>`;
      html += `Threshold: ${ct.threshold.toFixed(1)} / Peak Count: ${ct.peakCount}<br>`;
    }
    return html;
  }

  function setResult(r) {
    resultEl.className = 'result';
    // v29.3：不管成功或失敗，都先把 detector debug 印出來，避免失敗時 log 消失。
    if (debugText && r && r.debug) { debugText.innerHTML = r.debug; }
    renderRoiOnlyView(r);

    // v29.2 防呆：如果 detector debug 已經顯示 Final Gate PASS，
    // 但 r.ok 因快取或舊邏輯變成 false，UI 仍以 PASS 顯示。
    const debugSaysPass =
      r &&
      r.debug &&
      r.debug.indexOf('Final Gate: outer=PASS / trustedFeature=PASS') >= 0;

    const uiOk = !!(r.ok || debugSaysPass);

    if (uiOk) {
      const ctText = getCtResultText(r);
      lastResultText = ctText;
      resultEl.textContent = ctText;
      if (ctText === 'Positive') resultEl.classList.add('positive');
      else if (ctText === 'Negative') resultEl.classList.add('negative');
      else resultEl.classList.add('invalid');

      detailEl.innerHTML =
        `Version: ${r.version}<br>` +
        `Method: ${r.reason}<br>` +
        `Candidates: ${r.candidates}<br>` +
        `Area ratio: ${(r.areaRatio * 100).toFixed(2)}%<br>` +
        `Aspect ratio: ${r.ratio.toFixed(2)}<br>` +
        `Fill ratio: ${r.fill.toFixed(2)}<br>` +
        `Center: x=${r.rect.cx.toFixed(0)}, y=${r.rect.cy.toFixed(0)}<br>` +
        `Size: w=${r.rect.w.toFixed(0)}, h=${r.rect.h.toFixed(0)}, angle=${r.rect.angle.toFixed(1)}°<br>` +
        formatFeatures(r.features);
    } else {
      lastResultText = 'Invalid';
      resultEl.classList.add('invalid');
      resultEl.textContent = 'Invalid';
      detailEl.innerHTML =
        `Version: ${r.version}<br>` +
        `Failure reason: ${r.reason}<br>` +
        `Candidates: ${r.candidates || 0}<br>` +
        `Suggestion: check the Debug Summary below, especially Final Gate and candidate #1.`;
      if (debugText && r && r.debug) { debugText.innerHTML = r.debug; }
    }
    renderCombinedDetectionView();
  }

  function analyze() {
    if (!lastImage) { clearRoiOnlyView(); return; }
    resizeAndDrawImage(lastImage);
    if (!cvReady) {
      resultEl.className = 'result neutral';
      lastResultText = 'Invalid';
      resultEl.textContent = '';
      detailEl.textContent = '';
      return;
    }
    try {
      renderDebugViews();
      const r = window.AsapOuterDetector.detectOuterFrame(canvas, cropCanvas, getOptions());
      setResult(r);
    }
    catch (ex) {
      console.error(ex);
      resultEl.className = 'result invalid';
      lastResultText = 'Invalid';
      resultEl.textContent = 'Invalid';
      detailEl.innerHTML =
        '<b>Exception</b><br>' +
        (ex && ex.message ? ex.message : String(ex));
      clearRoiOnlyView();
      if (combinedCanvas) { const cctx = combinedCanvas.getContext('2d'); cctx.clearRect(0,0,combinedCanvas.width,combinedCanvas.height); }
      if (debugText) {
        debugText.innerHTML =
          '<b>Exception</b><br>' +
          (ex && ex.stack ? ex.stack : (ex && ex.message ? ex.message : String(ex)));
      }
    }
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
      lastResultText = 'Invalid';
      resultEl.textContent = 'Invalid';
      detailEl.textContent = '';
    };
    img.src = URL.createObjectURL(file);
  }

  function setRegionText(value, save) {
    if (regionInput) regionInput.value = value || '';
    if (save) localStorage.setItem('asap_region', value || '');
    if (gpsStatus) gpsStatus.textContent = value ? 'GPS ready' : 'GPS locating...';
    renderCombinedDetectionView();
  }

  function autoFetchGps() {
    if (!navigator.geolocation) {
      setRegionText(localStorage.getItem('asap_region') || 'GPS not supported', false);
      return;
    }
    if (gpsStatus) gpsStatus.textContent = 'GPS locating...';
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude.toFixed(5);
        const lng = pos.coords.longitude.toFixed(5);
        setRegionText(`${lat}, ${lng}`, true);
      },
      () => {
        const fallback = localStorage.getItem('asap_region') || 'GPS unavailable';
        setRegionText(fallback, false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  if (regionInput) {
    regionInput.value = localStorage.getItem('asap_region') || 'GPS locating...';
    regionInput.addEventListener('input', () => {
      localStorage.setItem('asap_region', regionInput.value || '');
      renderCombinedDetectionView();
    });
  }

  autoFetchGps();

  unlockBtn.addEventListener('click', unlock);
  passInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
  if (advancedUnlockBtn) advancedUnlockBtn.addEventListener('click', unlockAdvanced);
  if (advancedPassInput) advancedPassInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlockAdvanced(); });
  cameraInput.addEventListener('change', e => loadFile(e.target.files[0]));
  galleryInput.addEventListener('change', e => loadFile(e.target.files[0]));
  if (sessionStorage.getItem('asap_access') === '1') {
    lockPanel.classList.add('hidden');
    mainPanel.classList.remove('hidden');
  }
})();
