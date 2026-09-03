# ASAP Check v31.74 — Multi-Card QR Isolation + Hard Freeze

## v31.74 變更

- 多卡 QR：加入 OpenCV QR finder-pattern 候選搜尋，再對每個小區域個別用 jsQR 解碼；改善 3~4 張相鄰、相同 QR 內容時只抓到部分卡片的問題。
- QR 去重只依實體中心位置，不依 QR 文字內容。
- Live QR lock 拍照後只當「搜尋提示」；最終座標以拍下來的影像重新確認，避免 preview 座標因拍攝瞬間位移而偏掉。
- Capture 後維持 Hard Freeze：停止 timer、作廢既有 callback、結果頁不允許 Live QR 再改 UI，因此不會反覆跳出 QR lock。
- 每張卡的分析 ROI 改成依 QR 方向建立「窄型 70x20 mm 卡匣走廊」，並遮掉走廊外的鄰近卡；不再使用原本約 11Q 的巨大正方形 crop，避免相鄰卡互相搶外框。
- C/T 判讀核心保持不變：中央 10 mm、T 僅限 C 下方 0.8~6 mm、T/C >= 10%。
- 版本號更新為 v31.74。
