# ASAP Check v31.75 — Multi-Card QR Ownership / Voronoi Lock

## v31.75 變更

- 多卡仍保留 v31.74 的 Multi-QR、Hard Freeze 與相同 QR 內容依實體位置區分。
- 每個 QR 建立自己的卡匣 ownership corridor；卡匣寬依 20 mm / QR 14 mm 固定為約 1.4286Q，只保留 +6% 容差。
- 對同一排的相鄰 QR，以兩個 QR 中心的垂直平分線切割 ownership（Voronoi half-plane）。
- 一張卡的分析遮罩不能跨過相鄰 QR 的中線，因此卡匣貼在一起時不會吃到隔壁卡。
- 不對上下不同排 QR 做 Voronoi 截斷，避免 2x2、3x3 時把上排卡匣長邊切掉。
- C/T 判讀維持既有穩定規則：中央 10 mm、T 在 C 下方 0.8–6 mm、T/C >= 10%。
- 拍照後 Live QR 持續 Hard Freeze，不允許結果頁重新跳動。
- 版本號更新為 v31.75。
