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
  const qrManufacturer = document.getElementById('qrManufacturer');
  const qrMfgDate = document.getElementById('qrMfgDate');
  const qrLot = document.getElementById('qrLot');
  const qrExp = document.getElementById('qrExp');
  const qrPn = document.getElementById('qrPn');
  const rescanQrBtn = document.getElementById('rescanQrBtn');
  const compactQrFields = document.getElementById('compactQrFields');
  const compactValidity = document.getElementById('compactValidity');
  const resultSub = document.getElementById('resultSub');
  const detectionPanel = document.getElementById('detectionPanel');
  const stagePlaceholder = document.getElementById('stagePlaceholder');
  const galleryLabel = document.getElementById('galleryLabel');
  const emptyQr = () => ({ raw: '', item: '', manufacturer: '', mfgDate: '', lot: '', exp: '', pn: '', fields: [], expired: false });
  let lastQr = emptyQr();
  let qrLocked = false;
  let cameraStream = null;
  let qrScanTimer = null;
  let qrScanCanvas = null;
  let nativeQrDetector = null;
  let nativeQrBusy = false;
  let lastQrGeometry = null;
  let captureBusy = false;
  let lastResultText = 'Ready';
  const NTFY_TOPIC = 'ASAPRapidReader';
  let notificationSerial = 0;
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

  async function publishNtfyResult(resultText) {
    const serial = ++notificationSerial;
    const ts = getTimestampParts();
    const testName = lastQr.item || 'ASAP Rapid Test';
    const lot = lastQr.lot ? `\nLot: ${lastQr.lot}` : '';
    const region = getRegionText();
    const location = region && !/locating|unavailable|supported/i.test(region) ? `\nRegion: ${region}` : '';
    const message = `Result: ${resultText}\nTest: ${testName}${lot}\nTime: ${ts.date} ${ts.time}${location}`;
    const tags = resultText === 'Positive' ? 'warning' : (resultText === 'Negative' ? 'white_check_mark' : 'grey_question');
    const url = `https://ntfy.sh/${encodeURIComponent(NTFY_TOPIC)}?title=${encodeURIComponent('ASAP Rapid Reader')}&tags=${encodeURIComponent(tags)}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: message,
        mode: 'cors',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (debugText && serial === notificationSerial) {
        debugText.insertAdjacentHTML('afterbegin', 'ntfy: sent to ASAPRapidReader<br><hr>');
      }
    } catch (error) {
      console.warn('ntfy publish failed', error);
      if (debugText && serial === notificationSerial) {
        debugText.insertAdjacentHTML('afterbegin', `ntfy: failed (${String(error && error.message || error)})<br><hr>`);
      }
    }
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
    const fields = [];

    const addField = (label, value) => {
      const cleanLabel = String(label || '').replace(/^\s*[a-z0-9]+[.)]\s*/i, '').trim();
      const cleanValue = String(value == null ? '' : value).trim();
      if (!cleanLabel || !cleanValue) return;
      const key = cleanLabel.toUpperCase().replace(/[^A-Z0-9]/g, '');
      map[key] = cleanValue;
      const old = fields.find(f => f.key === key);
      if (old) old.value = cleanValue;
      else fields.push({ key, label: cleanLabel, value: cleanValue });
    };

    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.keys(parsed).forEach(key => addField(key, parsed[key]));
        }
      } catch (_) {
        text.split(/[;\n\r&|]+/).forEach(part => {
          const m = part.match(/^\s*(.+?)\s*[:=]\s*(.*?)\s*$/);
          if (m) addField(m[1], m[2]);
        });
      }
    }

    const pick = (...keys) => {
      for (const k of keys) {
        const normalized = String(k).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (map[normalized]) return map[normalized];
      }
      return '';
    };

    const exp = pick('E', 'EXP', 'EXPIRY', 'EXPIRYDATE', 'EXPIRY_DATE', 'EXPIRE', 'EXPIREDDATE', 'EXPIREDDATEOFTEST', 'EXPIRATIONDATE', 'VALIDUNTIL', 'VALID_UNTIL');
    const displayDate = value => /^\d{8}$/.test(value || '')
      ? `${value.slice(0,4)}/${value.slice(4,6)}/${value.slice(6,8)}`
      : value;
    let expired = false;
    const expiryForCheck = displayDate(exp);
    if (expiryForCheck && /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(expiryForCheck)) {
      const end = new Date(expiryForCheck.replace(/\//g, '-') + 'T23:59:59');
      expired = !Number.isNaN(end.getTime()) && end.getTime() < Date.now();
    }

    return {
      raw: text,
      item: pick('N', 'ITEM', 'TEST', 'TESTITEM', 'TEST_ITEM', 'ASSAY', 'NAMEOFTEST', 'TESTNAME'),
      manufacturer: pick('M', 'MANUFACTURER', 'MANUFACTURE', 'MFR', 'MAKER'),
      mfgDate: displayDate(pick('D', 'DATEOFMANUFACTURER', 'DATEOFMANUFACTURE', 'MANUFACTUREDATE', 'MANUFACTURINGDATE', 'MFGDATE')),
      lot: pick('L', 'LOT', 'LOTNO', 'LOT_NO', 'LOTNUMBER', 'BATCH', 'BATCHNO', 'BATCH_NO'),
      exp: displayDate(exp),
      pn: pick('PN', 'PRODUCT', 'PRODUCTNO', 'PRODUCT_NO', 'MODEL', 'SKU'),
      fields,
      expired
    };
  }

  function renderCompactQrFields(found) {
    if (!compactQrFields) return;
    compactQrFields.replaceChildren();
    if (!found) {
      const empty = document.createElement('div');
      empty.className = 'compactQrEmpty';
      empty.textContent = 'Waiting for test QR...';
      compactQrFields.appendChild(empty);
      return;
    }

    const knownLabels = { N:'Name of Test', M:'Manufacturer', D:'Date of Manufacturer', L:'Lot Number', E:'Expired Date of the Test' };
    const displayFields = lastQr.fields && lastQr.fields.length ? lastQr.fields.map(f => ({
      label: knownLabels[f.key] || f.label,
      value: (f.key === 'D' || f.key === 'E') && /^\d{8}$/.test(f.value)
        ? `${f.value.slice(0,4)}/${f.value.slice(4,6)}/${f.value.slice(6,8)}`
        : f.value
    })) : [
      { label: 'Name of Test', value: lastQr.item },
      { label: 'Manufacturer', value: lastQr.manufacturer },
      { label: 'Date of Manufacture', value: lastQr.mfgDate },
      { label: 'Lot Number', value: lastQr.lot },
      { label: 'Expiry Date', value: lastQr.exp },
      { label: 'Product No.', value: lastQr.pn }
    ].filter(f => f.value);

    if (!displayFields.length) {
      const row = document.createElement('div');
      row.className = 'compactQrRaw';
      row.textContent = lastQr.raw || 'QR Code detected';
      compactQrFields.appendChild(row);
      return;
    }

    displayFields.forEach(field => {
      const row = document.createElement('div');
      row.className = 'compactQrRow';
      const label = document.createElement('span');
      const value = document.createElement('strong');
      label.textContent = field.label;
      value.textContent = field.value;
      row.append(label, value);
      compactQrFields.appendChild(row);
    });
  }

  function updateQrDisplay(info, found) {
    lastQr = info || emptyQr();
    if (qrStatus) {
      qrStatus.className = 'qrStatus ' + (found ? (lastQr.expired ? 'expired' : 'ok') : 'neutral');
      qrStatus.textContent = found ? (lastQr.expired ? 'QR detected · EXPIRED' : 'QR detected ✓') : 'QR not detected';
    }

    const hasFields = !!(lastQr.fields?.length || lastQr.item || lastQr.manufacturer || lastQr.mfgDate || lastQr.lot || lastQr.exp || lastQr.pn);
    renderCompactQrFields(found);
    if (compactValidity) {
      compactValidity.className = 'validity ' + (found ? (lastQr.expired ? 'expired' : 'ok') : 'neutral');
      compactValidity.textContent = found
        ? (hasFields ? (lastQr.expired ? 'Expired' : 'Valid ✓') : 'QR ✓')
        : 'QR --';
    }
    if (qrRaw) qrRaw.textContent = lastQr.raw || '';
    if (qrRawWrap) qrRawWrap.classList.toggle('hidden', !found);

    if (qrFields) qrFields.classList.toggle('hidden', !hasFields);
    if (qrItem) qrItem.textContent = lastQr.item || '-';
    if (qrManufacturer) qrManufacturer.textContent = lastQr.manufacturer || '-';
    if (qrMfgDate) qrMfgDate.textContent = lastQr.mfgDate || '-';
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

  function enhanceQrImageData(imageData, thresholdMode) {
    const src = imageData.data;
    const out = new ImageData(new Uint8ClampedArray(src), imageData.width, imageData.height);
    const data = out.data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    const mean = sum / Math.max(1, data.length / 4);
    for (let i = 0; i < data.length; i += 4) {
      let gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (thresholdMode) gray = gray < mean * 0.92 ? 0 : 255;
      else gray = Math.max(0, Math.min(255, (gray - mean) * 1.65 + 128));
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
    return out;
  }

  // Dense QR codes are retried at several crops and with enhanced contrast.
  function decodeQrCanvas(sourceCanvas) {
    if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return null;
    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const W = sourceCanvas.width;
    const H = sourceCanvas.height;
    const attempts = [
      { x: 0, y: 0, w: W, h: H },
      { x: W * 0.06, y: H * 0.06, w: W * 0.88, h: H * 0.88 }
    ];

    const square = Math.min(W, H) * 0.82;
    attempts.push({ x: (W - square) / 2, y: (H - square) / 2, w: square, h: square });

    for (const a of attempts) {
      const imageData = ctx.getImageData(
        Math.max(0, Math.round(a.x)), Math.max(0, Math.round(a.y)),
        Math.max(1, Math.min(W - Math.round(a.x), Math.round(a.w))),
        Math.max(1, Math.min(H - Math.round(a.y), Math.round(a.h)))
      );
      let code = decodeQrImageData(imageData);
      if (code && code.data) { code.__offsetX = a.x; code.__offsetY = a.y; return code; }
      code = decodeQrImageData(enhanceQrImageData(imageData, false));
      if (code && code.data) { code.__offsetX = a.x; code.__offsetY = a.y; return code; }
      code = decodeQrImageData(enhanceQrImageData(imageData, true));
      if (code && code.data) { code.__offsetX = a.x; code.__offsetY = a.y; return code; }
    }
    return null;
  }

  function qrGeometryFromJsQr(code) {
    if (!code || !code.location) return null;
    const keys = ['topLeftCorner', 'topRightCorner', 'bottomRightCorner', 'bottomLeftCorner'];
    const ox = Number(code.__offsetX || 0);
    const oy = Number(code.__offsetY || 0);
    const points = keys.map(k => code.location[k]).filter(Boolean).map(p => ({ x: p.x + ox, y: p.y + oy }));
    if (!points.length) return null;
    return {
      points,
      center: {
        x: points.reduce((s, p) => s + p.x, 0) / points.length,
        y: points.reduce((s, p) => s + p.y, 0) / points.length
      }
    };
  }

  function qrGeometryFromNative(code) {
    if (!code) return null;
    const points = Array.from(code.cornerPoints || []).map(p => ({ x: p.x, y: p.y }));
    if (points.length) {
      return { points, center: { x: points.reduce((s,p)=>s+p.x,0)/points.length, y: points.reduce((s,p)=>s+p.y,0)/points.length } };
    }
    const b = code.boundingBox;
    return b ? { points: [], center: { x: b.x + b.width/2, y: b.y + b.height/2 } } : null;
  }

  async function tryNativeQrDetector() {
    if (nativeQrBusy || qrLocked || !cameraVideo || typeof window.BarcodeDetector !== 'function') return;
    nativeQrBusy = true;
    try {
      if (!nativeQrDetector) nativeQrDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const codes = await nativeQrDetector.detect(cameraVideo);
      if (codes && codes[0] && codes[0].rawValue) acceptQrCode(codes[0].rawValue, true, qrGeometryFromNative(codes[0]));
    } catch (_) {
      // Safari versions without BarcodeDetector continue with the jsQR fallback.
    } finally {
      nativeQrBusy = false;
    }
  }

  function acceptQrCode(raw, lockIt, geometry) {
    if (!raw) return false;
    updateQrDisplay(parseQrData(raw), true);
    if (geometry && geometry.center) lastQrGeometry = geometry;
    if (lockIt) qrLocked = true;
    if (cameraStatus) cameraStatus.textContent = qrLocked ? 'QR detected and locked. You can capture the test now.' : 'QR detected';
    return true;
  }

  function clearQrData() {
    qrLocked = false;
    lastQrGeometry = null;
    updateQrDisplay(emptyQr(), false);
    if (cameraStatus && cameraStream) cameraStatus.textContent = 'Scanning QR code...';
  }

  function scanQrFromCanvas(forceClear, forceRescan) {
    if (!canvas || !canvas.width || !canvas.height) return false;
    if (qrLocked && !forceRescan) return true;
    if (typeof window.jsQR !== 'function') {
      if (qrStatus) {
        qrStatus.className = 'qrStatus neutral';
        qrStatus.textContent = 'QR decoder unavailable';
      }
      return false;
    }

    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const code = decodeQrCanvas(canvas);
      if (code && code.data) return acceptQrCode(code.data, false, qrGeometryFromJsQr(code));
      if (forceClear) updateQrDisplay(emptyQr(), false);
      return false;
    } catch (ex) {
      console.error('QR scan failed:', ex);
      if (forceClear) updateQrDisplay(emptyQr(), false);
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

      if (!qrLocked) tryNativeQrDetector();

      if (!qrLocked && typeof window.jsQR === 'function') {
        try {
          const vw = cameraVideo.videoWidth || 0;
          const vh = cameraVideo.videoHeight || 0;
          if (vw > 0 && vh > 0) {
            if (!qrScanCanvas) qrScanCanvas = document.createElement('canvas');
            const maxW = 1100;
            const scale = Math.min(1, maxW / vw);
            qrScanCanvas.width = Math.max(1, Math.round(vw * scale));
            qrScanCanvas.height = Math.max(1, Math.round(vh * scale));
            const qctx = qrScanCanvas.getContext('2d', { willReadFrequently: true });
            qctx.drawImage(cameraVideo, 0, 0, qrScanCanvas.width, qrScanCanvas.height);
            const code = decodeQrCanvas(qrScanCanvas);
            if (code && code.data) acceptQrCode(code.data, true, qrGeometryFromJsQr(code));
          }
        } catch (ex) {
          console.error('Live QR scan failed:', ex);
        }
      }

      if (cameraStream) qrScanTimer = setTimeout(loop, qrLocked ? 500 : 260);
    };
    loop();
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (cameraStatus) cameraStatus.textContent = 'Live camera requires HTTPS and a supported browser.';
      showCameraStage();
      return;
    }

    captureBusy = false;
    if (captureBtn) captureBtn.disabled = false;
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

  async function captureFromCamera() {
    if (captureBusy || !cameraVideo || !cameraStream) return;
    captureBusy = true;
    if (captureBtn) captureBtn.disabled = true;
    if (cameraStatus) cameraStatus.textContent = 'Preparing image...';

    // On iPhone/Safari the first tap can arrive before videoWidth/videoHeight
    // are populated even though play() has resolved. Wait for a real frame.
    const deadline = Date.now() + 2500;
    while (cameraStream && (cameraVideo.readyState < 2 || !cameraVideo.videoWidth || !cameraVideo.videoHeight) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (cameraVideo.requestVideoFrameCallback) {
      await new Promise(resolve => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        cameraVideo.requestVideoFrameCallback(finish);
        setTimeout(finish, 350);
      });
    }

    if (!cameraStream || cameraVideo.readyState < 2 || !cameraVideo.videoWidth || !cameraVideo.videoHeight) {
      captureBusy = false;
      if (captureBtn) captureBtn.disabled = false;
      if (cameraStatus) cameraStatus.textContent = 'Camera frame not ready. Please tap Capture again.';
      return;
    }
    const vw = cameraVideo.videoWidth;
    const vh = cameraVideo.videoHeight;

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
      captureBusy = false;
      if (captureBtn) captureBtn.disabled = false;
      lastImage = img;
      stopCamera(true);
      analyze();
    };
    img.onerror = function () {
      captureBusy = false;
      if (captureBtn) captureBtn.disabled = false;
      if (cameraStatus) cameraStatus.textContent = 'Capture failed. Please try again.';
    };
    try {
      img.src = shot.toDataURL('image/jpeg', 0.94);
    } catch (ex) {
      console.error('Capture conversion failed:', ex);
      captureBusy = false;
      if (captureBtn) captureBtn.disabled = false;
      if (cameraStatus) cameraStatus.textContent = 'Capture failed. Please try again.';
    }
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

function drawMetadataPanel(ctx, x, y, width, height, baseW) {
  const ts = getTimestampParts();
  const rows = [
    ['Result', lastResultText || 'Invalid'],
    ['Name of Test', lastQr.item],
    ['Manufacturer', lastQr.manufacturer],
    ['Date of Manufacturer', lastQr.mfgDate],
    ['Lot Number', lastQr.lot],
    ['Expired Date', `${lastQr.exp || ''}${lastQr.expired ? ' (EXPIRED)' : ''}`],
    ['Date', ts.date], ['Time', ts.time], ['Region', getRegionText()]
  ].filter(r => r[1]);
  const pad = Math.max(8, Math.round(baseW * 0.04));
  const labelSize = Math.max(9, Math.round(baseW / 24));
  const valueSize = Math.max(11, Math.round(baseW / 18));
  let cy = y + pad;
  ctx.save();
  ctx.textBaseline = 'top';
  for (const [label, value] of rows) {
    if (cy > y + height - valueSize * 2) break;
    ctx.font = `700 ${labelSize}px "Segoe UI", sans-serif`;
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(label, x + pad, cy);
    cy += labelSize * 1.25;
    ctx.font = `800 ${valueSize}px "Segoe UI", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = label === 'Result' && lastResultText === 'Positive' ? '#FCA5A5' : '#F8FAFC';
    const words = String(value).split(/\s+/);
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width - pad * 2 && line) {
        ctx.fillText(line, x + pad, cy); cy += valueSize * 1.25; line = word;
      } else line = next;
    }
    if (line) { ctx.fillText(line, x + pad, cy); cy += valueSize * 1.45; }
    ctx.strokeStyle = '#1E293B';
    ctx.beginPath(); ctx.moveTo(x + pad, cy - valueSize * .25); ctx.lineTo(x + width - pad, cy - valueSize * .25); ctx.stroke();
  }
  ctx.restore();
}

