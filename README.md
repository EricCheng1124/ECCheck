# ASAP Check v31.73 — Base70 Multi-Card + FWHM Observe

## 本版原則
- 直接沿用 v31.71 Base70 Multi-Card 架構，不改 QR、多卡分離、外框與拍照流程。
- 卡匣：70 × 20 mm。
- CT 分析區：卡匣上緣 30 mm 到 40 mm，中間固定 10 mm。
- C 線仍由原本方法定位。
- **T 只允許位於實際 C 線下方 5.0–6.0 mm。**
- **T 強度 >= C 強度的 10% → Positive；低於 10% → Negative。**
- 找不到有效 C → Invalid。

## FWHM 半高全寬
- 新增 T candidate 的 FWHM（Full Width at Half Maximum）量測。
- FWHM 使用局部肩部背景估計後計算，輸出 mm 與 px。
- **本版 FWHM 為 Observe Only：只顯示於 Advanced Info / Debug，不參與 Positive / Negative 判定。**
- 目的：先收集真正 Positive T 線與陰影假 peak 的 FWHM 分布，再決定正式門檻。

## 建議測試
- 同一批已知 POS / NEG 照片重複測試。
- 記錄每張 Card 的 T/C、T Gap(mm)、T FWHM(mm)。
- 特別觀察誤判 NEG 卡的 FWHM 是否明顯大於真正 T 線。


## v31.73
- T 搜尋範圍：實際 C 線下方 3.0～6.0 mm。
- T/C >= 10% 規則保留。
- FWHM 正式參與 T 判定，暫用放寬範圍 0.15～1.50 mm。
- FWHM 過寬視為陰影/平台；過窄視為尖峰雜訊。
- QR、多卡 ROI、外框與拍照流程維持 v31.72 架構。
