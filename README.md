# ASAP Check v31.72 — Multi-Card + True Live QR Lock

基於 v31.70 單卡判讀核心，不改動已驗證的 C/T 演算法。

## v31.72 變更

- **真正沿用 Live Lock**：即時預覽已鎖定的 QR，在拍照後會把座標等比例換算到原始高解析照片，不重新用另一個 QR 結果取代。
- 多卡拍照後仍會搜尋 QR #2、#3…，但 **Card 1 的已鎖定 QR 為 authoritative anchor**。
- 支援 `BarcodeDetector` 與 `jsQR` 兩種 Live Lock 座標來源。
- 修正「QR 已 Locked，按 Capture 後框又跳動／重新出現」的問題。
- 一張照片最多辨識 10 個 QR Code / 10 張卡匣。
- 優先使用 BarcodeDetector 一次取得多個 QR；不支援時以 jsQR 分區掃描 + 已找到 QR 遮罩重掃。
- 新增 3×2、2×3、3×3 搜尋網格，提高多卡照片 QR 命中率。
- 每個 QR 各自建立局部卡匣 ROI，獨立執行 v31.70 的判讀核心。
- 多卡依空間位置排序並編號 Card 1, Card 2...。
- 每張卡維持：中央 10 mm CT 區、C 有效、T 僅可位於 C 下方 0.8–6 mm、T/C >= 10% 判 Positive。

注意：若 QR 太小、模糊、反光或遮擋，仍可能無法解碼；介面會以 Detected Tests 數量顯示實際抓到的卡數。