function renderCombinedDetectionView() {
  if (!combinedCanvas || !cropCanvas || !canvas || !cropCanvas.width || !cropCanvas.height) return;
  const W = cropCanvas.width, H = cropCanvas.height;
  const sideW = Math.max(150, Math.round(W * 0.92));
  const totalW = W + sideW * 2;
  combinedCanvas.width = totalW;
  combinedCanvas.height = H;
  const ctx = combinedCanvas.getContext('2d');
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, totalW, H);

  // Center: corrected cassette only. Nothing is drawn over it.
  ctx.drawImage(cropCanvas, sideW, 0, W, H);
  ctx.strokeStyle = '#334155';
  ctx.strokeRect(sideW, 0, W, H);

  // Left black panel: original photo.
  if (canvas.width && canvas.height) {
    const pad = Math.max(8, Math.round(W * 0.04));
    const maxW = sideW - pad * 2;
    const maxH = H - pad * 4 - Math.max(12, W / 18);
    const scale = Math.min(maxW / canvas.width, maxH / canvas.height);
    const thumbW = Math.max(1, Math.round(canvas.width * scale));
    const thumbH = Math.max(1, Math.round(canvas.height * scale));
    const x = Math.round((sideW - thumbW) / 2);
    const y = pad;
    ctx.drawImage(canvas, x, y, thumbW, thumbH);
    ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 2; ctx.strokeRect(x, y, thumbW, thumbH);
    ctx.font = `800 ${Math.max(10, Math.round(W/22))}px "Segoe UI", sans-serif`;
    ctx.fillStyle = '#E2E8F0'; ctx.textAlign = 'center';
    ctx.fillText('Original Image', sideW/2, Math.min(H-pad, y+thumbH+Math.max(15,W/15)));
    ctx.textAlign = 'left';
  }

  // Right black panel: QR and result metadata.
  drawMetadataPanel(ctx, sideW + W, 0, sideW, H, W);
}
  function updateTexts() {
    // Settings UI removed.
  }

  function getOptions() {
    return Object.assign({}, DEFAULT_OPTIONS, {
      qrRequired: true,
      qrCenter: lastQrGeometry && lastQrGeometry.center ? lastQrGeometry.center : null
    });
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
    publishNtfyResult(lastResultText);
  }

  function analyze() {
    if (!lastImage) { clearRoiOnlyView(); return; }
    resizeAndDrawImage(lastImage);
    // Always locate the QR again on the captured still image. Live-preview
    // coordinates are not reused because the phone may move before capture.
    lastQrGeometry = null;
    const qrFoundOnCapture = scanQrFromCanvas(false, true);
    if (!qrFoundOnCapture || !lastQrGeometry || !lastQrGeometry.center) {
      lastResultText = 'Invalid';
      resultEl.className = 'result invalid';
      resultEl.textContent = 'Invalid';
      if (resultSub) resultSub.textContent = 'QR not detected';
      detailEl.innerHTML = 'Failure reason: QR not detected on captured image.';
      if (debugText) debugText.innerHTML = 'Orientation gate: FAIL<br>Reason: QR not detected';
      showDetectionStage(false);
      return;
    }
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
