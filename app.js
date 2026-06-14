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

  const minAreaRatio = document.getElementById('minAreaRatio');
  const ratioMin = document.getElementById('ratioMin');
  const ratioMax = document.getElementById('ratioMax');
  const areaText = document.getElementById('areaText');
  const ratioMinText = document.getElementById('ratioMinText');
  const ratioMaxText = document.getElementById('ratioMaxText');

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

  window.__opencvLoaded = function () {
    if (window.cv && cv.onRuntimeInitialized !== undefined) {
      cv.onRuntimeInitialized = onCvReady;
    } else {
      onCvReady();
    }
  };

  function onCvReady() {
    cvReady = true;
    cvStatus.textContent = 'OpenCV.js 已載入，可開始外框＋Window/S Well辨識。';
    if (lastImage) analyze();
  }

  function updateTexts() {
    areaText.textContent = Number(minAreaRatio.value).toFixed(1);
    ratioMinText.textContent = Number(ratioMin.value).toFixed(1);
    ratioMaxText.textContent = Number(ratioMax.value).toFixed(1);
  }

  function getOptions() {
    return {
      minAreaRatio: Number(minAreaRatio.value) / 100,
      ratioMin: Number(ratioMin.value),
      ratioMax: Number(ratioMax.value)
    };
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


  function formatFeatures(f) {
    if (!f) return '<br>內部特徵：未執行';
    let html = '<hr>';
    html += `判讀窗候選：${f.windowCandidates}，來源：${f.windowSource || '-'}<br>`;
    html += `S孔候選：${f.sampleCandidates}，來源：${f.sampleSource || '-'}<br>`;
    html += `方向：${f.orientation}<br>`;
    html += `180度校正：${f.orientationCorrected ? '有' : '無'}<br>`;
    if (f.window) {
      html += `判讀窗：x=${f.window.x.toFixed(0)}, y=${f.window.y.toFixed(0)}, w=${f.window.w.toFixed(0)}, h=${f.window.h.toFixed(0)}<br>`;
    } else {
      html += '判讀窗：未找到<br>';
    }
    if (f.sample) {
      html += `S Well：x=${f.sample.cx.toFixed(0)}, y=${f.sample.cy.toFixed(0)}, rx=${f.sample.rx.toFixed(0)}, ry=${f.sample.ry.toFixed(0)}<br>`;
    } else {
      html += 'S Well：未找到<br>';
    }
    return html;
  }

  function setResult(r) {
    resultEl.className = 'result';
    if (r.ok) {
      resultEl.classList.add('ok');
      resultEl.textContent = '外框＋Window安全/S Well辨識成功';
      detailEl.innerHTML =
        `版本：${r.version}<br>` +
        `方法：${r.reason}<br>` +
        `候選數：${r.candidates}<br>` +
        `面積比例：${(r.areaRatio * 100).toFixed(2)}%<br>` +
        `長寬比：${r.ratio.toFixed(2)}<br>` +
        `填充率：${r.fill.toFixed(2)}<br>` +
        `中心：x=${r.rect.cx.toFixed(0)}, y=${r.rect.cy.toFixed(0)}<br>` +
        `尺寸：w=${r.rect.w.toFixed(0)}, h=${r.rect.h.toFixed(0)}, angle=${r.rect.angle.toFixed(1)}°<br>` +
        formatFeatures(r.features);
    } else {
      resultEl.classList.add('invalid');
      resultEl.textContent = '外框辨識失敗';
      detailEl.innerHTML =
        `版本：${r.version}<br>` +
        `失敗原因：${r.reason}<br>` +
        `建議：降低「最小面積比例」，或把「長寬比下限」調到 1.8。`;
    }
  }

  function analyze() {
    if (!lastImage) return;
    resizeAndDrawImage(lastImage);
    if (!cvReady) {
      resultEl.className = 'result neutral';
      resultEl.textContent = 'OpenCV 載入中';
      detailEl.textContent = '請等 OpenCV.js 載入完成。';
      return;
    }
    const r = window.AsapOuterDetector.detectOuterFrame(canvas, cropCanvas, getOptions());
    setResult(r);
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
  [minAreaRatio, ratioMin, ratioMax].forEach(el => el.addEventListener('input', () => { updateTexts(); analyze(); }));

  updateTexts();
  if (sessionStorage.getItem('asap_access') === '1') {
    lockPanel.classList.add('hidden');
    mainPanel.classList.remove('hidden');
  }
})();
