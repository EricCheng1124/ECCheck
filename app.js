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
  const shareAnalysisBtn = document.getElementById('shareAnalysisBtn');
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
  const multiResultList = document.getElementById('multiResultList');
  let lastMultiResults = [];
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
  let lastNotificationKey = '';
  let lastNotificationAt = 0;
  let gpsLookupToken = 0;
  const advancedLock = document.getElementById('advancedLock');
  const advancedContent = document.getElementById('advancedContent');
  const advancedPassInput = document.getElementById('advancedPassInput');
  const advancedUnlockBtn = document.getElementById('advancedUnlockBtn');
  const advancedMsg = document.getElementById('advancedMsg');


  // Settings UI removed; keep fixed detection defaults here.
  const DEFAULT_OPTIONS = {
    minAreaRatio: 0.01,
    ratioMin: 1.20,
    ratioMax: 10.0
  };

  // v31.71: multi-card extension built directly on the stable v31.70 single-card core.
  const BUILD_VERSION = 'v31.80';
  const MULTI_MAX_CARDS = 8;

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
    const now=Date.now();
    const key=String(resultText||'')+'|'+String(lastQr.raw||'');
    // v31.75: prevent duplicate pushes caused by repeated analysis/render callbacks.
    if (key===lastNotificationKey && now-lastNotificationAt<8000) {
      if (debugText) debugText.insertAdjacentHTML('afterbegin', 'ntfy: duplicate suppressed<br><hr>');
      return;
    }
    lastNotificationKey=key; lastNotificationAt=now;
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
    if (shareAnalysisBtn) {
      // v31.44: while the camera is open / before a new capture finishes,
      // do not show the share button. It appears only after analysis completes.
      shareAnalysisBtn.classList.add('hidden');
      shareAnalysisBtn.disabled = true;
      shareAnalysisBtn.setAttribute('aria-disabled', 'true');
    }
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
    if (shareAnalysisBtn) {
      // v31.44: Share is visible only when a newly analysed image exists.
      shareAnalysisBtn.classList.toggle('hidden', !hasImage);
      shareAnalysisBtn.disabled = !hasImage;
      shareAnalysisBtn.setAttribute('aria-disabled', hasImage ? 'false' : 'true');
    }
  }


  function canvasToPngBlob(sourceCanvas) {
    return new Promise((resolve, reject) => {
      if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) {
        reject(new Error('No analysis image available'));
        return;
      }
      sourceCanvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Unable to create analysis image'));
      }, 'image/png');
    });
  }

  function makeAnalysisFileName() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `ASAP_Check_Analysis_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  }

  async function shareAnalysisImage() {
    if (!combinedCanvas || !combinedCanvas.width || !combinedCanvas.height || combinedCanvas.classList.contains('hidden')) {
      alert('Please analyze a photo first.');
      return;
    }

    const oldText = shareAnalysisBtn ? shareAnalysisBtn.textContent : '';
    if (shareAnalysisBtn) {
      shareAnalysisBtn.disabled = true;
      shareAnalysisBtn.textContent = 'Preparing...';
    }

    try {
      const blob = await canvasToPngBlob(combinedCanvas);
      const fileName = makeAnalysisFileName();
      const file = new File([blob], fileName, { type: 'image/png' });
      const shareData = {
        title: 'ASAP Check Analysis',
        text: `ASAP Check result: ${lastResultText || 'Unknown'}`,
        files: [file]
      };

      let shared = false;
      if (navigator.share) {
        const canShareFile = !navigator.canShare || navigator.canShare({ files: [file] });
        if (canShareFile) {
          try {
            await navigator.share(shareData);
            shared = true;
          } catch (err) {
            if (err && err.name === 'AbortError') return;
            console.warn('Native file share failed; using PNG fallback.', err);
          }
        }
      }

      if (!shared) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        alert('Sharing is not available in this browser. The analysis PNG has been saved instead.');
      }
    } catch (err) {
      console.error(err);
      alert('Unable to share the analysis image.');
    } finally {
      if (shareAnalysisBtn) {
        shareAnalysisBtn.disabled = false;
        shareAnalysisBtn.textContent = oldText || 'Share Analysis Image';
      }
    }
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
      { x: W * 0.04, y: H * 0.04, w: W * 0.92, h: H * 0.92 },
      // 新卡匣的 QR 佔整張照片比例可能很小。多做幾個重疊區塊，
      // 讓 jsQR 不必每次都在整張高解析度照片中搜尋。
      { x: 0, y: 0, w: W * 0.62, h: H * 0.62 },
      { x: W * 0.38, y: 0, w: W * 0.62, h: H * 0.62 },
      { x: 0, y: H * 0.38, w: W * 0.62, h: H * 0.62 },
      { x: W * 0.38, y: H * 0.38, w: W * 0.62, h: H * 0.62 },
      { x: W * 0.18, y: 0, w: W * 0.64, h: H * 0.58 },
      { x: W * 0.18, y: H * 0.42, w: W * 0.64, h: H * 0.58 }
    ];

    const square = Math.min(W, H) * 0.86;
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


  function cloneCanvas(source) {
    const c = document.createElement('canvas');
    c.width = source.width; c.height = source.height;
    c.getContext('2d', { alpha:false }).drawImage(source, 0, 0);
    return c;
  }

  function qrBox(geometry) {
    const pts = geometry && Array.isArray(geometry.points) ? geometry.points : [];
    if (pts.length) {
      const xs = pts.map(p=>p.x), ys = pts.map(p=>p.y);
      return { x:Math.min(...xs), y:Math.min(...ys), w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys) };
    }
    const c = geometry && geometry.center ? geometry.center : {x:0,y:0};
    return {x:c.x-30,y:c.y-30,w:60,h:60};
  }

  function isSameQr(a,b) {
    if (!a || !b || !a.center || !b.center) return false;
    const aa=qrBox(a), bb=qrBox(b);
    const d=Math.hypot(a.center.x-b.center.x,a.center.y-b.center.y);
    return d < Math.max(24, Math.min(Math.max(aa.w,aa.h),Math.max(bb.w,bb.h))*0.75);
  }

  function qrSideEstimate(geometry) {
    const pts = geometry && Array.isArray(geometry.points) ? geometry.points : [];
    if (pts.length >= 4) {
      const ds=[];
      for (let i=0;i<4;i++) {
        const a=pts[i], b=pts[(i+1)%4];
        ds.push(Math.hypot(a.x-b.x,a.y-b.y));
      }
      ds.sort((a,b)=>a-b);
      return Math.max(18,(ds[1]+ds[2])*0.5);
    }
    const b=qrBox(geometry);
    return Math.max(18,Math.max(b.w,b.h));
  }

  function decodeQrRegionFast(ctx, region, maxSide=820) {
    const W=canvas.width,H=canvas.height;
    const x=Math.max(0,Math.round(region.x)), y=Math.max(0,Math.round(region.y));
    const w=Math.max(1,Math.min(W-x,Math.round(region.w))), h=Math.max(1,Math.min(H-y,Math.round(region.h)));
    if (w<40 || h<40) return null;
    const scale=Math.min(1,maxSide/Math.max(w,h));
    const tw=Math.max(40,Math.round(w*scale)), th=Math.max(40,Math.round(h*scale));
    const tmp=document.createElement('canvas'); tmp.width=tw; tmp.height=th;
    const tctx=tmp.getContext('2d',{willReadFrequently:true});
    tctx.drawImage(canvas,x,y,w,h,0,0,tw,th);
    const imageData=tctx.getImageData(0,0,tw,th);
    const variants=[imageData, enhanceQrImageData(imageData,false)];
    for (const v of variants) {
      const code=decodeQrImageData(v);
      if (code && code.data && code.location) {
        const inv=1/scale;
        const keys=['topLeftCorner','topRightCorner','bottomRightCorner','bottomLeftCorner'];
        const points=keys.map(k=>code.location[k]).filter(Boolean).map(p=>({x:x+p.x*inv,y:y+p.y*inv}));
        if (!points.length) return null;
        return {raw:code.data, geometry:{points,center:{x:points.reduce((a,p)=>a+p.x,0)/points.length,y:points.reduce((a,p)=>a+p.y,0)/points.length}}};
      }
    }
    return null;
  }

  function makeLocalDetectionCanvas(original, q, allQr) {
    const side = Math.max(24, qrSideEstimate(q.geometry));
    const c = q.geometry.center;

    // v31.80: true Voronoi ownership in IMAGE coordinates.
    // Each QR owns only pixels closer to itself than to any neighboring QR.
    // This prevents a dense multi-card ROI from swallowing the next cassette/QR.
    let poly = [
      {x:0,y:0}, {x:original.width,y:0},
      {x:original.width,y:original.height}, {x:0,y:original.height}
    ];
    function clipHalfPlane(input, nx, ny, k) {
      const out=[];
      if (!input.length) return out;
      const inside=p => p.x*nx + p.y*ny <= k + 1e-6;
      const intersect=(a,b)=>{
        const da=a.x*nx+a.y*ny-k, db=b.x*nx+b.y*ny-k;
        const t=da/(da-db || 1e-9);
        return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t};
      };
      for(let i=0;i<input.length;i++){
        const a=input[i], b=input[(i+1)%input.length];
        const ia=inside(a), ib=inside(b);
        if(ia && ib) out.push(b);
        else if(ia && !ib) out.push(intersect(a,b));
        else if(!ia && ib){ out.push(intersect(a,b)); out.push(b); }
      }
      return out;
    }
    (allQr||[]).forEach(other=>{
      if(other===q || !other.geometry?.center) return;
      const o=other.geometry.center;
      // |p-c|^2 <= |p-o|^2 -> 2(o-c).p <= |o|^2-|c|^2
      const nx=2*(o.x-c.x), ny=2*(o.y-c.y);
      const k=o.x*o.x+o.y*o.y-c.x*c.x-c.y*c.y;
      poly=clipHalfPlane(poly,nx,ny,k);
    });

    // Also keep work bounded around this QR. Cassette is 70x20 mm, QR ~=14 mm.
    // Use a generous 6Q square; true Voronoi handles neighboring cards.
    const bound=[
      {x:c.x-3.0*side,y:c.y-1.5*side},{x:c.x+3.0*side,y:c.y-1.5*side},
      {x:c.x+3.0*side,y:c.y+5.5*side},{x:c.x-3.0*side,y:c.y+5.5*side}
    ];
    // Clip to the axis-aligned bound with the same half-plane helper.
    poly=clipHalfPlane(poly, 1,0,c.x+3.0*side);
    poly=clipHalfPlane(poly,-1,0,-(c.x-3.0*side));
    poly=clipHalfPlane(poly,0, 1,c.y+5.5*side);
    poly=clipHalfPlane(poly,0,-1,-(c.y-1.5*side));
    if(poly.length<3) poly=bound;

    const xs=poly.map(p=>p.x), ys=poly.map(p=>p.y);
    const pad=Math.max(6,Math.round(side*0.08));
    const x=Math.max(0,Math.floor(Math.min(...xs)-pad));
    const y=Math.max(0,Math.floor(Math.min(...ys)-pad));
    const x2=Math.min(original.width,Math.ceil(Math.max(...xs)+pad));
    const y2=Math.min(original.height,Math.ceil(Math.max(...ys)+pad));
    const local=document.createElement('canvas');
    local.width=Math.max(1,x2-x); local.height=Math.max(1,y2-y);
    const lctx=local.getContext('2d',{alpha:false});
    lctx.fillStyle='#111'; lctx.fillRect(0,0,local.width,local.height);
    lctx.save(); lctx.beginPath();
    poly.forEach((pt,i)=>{ const px=pt.x-x,py=pt.y-y; i?lctx.lineTo(px,py):lctx.moveTo(px,py); });
    lctx.closePath(); lctx.clip();
    lctx.drawImage(original,x,y,local.width,local.height,0,0,local.width,local.height);
    lctx.restore();
    const geometry={center:{x:c.x-x,y:c.y-y},points:(q.geometry.points||[]).map(pt=>({x:pt.x-x,y:pt.y-y}))};
    return {canvas:local,geometry,offsetX:x,offsetY:y,corridor:poly,ownership:'qr-voronoi'};
  }

  function translateDetectionResult(r, ox, oy) {
    if (!r) return r;
    if (r.rect) { r.rect.cx += ox; r.rect.cy += oy; }
    if (Array.isArray(r.outerPoints)) r.outerPoints=r.outerPoints.map(p=>({x:p.x+ox,y:p.y+oy}));
    return r;
  }

  const yieldToUi = () => new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });

  async function detectAllQrCodesFromCanvas() {
    const found=[];
    const pushUnique=(raw,geometry)=>{
      if (!geometry || !geometry.center) return false;
      if (found.some(x=>isSameQr(x.geometry,geometry))) return false;
      found.push({raw:String(raw||''),geometry});
      return true;
    };

    // v31.77: UI-first QR scan. Native multi-result detection is always tried first.
    if (typeof window.BarcodeDetector === 'function') {
      try {
        const detector = nativeQrDetector || new window.BarcodeDetector({formats:['qr_code']});
        nativeQrDetector = detector;
        const codes = await detector.detect(canvas);
        (codes||[]).forEach(code=>pushUnique(code.rawValue, qrGeometryFromNative(code)));
      } catch (_) {}
      await yieldToUi();
    }

    // jsQR returns one code per image. Use a LIMITED set of overlapping tiles instead of
    // v31.76's exhaustive sliding-window x masked multi-pass scan, which could freeze iPhone UI.
    if (typeof window.jsQR === 'function' && found.length < MULTI_MAX_CARDS) {
      const W=canvas.width, H=canvas.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const regions=[];
      const seenRegions=new Set();
      const addRegion=(x,y,w,h)=>{
        x=Math.max(0,Math.round(x)); y=Math.max(0,Math.round(y));
        w=Math.min(W-x,Math.round(w)); h=Math.min(H-y,Math.round(h));
        if (w<70 || h<70) return;
        const key=[Math.round(x/12),Math.round(y/12),Math.round(w/12),Math.round(h/12)].join(':');
        if(seenRegions.has(key)) return;
        seenRegions.add(key); regions.push({x,y,w,h});
      };
      const addGrid=(cols,rows,overlap=0.16)=>{
        const cw=W/cols, ch=H/rows, px=cw*overlap, py=ch*overlap;
        for(let ry=0;ry<rows;ry++) for(let rx=0;rx<cols;rx++)
          addRegion(rx*cw-px, ry*ch-py, cw+2*px, ch+2*py);
      };

      // Fast full frame, then horizontal/card-friendly partitions, then a few 2-row grids.
      addRegion(0,0,W,H);
      addGrid(2,1,0.20); addGrid(3,1,0.18); addGrid(4,1,0.16); addGrid(5,1,0.14);
      addGrid(2,2,0.18); addGrid(3,2,0.16); addGrid(4,2,0.14);

      let processed=0;
      for (const a of regions) {
        if (found.length>=MULTI_MAX_CARDS) break;
        const hit=decodeQrRegionFast(ctx,a,900);
        if (hit) pushUnique(hit.raw,hit.geometry);
        processed++;
        // Let Safari paint the captured image and remain responsive during analysis.
        if ((processed % 3) === 0) {
          if (cameraStatus) cameraStatus.textContent = `Analyzing QR… ${found.length} found`;
          await yieldToUi();
        }
      }
    }

    found.sort((a,b)=>{
      const dx=a.geometry.center.x-b.geometry.center.x;
      if(Math.abs(dx)>Math.max(25,canvas.width*0.035)) return dx;
      return a.geometry.center.y-b.geometry.center.y;
    });
    return found.slice(0,MULTI_MAX_CARDS);
  }

  function sortCardsSpatially(items) {
    if (!items || items.length < 2) return items || [];
    const pts=items.map(x=>({x:x.result.rect.cx,y:x.result.rect.cy}));
    const mx=pts.reduce((s,p)=>s+p.x,0)/pts.length, my=pts.reduce((s,p)=>s+p.y,0)/pts.length;
    let sxx=0,syy=0,sxy=0;
    pts.forEach(p=>{const x=p.x-mx,y=p.y-my;sxx+=x*x;syy+=y*y;sxy+=x*y;});
    const theta=0.5*Math.atan2(2*sxy,sxx-syy);
    let vx=Math.cos(theta),vy=Math.sin(theta);
    if (Math.abs(vx)>=Math.abs(vy)) { if(vx<0){vx=-vx;vy=-vy;} }
    else { if(vy<0){vx=-vx;vy=-vy;} }
    return items.slice().sort((a,b)=>((a.result.rect.cx-mx)*vx+(a.result.rect.cy-my)*vy)-((b.result.rect.cx-mx)*vx+(b.result.rect.cy-my)*vy));
  }

  function drawMultiAnnotations(items) {
    const ctx=canvas.getContext('2d');
    const base=Math.max(2,canvas.width/420);
    items.forEach((item,index)=>{
      const r=item.result;
      const pts=Array.isArray(r.outerPoints)?r.outerPoints:[];
      ctx.save();
      ctx.lineWidth=base*2;
      ctx.strokeStyle = item.text==='Positive' ? '#dc2626' : (item.text==='Negative' ? '#16a34a' : '#f59e0b');
      if (pts.length>=4) {
        ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.closePath(); ctx.stroke();
      } else {
        const rr=r.rect; ctx.strokeRect(rr.cx-rr.w/2,rr.cy-rr.h/2,rr.w,rr.h);
      }
      const cx=r.rect.cx, cy=r.rect.cy;
      const rad=Math.max(18,canvas.width/38);
      ctx.fillStyle='#0f172a'; ctx.beginPath(); ctx.arc(cx,cy,rad,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=Math.max(2,base); ctx.stroke();
      ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`900 ${Math.round(rad*1.15)}px "Segoe UI",sans-serif`; ctx.fillText(String(index+1),cx,cy+1);
      ctx.restore();
    });
  }

  function renderMultiResultList(items) {
    if (!multiResultList) return;
    multiResultList.replaceChildren();
    if (!items || items.length < 2) { multiResultList.classList.add('hidden'); return; }
    items.forEach((item,index)=>{
      const row=document.createElement('div'); row.className='multiResultRow';
      const badge=document.createElement('span'); badge.className='multiCardBadge'; badge.textContent=String(index+1);
      const name=document.createElement('strong'); name.textContent=`Card ${index+1}`;
      const val=document.createElement('span'); val.className=`multiValue ${String(item.text||'Invalid').toLowerCase()}`; val.textContent=item.text||'Invalid';
      row.append(badge,name,val); multiResultList.appendChild(row);
    });
    multiResultList.classList.remove('hidden');
  }

  function renderMultiCombinedView(items) {
    if (!combinedCanvas || !canvas || !canvas.width || !canvas.height) return;
    const W=canvas.width, rowH=Math.max(54,Math.round(W*0.055));
    const headerH=Math.max(62,Math.round(W*0.065));
    const H=canvas.height+headerH+rowH*items.length;
    combinedCanvas.width=W; combinedCanvas.height=H;
    const ctx=combinedCanvas.getContext('2d');
    ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,W,H); ctx.drawImage(canvas,0,0);
    const pos=items.filter(x=>x.text==='Positive').length, inv=items.filter(x=>x.text==='Invalid').length;
    const summary=pos?`${items.length} Tests Detected · ${pos} Positive`:(inv?`${items.length} Tests Detected · ${inv} Invalid`:`${items.length} Tests Detected · All Negative`);
    ctx.fillStyle='#f8fafc'; ctx.font=`900 ${Math.max(22,Math.round(W*0.03))}px "Segoe UI",sans-serif`; ctx.textBaseline='middle'; ctx.fillText(summary,Math.round(W*0.035),canvas.height+headerH/2);
    items.forEach((item,i)=>{
      const y=canvas.height+headerH+i*rowH;
      ctx.strokeStyle='#334155'; ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
      const rad=rowH*0.28,cx=Math.round(W*0.055),cy=y+rowH/2;
      ctx.fillStyle='#334155';ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font=`900 ${Math.round(rad*1.1)}px "Segoe UI"`;ctx.fillText(String(i+1),cx,cy+1);
      ctx.textAlign='left';ctx.font=`800 ${Math.max(18,Math.round(W*0.024))}px "Segoe UI"`;ctx.fillStyle='#e2e8f0';ctx.fillText(`Card ${i+1}`,Math.round(W*0.1),cy);
      ctx.textAlign='right';ctx.font=`900 ${Math.max(20,Math.round(W*0.027))}px "Segoe UI"`;ctx.fillStyle=item.text==='Positive'?'#fca5a5':(item.text==='Negative'?'#86efac':'#fcd34d');ctx.fillText(item.text,Math.round(W*0.96),cy);
    });
    ctx.textAlign='left';
  }

  function setMultiResults(items) {
    lastMultiResults=items;
    const pos=items.filter(x=>x.text==='Positive').length, inv=items.filter(x=>x.text==='Invalid').length;
    lastResultText = pos ? 'Positive' : (inv ? 'Invalid' : 'Negative');
    resultEl.className='result ' + (pos?'positive':(inv?'invalid':'negative'));
    resultEl.textContent = pos ? `${items.length} Tests · ${pos} Positive` : (inv ? `${items.length} Tests · ${inv} Invalid` : `${items.length} Tests · All Negative`);
    if (resultSub) resultSub.textContent='Results are numbered on the image';
    renderMultiResultList(items);
    detailEl.innerHTML=items.map((x,i)=>`<b>Card ${i+1}: ${x.text}</b><br>Method: ${x.result.reason}<br>Center: x=${x.result.rect.cx.toFixed(0)}, y=${x.result.rect.cy.toFixed(0)}`).join('<hr>');
    if (debugText) debugText.innerHTML=items.map((x,i)=>`<b>Card ${i+1}</b><br>${x.result.debug||''}`).join('<hr><hr>');
    drawMultiAnnotations(items);
    renderMultiCombinedView(items);
    showDetectionStage(true);
    publishNtfyResult(`${items.length} tests: ${items.map((x,i)=>`${i+1}=${x.text}`).join(', ')}`);
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

  async function enableContinuousFocus() {
    if (!cameraStream) return false;
    const track = cameraStream.getVideoTracks && cameraStream.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== 'function') return false;
    try {
      const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
      const modes = caps && Array.isArray(caps.focusMode) ? caps.focusMode : [];
      if (modes.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        return true;
      }
      // Some browsers accept the constraint even when getCapabilities() does not expose it.
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (cameraStatus) cameraStatus.textContent = 'Live camera requires HTTPS and a supported browser.';
      showCameraStage();
      return;
    }

    captureBusy = false;
    if (captureBtn) captureBtn.disabled = false;

    // v31.54：每次開啟相機都視為「新的一次拍攝」。
    // 清除上一張照片的 QR lock / geometry / metadata，避免第二次拍照沿用舊 QR 而像只能拍一次。
    clearQrData();
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
      const focusOn = await enableContinuousFocus();
      if (cameraStatus) cameraStatus.textContent = qrLocked
        ? (focusOn ? 'QR locked · Continuous focus on · Ready to capture.' : 'QR already locked. You can capture the test.')
        : (focusOn ? 'Continuous focus on · Scanning QR code...' : 'Scanning QR code...');
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

  function renderCapturedPreview() {
    if (!combinedCanvas || !canvas || !canvas.width || !canvas.height) return;
    const maxW=1200;
    const scale=Math.min(1,maxW/canvas.width);
    combinedCanvas.width=Math.max(1,Math.round(canvas.width*scale));
    combinedCanvas.height=Math.max(1,Math.round(canvas.height*scale));
    const cctx=combinedCanvas.getContext('2d',{alpha:false});
    cctx.fillStyle='#0f172a';
    cctx.fillRect(0,0,combinedCanvas.width,combinedCanvas.height);
    cctx.drawImage(canvas,0,0,combinedCanvas.width,combinedCanvas.height);
    showDetectionStage(true);
  }

  async function captureFromCamera() {
    if (captureBusy || !cameraVideo || !cameraStream) return;
    captureBusy = true;
    if (captureBtn) captureBtn.disabled = true;
    if (cameraStatus) cameraStatus.textContent = 'Capturing current frame...';

    // v31.71: stop live scanning first and capture the frame at this tap.
    // Do NOT wait for a later requestVideoFrameCallback; that was the source of the visible jump.
    stopQrLoop();

    let vw = cameraVideo.videoWidth || 0;
    let vh = cameraVideo.videoHeight || 0;
    if (!vw || !vh || cameraVideo.readyState < 2) {
      const deadline = Date.now() + 1200;
      while (cameraStream && (cameraVideo.readyState < 2 || !cameraVideo.videoWidth || !cameraVideo.videoHeight) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      vw = cameraVideo.videoWidth || 0;
      vh = cameraVideo.videoHeight || 0;
    }

    if (!cameraStream || cameraVideo.readyState < 2 || !vw || !vh) {
      captureBusy = false;
      if (captureBtn) captureBtn.disabled = false;
      if (cameraStatus) cameraStatus.textContent = 'Camera frame not ready. Please tap Capture again.';
      if (cameraStream) scheduleLiveQrScan();
      return;
    }

    const shot = document.createElement('canvas');
    shot.width = vw; shot.height = vh;
    shot.getContext('2d',{alpha:false}).drawImage(cameraVideo,0,0,vw,vh);

    // Frozen captured image is the only coordinate system used after this point.
    // v31.77: display the captured frame BEFORE any QR/OpenCV work.
    lastImage = shot;
    stopCamera(true);
    resizeAndDrawImage(lastImage);
    renderCapturedPreview();
    if (cameraStatus) cameraStatus.textContent = 'Photo captured · Analyzing…';
    captureBusy = false;
    if (captureBtn) captureBtn.disabled = false;
    await yieldToUi();
    await analyze();
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
  // Larger metadata for the phone-sized three-column result view.
  const labelSize = Math.max(15, Math.round(baseW / 14));
  const valueSize = Math.max(20, Math.round(baseW / 10.5));
  let cy = y + pad;
  ctx.save();
  ctx.textBaseline = 'top';
  for (const [label, value] of rows) {
    if (cy > y + height - valueSize * 2) break;
    ctx.font = `700 ${labelSize}px "Segoe UI", sans-serif`;
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(label, x + pad, cy);
    cy += labelSize * 1.32;
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
    if (line) { ctx.fillText(line, x + pad, cy); cy += valueSize * 1.52; }
    ctx.strokeStyle = '#1E293B';
    ctx.beginPath(); ctx.moveTo(x + pad, cy - valueSize * .25); ctx.lineTo(x + width - pad, cy - valueSize * .25); ctx.stroke();
  }
  ctx.restore();
}

function renderCombinedDetectionView() {
  if (!combinedCanvas || !cropCanvas || !canvas || !cropCanvas.width || !cropCanvas.height) return;
  const W = cropCanvas.width, H = cropCanvas.height;
  const sideW = Math.max(170, Math.round(W * 1.04));
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
      qrCenter: lastQrGeometry && lastQrGeometry.center ? lastQrGeometry.center : null,
      qrPoints: lastQrGeometry && Array.isArray(lastQrGeometry.points) ? lastQrGeometry.points : []
    });
  }

  function resizeAndDrawImage(img) {
    // Preserve enough pixels for faint C/T lines, but accept Image, Canvas or Video-like sources.
    const srcW = img.naturalWidth || img.videoWidth || img.width || 0;
    const srcH = img.naturalHeight || img.videoHeight || img.height || 0;
    if (!srcW || !srcH) throw new Error('Image source has no dimensions');
    const maxW = 1600;
    const scale = Math.min(1, maxW / srcW);
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
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
      if (ct.tThreshold !== undefined) html += `C Strength: ${(ct.cStrength||0).toFixed(2)} / T Strength: ${(ct.tStrength||0).toFixed(2)}<br>` +
        `T Threshold (10% C): ${(ct.tThreshold||0).toFixed(2)} / T/C: ${((ct.tcRatio||0)*100).toFixed(1)}%<br>` +
        `T Gap: ${(ct.zone && Number.isFinite(ct.zone.ctGapMm) ? ct.zone.ctGapMm : 0).toFixed(2)} mm / Allowed: 3.0–6.0 mm<br>` +
        `T FWHM (observe only): ${Number.isFinite(ct.tFwhmMm) ? ct.tFwhmMm.toFixed(3) : '-'} mm / ${Number.isFinite(ct.tFwhmPx) ? ct.tFwhmPx.toFixed(2) : '-'} px<br>`;
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

    const ct = r && r.features && r.features.ctAnalysis ? r.features.ctAnalysis : null;
    const cLineUsable = !!(ct && ct.cPeak && ct.cPeak.detected);
    // v31.66：外框 quality gate 只作定位/debug，不再覆蓋 C/T 的醫材判讀結果。
    // 只要 QR/ROI 已完成且 C 線通過，就直接依 C/T 判 Positive/Negative；只有 C 不成立才 Invalid。
    const uiOk = !!(r.ok || debugSaysPass || cLineUsable);

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

  async function analyze() {
    if (!lastImage) { clearRoiOnlyView(); return; }
    resizeAndDrawImage(lastImage);
    lastMultiResults=[];
    renderMultiResultList([]);
    lastQrGeometry=null;

    const qrCodes=await detectAllQrCodesFromCanvas();
    if (!qrCodes.length) {
      lastResultText='Invalid';
      resultEl.className='result invalid'; resultEl.textContent='Invalid';
      if (resultSub) resultSub.textContent='QR not detected';
      detailEl.innerHTML='Failure reason: QR not detected on captured image.';
      if (debugText) debugText.innerHTML='Orientation gate: FAIL<br>Reason: QR not detected';
      showDetectionStage(false); return;
    }

    if (qrCodes[0].raw) updateQrDisplay(parseQrData(qrCodes[0].raw),true);
    lastQrGeometry=qrCodes[0].geometry;

    if (!cvReady) {
      resultEl.className='result neutral'; lastResultText='Invalid'; resultEl.textContent=''; detailEl.textContent=''; return;
    }

    try {
      // SINGLE CARD: exact v31.70 full-image detection path. Multi-card isolation is not applied.
      if (qrCodes.length === 1) {
        const r=window.AsapOuterDetector.detectOuterFrame(canvas,cropCanvas,Object.assign({},DEFAULT_OPTIONS,{
          qrRequired:true,
          qrCenter:qrCodes[0].geometry.center,
          qrPoints:Array.isArray(qrCodes[0].geometry.points)?qrCodes[0].geometry.points:[],
          qrGeometryBackup:true
        }));
        setResult(r);
        return;
      }

      // MULTI CARD: same detector.js, but each QR is isolated before calling it.
      const original=cloneCanvas(canvas);
      const detected=[];
      for (const q of qrCodes) {
        const local=makeLocalDetectionCanvas(original,q,qrCodes);
        const tmpCrop=document.createElement('canvas');
        const opts=Object.assign({},DEFAULT_OPTIONS,{
          qrRequired:true,
          qrCenter:local.geometry.center,
          qrPoints:Array.isArray(local.geometry.points)?local.geometry.points:[],
          qrGeometryBackup:true
        });
        let r=window.AsapOuterDetector.detectOuterFrame(local.canvas,tmpCrop,opts);
        r=translateDetectionResult(r,local.offsetX,local.offsetY);
        if (!r || !r.rect) continue;
        const debugSaysPass=!!(r.debug&&r.debug.indexOf('Final Gate: outer=PASS / trustedFeature=PASS')>=0);
        const ok=!!(r.ok||debugSaysPass);
        const copy=document.createElement('canvas');
        copy.width=tmpCrop.width||1; copy.height=tmpCrop.height||1;
        if (tmpCrop.width&&tmpCrop.height) copy.getContext('2d').drawImage(tmpCrop,0,0);
        detected.push({qr:q,result:r,crop:copy,text:ok?getCtResultText(r):'Invalid'});
      }

      if (!detected.length) throw new Error('No cassette candidate matched detected QR code(s).');
      const sorted=sortCardsSpatially(detected);
      canvas.width=original.width; canvas.height=original.height;
      canvas.getContext('2d',{alpha:false}).drawImage(original,0,0);

      if (sorted.length===1) {
        const one=sorted[0];
        lastQrGeometry=one.qr.geometry;
        cropCanvas.width=one.crop.width; cropCanvas.height=one.crop.height;
        cropCanvas.getContext('2d').drawImage(one.crop,0,0);
        setResult(one.result);
      } else {
        setMultiResults(sorted);
      }
    } catch (ex) {
      console.error(ex);
      resultEl.className='result invalid'; lastResultText='Invalid'; resultEl.textContent='Invalid';
      detailEl.innerHTML='<b>Exception</b><br>'+(ex&&ex.message?ex.message:String(ex));
      clearRoiOnlyView();
      if (combinedCanvas) { const cctx=combinedCanvas.getContext('2d'); cctx.clearRect(0,0,combinedCanvas.width,combinedCanvas.height); }
      showDetectionStage(false); updateResultSubtitle();
      if (debugText) debugText.innerHTML='<b>Exception</b><br>'+(ex&&ex.stack?ex.stack:(ex&&ex.message?ex.message:String(ex)));
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

  async function reverseGeocodeCurrentGps(latitude, longitude, coordinateText) {
    const token = ++gpsLookupToken;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = setTimeout(() => { if (controller) controller.abort(); }, 8000);
    try {
      const query = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        localityLanguage: 'zh-TW'
      });
      const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${query.toString()}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (token !== gpsLookupToken) return;

      // Keep GPS display at city/province level; do not show district (e.g. 大安區).
      // BigDataCloud's principalSubdivision is 臺北市 for Taipei, while locality may be 大安區.
      const parts = [
        data.principalSubdivision || data.city || '',
        data.countryName || data.countryCode || ''
      ].map(v => String(v || '').trim()).filter(Boolean);
      const unique = parts.filter((v, i, list) => list.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i);
      if (unique.length) setRegionText(unique.join(', '), true);
      else setRegionText(coordinateText, true);
    } catch (error) {
      if (token === gpsLookupToken) setRegionText(coordinateText, true);
      console.warn('Reverse geocoding failed', error);
    } finally {
      clearTimeout(timeoutId);
    }
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
        const coordinateText = `${lat}, ${lng}`;
        // Show coordinates immediately, then replace them with locality/country.
        setRegionText(coordinateText, true);
        reverseGeocodeCurrentGps(pos.coords.latitude, pos.coords.longitude, coordinateText);
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
      // Manual input wins over an in-flight automatic locality lookup.
      gpsLookupToken++;
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
  if (shareAnalysisBtn) shareAnalysisBtn.addEventListener('click', shareAnalysisImage);
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
