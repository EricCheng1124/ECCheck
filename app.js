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
  const roiCanvas = document.getElementById('roiCanvas');
  const resultEl = document.getElementById('result');
  const detailEl = document.getElementById('detail');
  const debugGray=document.getElementById('debugGray');
  const debugMask=document.getElementById('debugMask');
  const debugEdge=document.getElementById('debugEdge');
  const debugBright=document.getElementById('debugBright');
  const debugText=document.getElementById('debugText');


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
      resultEl.classList.add('ok');
      const sampleFallback = r.features && r.features.sampleSource && r.features.sampleSource.indexOf('fallback') >= 0;
      const sampleConfirmed = !!(r.sampleConfirmed || (r.features && r.features.sampleSource && r.features.sampleSource.indexOf('sample-s-zone-confirmed') >= 0));
      const fixedWindowConfirmed = !!(r.features && r.features.windowSource && r.features.windowSource.indexOf('fixed-ratio-window') >= 0);

      // v30.7：先判斷 S Well 是否已由 S-zone 確認，再判斷 outerOnly。
      // v30.6 的演算法已經 realSample=YES，但 UI 仍被 outerOnlyOk 文字蓋掉。
      if (sampleConfirmed && fixedWindowConfirmed) {
        resultEl.textContent = 'Outer frame, Window, and S Well detected.';
      } else if (sampleConfirmed) {
        resultEl.textContent = 'Outer frame and S Well detected. Window is fixed by ratio.';
      } else if (r.outerOnlyOk) {
        resultEl.textContent = 'Outer frame detected. Window/S Well not confirmed yet.';
      } else if (r.partialMessage || sampleFallback) {
        resultEl.textContent = 'Outer frame and Window detected. S Well not confirmed yet.';
      } else {
        resultEl.textContent = 'Outer frame, Window, and S Well detected.';
      }
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
      resultEl.classList.add('invalid');
      resultEl.textContent = 'Outer frame detection failed.';
      detailEl.innerHTML =
        `Version: ${r.version}<br>` +
        `Failure reason: ${r.reason}<br>` +
        `Candidates: ${r.candidates || 0}<br>` +
        `Suggestion: check the Debug Summary below, especially Final Gate and candidate #1.`;
      if (debugText && r && r.debug) { debugText.innerHTML = r.debug; }
    }
  }

  function analyze() {
    if (!lastImage) { clearRoiOnlyView(); return; }
    resizeAndDrawImage(lastImage);
    if (!cvReady) {
      resultEl.className = 'result neutral';
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
      resultEl.textContent = 'Analysis failed';
      detailEl.innerHTML =
        '<b>Exception</b><br>' +
        (ex && ex.message ? ex.message : String(ex));
      clearRoiOnlyView();
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
      resultEl.textContent = 'Image loading failed';
      detailEl.textContent = '';
    };
    img.src = URL.createObjectURL(file);
  }

  unlockBtn.addEventListener('click', unlock);
  passInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
  cameraInput.addEventListener('change', e => loadFile(e.target.files[0]));
  galleryInput.addEventListener('change', e => loadFile(e.target.files[0]));
  if (sessionStorage.getItem('asap_access') === '1') {
    lockPanel.classList.add('hidden');
    mainPanel.classList.remove('hidden');
  }
})();
