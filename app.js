(function(){
  const cameraInput=document.getElementById('cameraInput');
  const galleryInput=document.getElementById('galleryInput');
  const sourceCanvas=document.getElementById('sourceCanvas');
  const cropCanvas=document.getElementById('cropCanvas');
  const resultEl=document.getElementById('result');
  const detailEl=document.getElementById('detail');
  const vThreshold=document.getElementById('vThreshold');
  const sThreshold=document.getElementById('sThreshold');
  const minAreaRatio=document.getElementById('minAreaRatio');
  const vText=document.getElementById('vText');
  const sText=document.getElementById('sText');
  const areaText=document.getElementById('areaText');
  let lastImage=null;
  function opt(){return{vThreshold:Number(vThreshold.value),sThreshold:Number(sThreshold.value),minAreaRatio:Number(minAreaRatio.value)}}
  function updateText(){vText.textContent=vThreshold.value;sText.textContent=sThreshold.value;areaText.textContent=Number(minAreaRatio.value).toFixed(1)}
  function setResult(det){
    resultEl.className='result '+(det.success?'ok':'fail');
    resultEl.textContent=det.success?'外框辨識成功':'外框辨識失敗';
    if(det.success){
      const r=det.rect,b=det.best;
      detailEl.innerHTML=`版本：v13-outer-frame-only<br>模式：只找整支快篩卡匣外框，不做 C/T 判讀<br>外框：x=${r.x}, y=${r.y}, w=${r.w}, h=${r.h}<br>候選：area=${b.area}, box=${b.w}x${b.h}, aspect=${(Math.max(b.w,b.h)/Math.min(b.w,b.h)).toFixed(2)}, score=${b.score.toFixed(1)}<br>藍框：其他候選；綠框：選中的快篩外框`; 
    }else{
      detailEl.innerHTML=`版本：v13-outer-frame-only<br>失敗原因：${det.reason}<br>可先降低「白色亮度門檻 V」或提高「低飽和門檻 S」。`;
    }
  }
  function analyze(){
    if(!lastImage)return;
    AsapOuterDetector.drawImageContain(lastImage,sourceCanvas,900);
    const det=AsapOuterDetector.detectCassette(sourceCanvas,opt());
    AsapOuterDetector.drawDetection(sourceCanvas,det);
    if(det.success){AsapOuterDetector.cropToCanvas(sourceCanvas,cropCanvas,det.rect)}
    else{cropCanvas.width=1;cropCanvas.height=1;}
    setResult(det);
  }
  function loadFile(file){
    if(!file)return;
    const img=new Image();
    img.onload=function(){lastImage=img;analyze();URL.revokeObjectURL(img.src)};
    img.onerror=function(){resultEl.className='result fail';resultEl.textContent='讀圖失敗';detailEl.textContent='請重新選照片'};
    img.src=URL.createObjectURL(file);
  }
  cameraInput.addEventListener('change',e=>loadFile(e.target.files[0]));
  galleryInput.addEventListener('change',e=>loadFile(e.target.files[0]));
  [vThreshold,sThreshold,minAreaRatio].forEach(el=>el.addEventListener('input',()=>{updateText();analyze()}));
  updateText();
})();
