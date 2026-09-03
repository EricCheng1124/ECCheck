# ASAP Check v31.70 — T/C 10% Primary

## 判定規則
- 卡匣：70 × 20 mm。
- QR Code：主要用於方向判斷。
- CT 分析區：卡匣上緣 30 mm 到 40 mm，中間固定 10 mm。
- T 只允許位於實際 C 線下方 0.8–6.0 mm。
- C 有效後，在合法 T 範圍逐列搜尋最強 band。
- **T 強度 >= C 強度的 10% → Positive。**
- **T 強度 < C 強度的 10% → Negative。**
- 找不到有效 C → Invalid。

## v31.70 變更
- 修正 v31.69 的判斷順序：弱 T 不再需要先通過固定 `red-continuity/color` hard threshold 才有資格進行 T/C 10% 判定。
- T 候選改由 C 下方 0.8–6 mm 內的 band strength 主導搜尋。
- 水平/粉紅證據只保留為非常寬鬆的防陰影輔助條件。
- 更新頁面版本、detector 版本與 cache key 至 v31.70。
