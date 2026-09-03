# ASAP Check v31.68 — T Gap Lock 0.8–6 mm

定位/判讀策略：
- QR Code 只負責卡匣方向。
- 卡匣外框維持 70 x 20 mm aspect-lock / edge-snap。
- C/T ROI 維持 30 / 10 / 30：中央 10 mm 為唯一試紙分析區。
- C 線先在中央 ROI 上半部找水平紅/粉紅連續線。
- T 線只允許在「實際 C 線下方 0.8 ~ 6.0 mm」範圍搜尋。
- 超過 C 下方 6 mm 的槽邊、陰影、反光一律不能判為 T。
- 小於 0.8 mm 視為 C 線本身厚度/邊緣，不得重複判為 T。
- 最終：C+T = Positive；只有 C = Negative；無 C = Invalid。

## v31.68 changes
- Version badge / detector version / cache key 更新為 v31.68。
- 新增 T_MIN_GAP_MM = 0.8。
- 新增 T_MAX_GAP_MM = 6.0。
- T 搜尋區由實際偵測到的 C 線動態建立。
- T 最終判定再次檢查 C→T 實際距離必須落在 0.8~6.0 mm。
- Debug zone 保留 tMinGapMm / tMaxGapMm / ctGapMm。
