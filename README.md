# ASAP Check v31.64 — QR mm Geometry

本版改用實體尺寸作為 C/T 定位基準，不再使用經驗 Q 比例猜測 C/T 位置。

## 已知實體尺寸
- 卡匣外框：70 x 20 mm
- QR Code：約 14 x 14 mm
- C 線：由 QR 左下 finder square 的下緣往卡匣下方 11 mm
- C/T 有效範圍：9 mm 內

## v31.64 定位邏輯
- QR 四角決定方向、中心與比例尺。
- 1 mm = QR side / 14。
- C 幾何位置 = QR bottom + 11 mm。
- C 搜尋只允許約 ±0.8 mm 容差。
- T 不再假設固定 C-T 距離；只在 C 下方約 1.2~9.0 mm 的實體區域內搜尋。
- 影像中的陰影、槽邊或其他 peak 不得移動 C 的幾何位置。
- 卡匣 QR template 改用 70/14 = 5.0Q、20/14 = 1.42857Q 的實體比例。
- 卡匣外框主要供顯示與透視校正；真正 C/T 定位以 QR mm 座標為主。
