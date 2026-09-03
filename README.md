# ASAP Check v31.73 — Multi-Card + Hard QR Freeze

## v31.73 變更

- 拍下 Capture 的瞬間立即停止 Live QR timer，並用 session token 廢止所有尚未完成的 BarcodeDetector callback。
- 拍照後 QR lock/UI 不再被任何 live callback 改寫，避免結果畫面 QR 一直跳出或重新鎖定。
- 多卡 jsQR 改成「實體位置」辨識：相同 QR 內容也不會合併，只依 QR 中心座標去重。
- 除原本網格外，新增依已知 QR 尺寸建立的小視窗滑動掃描；相鄰 2~10 張卡時，每個小視窗盡量只包含一個 QR，解決 jsQR 每次只回傳一個 QR 的限制。
- 每個找到的 QR 獨立建立卡匣 ROI，沿用 v31.70/v31.68 已穩定的 C/T 判讀：中央 10 mm、T 在 C 下 0.8~6 mm、T/C >= 10%。
- 版本號已更新為 v31.73。
