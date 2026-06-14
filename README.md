# ASAP Check v30.2

版本：v30.2-dual-orientation-roi

本版重點：

- 保留 v29.3 外框判斷邏輯
- 移除 ROI Only 黑底圖，避免干擾判斷
- 裁切後卡匣只畫外框、Window、S Well
- Window / S Well 改成比例 ROI 搜尋
- 同時評估兩種方向：
  - normal：Window 上、S Well 下
  - inverted：S Well 上、Window 下
- 只有 inverted 模板分數較高時才旋轉 180 度
- Debug 新增 ROI Template 分數
