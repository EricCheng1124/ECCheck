(function () {
  const ACCESS_CODE = 'ASAP2026';
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


  function clearRoiOnlyView() { }

  function renderRoiOnlyView(r) { }

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
      if (r.outerOnlyOk) {
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
