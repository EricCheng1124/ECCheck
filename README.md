# ASAP Check v31.65 — Outer 30/10/30 Geometry

定位策略：
- 卡匣實體外框 70 x 20 mm 為主座標系。
- QR Code 只負責確認卡匣方向（QR 端為上）。
- 優先由影像 contour 找真正卡匣四邊，比例以 70:20 = 3.5:1 做幾何加權。
- 只有找不到可信真實外框時才使用 QR template fallback。
- C/T 試紙分析區固定為：上邊緣往下 30 mm 到 40 mm，也就是中央 10 mm。
- CT zone 不再由 QR 尺寸、QR 14 mm、11 mm offset 或影像 peak 移動。
- C 搜尋在中央 10 mm 的上半部，T 搜尋於下方，並保留紅色連續性與 C/T 最小間距判斷。
