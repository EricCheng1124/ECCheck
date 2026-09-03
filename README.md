# ASAP Check v31.71 — Base70 Multi-Card

## 原則
此版直接以使用者提供的穩定 v31.70 為基礎延伸多卡。
**單一卡匣的 detector 判讀邏輯不修改**；detector.js 僅更新版本字串。

## 單卡判定（沿用 v31.70）
- 卡匣：70 × 20 mm。
- QR Code：主要用於方向判斷。
- CT 分析區：卡匣上緣 30 mm 到 40 mm，中間固定 10 mm。
- T 只允許位於實際 C 線下方 0.8–6.0 mm。
- C 有效後，在合法 T 範圍逐列搜尋最強 band。
- T 強度 >= C 強度的 10% → Positive。
- T 強度 < C 強度的 10% → Negative。
- 找不到有效 C → Invalid。

## v31.71 多卡延伸
- 最多 8 張卡。
- 相同 QR 內容可重複；以 QR 空間位置區分卡匣。
- 單卡完全沿用 v31.70 full-image detection。
- 多卡才啟用每 QR 窄型獨立 ROI，避免鄰卡進入 detector。
- 相鄰 QR 以中心中點限制 ROI ownership。
- 每張卡仍呼叫同一個 v31.70 detectOuterFrame / C/T 核心。
- Capture 按下時立即凍結當下 video frame，不等待下一幀。
- 拍照後只使用 frozen image 的 QR 座標，不把 Live Preview QR 座標映射到結果。
