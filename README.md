# ASAP Check v31.78 QR-Guided OpenCV Outer

此版基於 v31.77，重整大外框判定。

- QR = 14 x 14 mm，卡匣 = 70 x 20 mm。
- QR 永遠位於卡匣上方，直接決定卡匣方向。
- OpenCV contour 必須同時符合 QR 尺度、70/20=3.5 長寬比、方向與 QR 相對位置。
- 預期：卡匣長邊約 5.0Q、短邊約 1.43Q。
- Window/slot 與 S well 不再參與大外框判定，也不再畫在 Debug 圖上。
- 若沒有 OpenCV contour 通過完整 QR 幾何門檻，才使用 QR 70x20 幾何 Backup。
- Edge Snap 後會再次檢查 QR 幾何，錯誤吸附會被拒絕。
- C/T 保留 v31.77 Weak-T / T Gap 3~6 mm / T/C 10% / FWHM。
- 拍照仍採 UI-First，先顯示照片再進行分析。
