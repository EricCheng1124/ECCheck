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

  const startCameraBtn = document.getElementById('startCameraBtn');
  const cameraPanel = document.getElementById('cameraPanel');
  const cameraVideo = document.getElementById('cameraVideo');
  const captureBtn = document.getElementById('captureBtn');
  const closeCameraBtn = document.getElementById('closeCameraBtn');
  const cameraStatus = document.getElementById('cameraStatus');
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
  const qrStatus = document.getElementById('qrStatus');
  const qrFields = document.getElementById('qrFields');
  const qrRawWrap = document.getElementById('qrRawWrap');
  const qrRaw = document.getElementById('qrRaw');
  const qrItem = document.getElementById('qrItem');
  const qrLot = document.getElementById('qrLot');
  const qrExp = document.getElementById('qrExp');
  const qrPn = document.getElementById('qrPn');
  const rescanQrBtn = document.getElementById('rescanQrBtn');
  const compactItem = document.getElementById('compactItem');
  const compactValidity = document.getElementById('compactValidity');
  const compactLotExp = document.getElementById('compactLotExp');
  const resultSub = document.getElementById('resultSub');
  const detectionPanel = document.getElementById('detectionPanel');
  const stagePlaceholder = document.getElementById('stagePlaceholder');
  const galleryLabel = document.getElementById('galleryLabel');
  let lastQr = { raw: '', item: '', lot: '', exp: '', pn: '', expired: false };
  let qrLocked = false;
  let cameraStream = null;
  let qrScanTimer = null;
  let qrScanCanvas = null;
  let lastResultText = 'Ready';
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

  function normalizeQrObject(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const out = {};
    Object.keys(obj).forEach(key => {
      out[String(key).trim().toUpperCase()] = obj[key] == null ? '' : String(obj[key]).trim();
    });
    return out;
  }

  function parseQrData(raw) {
    const text = String(raw || '').trim();
    let map = {};

    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = normalizeQrObject(parsed);
      } catch (_) {
        text.split(/[;\n\r&|]+/).forEach(part => {
          const m = part.match(/^\s*([^:=]+)\s*[:=]\s*(.*?)\s*$/);
          if (m) map[m[1].trim().toUpperCase()] = m[2].trim();
        });
      }
    }

    const pick = (...keys) => {
      for (const k of keys) if (map[k]) return map[k];
      return '';
    };

    const exp = pick('EXP', 'EXPIRY', 'EXPIRYDATE', 'EXPIRY_DATE', 'EXPIRE', 'VALIDUNTIL', 'VALID_UNTIL');
    let expired = false;
    if (exp && /^\d{4}-\d{2}-\d{2}$/.test(exp)) {
      const end = new Date(exp + 'T23:59:59');
      expired = !Number.isNaN(end.getTime()) && end.getTime() < Date.now();
    }

    return {
      raw: text,
      item: pick('ITEM', 'TEST', 'TESTITEM', 'TEST_ITEM', 'ASSAY'),
      lot: pick('LOT', 'LOTNO', 'LOT_NO', 'BATCH', 'BATCHNO', 'BATCH_NO'),
      exp,
      pn: pick('PN', 'PRODUCT', 'PRODUCTNO', 'PRODUCT_NO', 'MODEL', 'SKU'),
      expired
    };
  }

  function updateQrDisplay(info, found) {
    lastQr = info || { raw: '', item: '', lot: '', exp: '', pn: '', expired: false };
    if (qrStatus) {
      qrStatus.className = 'qrStatus ' + (found ? (lastQr.expired ? 'expired' : 'ok') : 'neutral');
      qrStatus.textContent = found ? (lastQr.expired ? 'QR detected · EXPIRED' : 'QR detected ✓') : 'QR not detected';
    }

    const hasFields = !!(lastQr.item || lastQr.lot || lastQr.exp || lastQr.pn);
    if (compactItem) {
      compactItem.textContent = found
        ? (hasFields ? (lastQr.item || lastQr.pn || lastQr.raw) : (lastQr.raw || 'QR detected'))
        : 'Waiting for test QR...';
      compactItem.title = compactItem.textContent;
    }
    if (compactValidity) {
      compactValidity.className = 'validity ' + (found ? (lastQr.expired ? 'expired' : 'ok') : 'neutral');
      compactValidity.textContent = found
        ? (hasFields ? (lastQr.expired ? 'Expired' : 'Valid ✓') : 'QR ✓')
        : 'QR --';
    }
    if (compactLotExp) {
      if (found && !hasFields) {
        compactLotExp.textContent = 'QR Code detected';
      } else {
        const lotText = lastQr.lot || '--';
        const expText = lastQr.exp || '--';
        compactLotExp.textContent = `LOT ${lotText} · EXP ${expText}`;
      }
      compactLotExp.title = compactLotExp.textContent;
    }

    if (qrRaw) qrRaw.textContent = lastQr.raw || '';
    if (qrRawWrap) qrRawWrap.classList.toggle('hidden', !found);

    if (qrFields) qrFields.classList.toggle('hidden', !hasFields);
    if (qrItem) qrItem.textContent = lastQr.item || '-';
    if (qrLot) qrLot.textContent = lastQr.lot || '-';
    if (qrExp) {
      qrExp.textContent = lastQr.exp || '-';
      qrExp.classList.toggle('expiredText', !!lastQr.expired);
    }
    if (qrPn) qrPn.textContent = lastQr.pn || '-';

    updateResultSubtitle();
  }

  function updateResultSubtitle() {
    if (!resultSub) return;
    if (lastResultText && lastResultText !== 'Invalid' && lastResultText !== 'Ready') {
      const parts = [];
      if (lastQr.item) parts.push(lastQr.item);
      if (lastQr.lot) parts.push(`LOT ${lastQr.lot}`);
      resultSub.textContent = parts.length ? parts.join(' · ') : 'Detection completed';
    } else if (lastResultText === 'Invalid') {
      const parts = [];
      if (lastQr.item) parts.push(lastQr.item);
      if (lastQr.lot) parts.push(`LOT ${lastQr.lot}`);
      resultSub.textContent = parts.length ? parts.join(' · ') : 'Check cassette position and image quality';
    } else {
      resultSub.textContent = qrLocked ? 'QR identified · Ready to capture' : 'Scan QR and capture the cassette';
    }
  }

  function showCameraStage() {
    if (cameraPanel) cameraPanel.classList.remove('hidden');
    if (detectionPanel) detectionPanel.classList.add('hidden');
    if (startCameraBtn) startCameraBtn.classList.add('hidden');
    if (captureBtn) captureBtn.classList.remove('hidden');
    if (closeCameraBtn) closeCameraBtn.classList.remove('hidden');
    if (galleryLabel) galleryLabel.classList.add('hidden');
  }

  function showDetectionStage(hasImage) {
    if (cameraPanel) cameraPanel.classList.add('hidden');
    if (detectionPanel) detectionPanel.classList.remove('hidden');
    if (combinedCanvas) combinedCanvas.classList.toggle('hidden', !hasImage);
    if (stagePlaceholder) stagePlaceholder.classList.toggle('hidden', !!hasImage);
    if (startCameraBtn) startCameraBtn.classList.remove('hidden');
    if (captureBtn) captureBtn.classList.add('hidden');
    if (closeCameraBtn) closeCameraBtn.classList.add('hidden');
    if (galleryLabel) galleryLabel.classList.remove('hidden');
  }

  function decodeQrImageData(imageData) {
    if (typeof window.jsQR !== 'function' || !imageData) return null;
    try {
      return window.jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth'
      });
    } catch (ex) {
      console.error('QR decode failed:', ex);
      return null;
    }
  }

  function acceptQrCode(raw, lockIt) {
    if (!raw) return false;
    updateQrDisplay(parseQrData(raw), true);
    if (lockIt) qrLocked = true;
    if (cameraStatus) cameraStatus.textContent = qrLocked ? 'QR detected and locked. You can capture the test now.' : 'QR detected';
    return true;
  }

  function clearQrData() {
    qrLocked = false;
    updateQrDisplay({ raw: '', item: '', lot: '', exp: '', pn: '', expired: false }, false);
    if (cameraStatus && cameraStream) cameraStatus.textContent = 'Scanning QR code...';
  }

  function scanQrFromCanvas(forceClear) {
    if (!canvas || !canvas.width || !canvas.height) return false;
    if (qrLocked) return true;
    if (typeof window.jsQR !== 'function') {
      if (qrStatus) {
        qrStatus.className = 'qrStatus neutral';
        qrStatus.textContent = 'QR decoder unavailable';
      }
      return false;
    }

    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = decodeQrImageData(imageData);
      if (code && code.data) return acceptQrCode(code.data, false);
      if (forceClear) updateQrDisplay({ raw: '', item: '', lot: '', exp: '', pn: '', expired: false }, false);
      return false;
    } catch (ex) {
      console.error('QR scan failed:', ex);
      if (forceClear) updateQrDisplay({ raw: '', item: '', lot: '', exp: '', pn: '', expired: false }, false);
      return false;
    }
  }

  function stopQrLoop() {
    if (qrScanTimer) {
      clearTimeout(qrScanTimer);
      qrScanTimer = null;
    }
  }

  function scheduleLiveQrScan() {
    stopQrLoop();
    const loop = () => {
      if (!cameraStream || !cameraVideo || cameraVideo.readyState < 2) {
        if (cameraStream) qrScanTimer = setTimeout(loop, 250);
        return;
      }

      if (!qrLocked && typeof window.jsQR === 'function') {
        try {
          const vw = cameraVideo.videoWidth || 0;
          const vh = cameraVideo.videoHeight || 0;
          if (vw > 0 && vh > 0) {
            if (!qrScanCanvas) qrScanCanvas = document.createElement('canvas');
            const maxW = 720;
            const scale = Math.min(1, maxW / vw);
            qrScanCanvas.width = Math.max(1, Math.round(vw * scale));
            qrScanCanvas.height = Math.max(1, Math.round(vh * scale));
            const qctx = qrScanCanvas.getContext('2d', { willReadFrequently: true });
            qctx.drawImage(cameraVideo, 0, 0, qrScanCanvas.width, qrScanCanvas.height);
            const imageData = qctx.getImageData(0, 0, qrScanCanvas.width, qrScanCanvas.height);
            const code = decodeQrImageData(imageData);
            if (code && code.data) acceptQrCode(code.data, true);
          }
        } catch (ex) {
          console.error('Live QR scan failed:', ex);
        }
      }

      if (cameraStream) qrScanTimer = setTimeout(loop, qrLocked ? 500 : 180);
    };
    loop();
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (cameraStatus) cameraStatus.textContent = 'Live camera requires HTTPS and a supported browser.';
      showCameraStage();
      return;
    }

    stopCamera();
    showCameraStage();
    if (cameraStatus) cameraStatus.textContent = 'Opening rear camera...';

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      cameraVideo.srcObject = cameraStream;
      await cameraVideo.play();
      if (cameraStatus) cameraStatus.textContent = qrLocked ? 'QR already locked. You can capture the test.' : 'Scanning QR code...';
      scheduleLiveQrScan();
    } catch (ex) {
      console.error('Camera open failed:', ex);
      cameraStream = null;
      if (cameraStatus) cameraStatus.textContent = 'Unable to open camera. Check browser camera permission and HTTPS.';
    }
  }

  function stopCamera(keepStage) {
    stopQrLoop();
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    if (cameraVideo) cameraVideo.srcObject = null;
    if (!keepStage) showDetectionStage(!!(combinedCanvas && combinedCanvas.width && combinedCanvas.height));
  }

  function captureFromCamera() {
    if (!cameraVideo || !cameraStream || cameraVideo.readyState < 2) return;
    const vw = cameraVideo.videoWidth;
    const vh = cameraVideo.videoHeight;
    if (!vw || !vh) return;

    const shot = document.createElement('canvas');
    shot.width = vw;
    shot.height = vh;
    shot.getContext('2d').drawImage(cameraVideo, 0, 0, vw, vh);

    // Last chance QR scan from the full-resolution captured frame.
    if (!qrLocked && typeof window.jsQR === 'function') {
      try {
        const sctx = shot.getContext('2d', { willReadFrequently: true });
        const imageData = sctx.getImageData(0, 0, shot.width, shot.height);
        const code = decodeQrImageData(imageData);
        if (code && code.data) acceptQrCode(code.data, true);
      } catch (_) {}
    }

    const img = new Image();
    img.onload = function () {
      lastImage = img;
      stopCamera(true);
      analyze();
    };
    img.src = shot.toDataURL('image/jpeg', 0.94);
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

function drawMetadataOverlay(ctx, W, H) {
  const ts = getTimestampParts();

  const lines = [
    `Result : ${lastResultText || 'Invalid'}`,
    ...(lastQr.item ? [`Test   : ${lastQr.item}`] : []),
    ...(lastQr.lot ? [`LOT    : ${lastQr.lot}`] : []),
    ...(lastQr.exp ? [`EXP    : ${lastQr.exp}${lastQr.expired ? ' (EXPIRED)' : ''}`] : []),
    ...(lastQr.pn ? [`PN     : ${lastQr.pn}`] : []),
    `Date   : ${ts.date}`,
    `Time   : ${ts.time}`,
    `Region : ${getRegionText()}`
  ];

  const fontSize = Math.max(18, Math.round(W / 15));
  const pad = Math.max(12, Math.round(W * 0.035));

  ctx.save();
  ctx.font = `800 ${fontSize}px "Segoe UI", "Noto Sans TC", sans-serif`;

  const textW = Math.max(...lines.map(t => ctx.measureText(t).width));
  const lineH = Math.round(fontSize * 1.45);

  const boxW = Math.min(W * 0.68, textW + pad * 2);
  const boxH = lineH * lines.length + pad * 1.7;

  const x = Math.max(pad, Math.round(W - boxW - pad));
  const y = Math.max(pad, Math.round(H - boxH - pad));

  const radius = Math.max(10, Math.round(W * 0.035));

  // shadow
  ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;

  // background
  const grad = ctx.createLinearGradient(x, y, x + boxW, y + boxH);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.96)');
  grad.addColorStop(0.55, 'rgba(30, 64, 175, 0.94)');
  grad.addColorStop(1, 'rgba(14, 165, 233, 0.90)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + boxW - radius, y);
  ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + radius);
  ctx.lineTo(x + boxW, y + boxH - radius);
  ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - radius, y + boxH);
  ctx.lineTo(x + radius, y + boxH);
  ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // border
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.95)';
  ctx.lineWidth = Math.max(2, Math.round(W / 180));
  ctx.stroke();

  // left accent line
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(x + pad * 0.55, y + pad * 0.7, Math.max(3, W / 90), boxH - pad * 1.4);

  // text
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) {
      const isPositive = String(lastResultText).toLowerCase() === 'positive';
      const isNegative = String(lastResultText).toLowerCase() === 'negative';

      ctx.fillStyle = isPositive
        ? '#FEE2E2'
        : isNegative
          ? '#DCFCE7'
          : '#F8FAFC';
    } else {
      ctx.fillStyle = '#E0F2FE';
    }

    ctx.fillText(
      lines[i],
      x + pad * 1.15,
      y + pad + fontSize + i * lineH
    );
  }

  ctx.restore();
}

