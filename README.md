# ASAP Check v31.75 Base70 Multi-Card QR Backup

基於 v31.74 Weak-T Peak。

- 保留多卡 QR 隔離、70 x 20 mm 卡匣、弱 T Peak、T/C 10%、T 搜尋 3.0–6.0 mm、FWHM gate。
- 新增 QR Geometry Backup：當 QR 已成功但白色外框 contour 最終沒有候選時，直接依 QR 14 x 14 mm 與卡匣 70 x 20 mm 的固定幾何建立 ROI，再做 perspective warp 與 C/T 分析。
- 有正常外框候選時仍優先使用原本 contour，不會改變正常路徑。
- ntfy 加入 8 秒同結果/同 QR 去重，避免一次分析重複推播。
- Debug 顯示 QR Geometry Backup: USED / not needed。
