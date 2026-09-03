# ASAP Check v31.66 — Edge Snap + CT Decoupled

定位策略：
- QR Code 只負責卡匣方向。
- 先由 contour 找 70 x 20 mm 卡匣候選，再用原圖 RGB 邊界梯度把 Top / Bottom / Left / Right 四邊吸附到真正卡匣外緣。
- 不用 QR 14 mm 去硬推整支 70 mm 外框，避免尺寸誤差被放大。
- C/T ROI 維持 30 / 10 / 30 幾何：卡匣上 30 mm、中央 10 mm 分析區、下 30 mm。
- 外框 quality gate 與 C/T 最終結果解耦：C 有效 + T 有效 = Positive；C 有效 + T 無效 = Negative；C 無效才 Invalid。
- Debug 新增 Edge Snap 狀態與 snap 前後 L/W 尺寸。