function renderCombinedDetectionView() {
  if (!combinedCanvas || !cropCanvas || !canvas || !cropCanvas.width || !cropCanvas.height) return;

  const W = cropCanvas.width;
  const H = cropCanvas.height;

  combinedCanvas.width = W;
  combinedCanvas.height = H;

  const ctx = combinedCanvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // main detection image
  ctx.drawImage(cropCanvas, 0, 0, W, H);

  // original image thumbnail, bigger and placed on upper-left
  if (canvas.width && canvas.height) {
    const thumbW = Math.max(120, Math.round(W * 0.42));
    const thumbH = Math.round(canvas.height * thumbW / Math.max(1, canvas.width));

    const pad = Math.max(8, Math.round(W * 0.035));
    const x = pad;
    const y = pad;

    const boxPad = Math.max(6, Math.round(W * 0.018));
    const radius = Math.max(8, Math.round(W * 0.03));

    ctx.save();

    // shadow
    ctx.shadowColor = 'rgba(15, 23, 42, 0.30)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;

    // glass card
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    ctx.moveTo(x - boxPad + radius, y - boxPad);
    ctx.lineTo(x - boxPad + thumbW + boxPad * 2 - radius, y - boxPad);
    ctx.quadraticCurveTo(
      x - boxPad + thumbW + boxPad * 2,
      y - boxPad,
      x - boxPad + thumbW + boxPad * 2,
      y - boxPad + radius
    );
    ctx.lineTo(
      x - boxPad + thumbW + boxPad * 2,
      y - boxPad + thumbH + boxPad * 2 - radius
    );
    ctx.quadraticCurveTo(
      x - boxPad + thumbW + boxPad * 2,
      y - boxPad + thumbH + boxPad * 2,
      x - boxPad + thumbW + boxPad * 2 - radius,
      y - boxPad + thumbH + boxPad * 2
    );
    ctx.lineTo(x - boxPad + radius, y - boxPad + thumbH + boxPad * 2);
    ctx.quadraticCurveTo(
      x - boxPad,
      y - boxPad + thumbH + boxPad * 2,
      x - boxPad,
      y - boxPad + thumbH + boxPad * 2 - radius
    );
    ctx.lineTo(x - boxPad, y - boxPad + radius);
    ctx.quadraticCurveTo(x - boxPad, y - boxPad, x - boxPad + radius, y - boxPad);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // blue medical-tech border
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = Math.max(2, Math.round(W / 160));
    ctx.stroke();

    ctx.drawImage(canvas, x, y, thumbW, thumbH);

    // small label
    const labelFont = Math.max(10, Math.round(W / 30));
    ctx.font = `800 ${labelFont}px "Segoe UI", sans-serif`;
    ctx.fillStyle = '#0F172A';
    ctx.fillText('Original Image', x, y + thumbH + labelFont + boxPad);

    ctx.restore();
  }

  drawMetadataOverlay(ctx, W, H);
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
    showDetectionStage(true);
    updateResultSubtitle();
  }

  function analyze() {
    if (!lastImage) { clearRoiOnlyView(); return; }
    resizeAndDrawImage(lastImage);
    scanQrFromCanvas(!qrLocked);
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
      showDetectionStage(false);
      updateResultSubtitle();
      if (debugText) {
        debugText.innerHTML =
          '<b>Exception</b><br>' +
          (ex && ex.stack ? ex.stack : (ex && ex.message ? ex.message : String(ex)));
      }
    }
  }

  function loadFile(file) {
    if (!file) return;
    stopCamera();
    showDetectionStage(false);
    clearQrData();
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
      updateQrDisplay({ raw: '', item: '', lot: '', exp: '', pn: '', expired: false }, false);
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
  if (startCameraBtn) startCameraBtn.addEventListener('click', startCamera);
  if (captureBtn) captureBtn.addEventListener('click', captureFromCamera);
  if (closeCameraBtn) closeCameraBtn.addEventListener('click', stopCamera);
  if (rescanQrBtn) rescanQrBtn.addEventListener('click', () => { clearQrData(); if (cameraStream) scheduleLiveQrScan(); });
  galleryInput.addEventListener('change', e => loadFile(e.target.files[0]));
  window.addEventListener('pagehide', () => stopCamera(true));
  showDetectionStage(false);
  updateQrDisplay(lastQr, false);
  if (sessionStorage.getItem('asap_access') === '1') {
    lockPanel.classList.add('hidden');
    mainPanel.classList.remove('hidden');
  }
})();
