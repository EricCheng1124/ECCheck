# ASAP Check v31.62 — QR Direct Cassette Geometry

This build keeps the v31.59 Per-QR fixed CT geometry and moves the complete CT analysis region 0.20Q toward the QR code.

## v31.62 geometry
- CT ROI top: QR bottom + 0.65Q
- CT ROI bottom: QR bottom + 1.41Q
- C expected position: QR bottom + 0.77Q
- T expected position: QR bottom + 1.07Q
- C search band: QR bottom + 0.77Q to +1.01Q
- Width/height and QR-based scale logic otherwise unchanged.
- Each detected card uses its own QR center and QR size.
- Window/slot, shadows, peaks, and neighboring cards cannot move the CT zone.
- QR 四角完整時，整支卡匣外框直接由 QR 幾何建立，不再讓白色 contour 競選最終外框。
- QR 模式下，標準化 QR 座標固定為 cassette local coordinate，CT ROI 不再受原圖卡匣邊緣抓取誤差影響。
- contour 僅在 QR 幾何不可用時 fallback。
- UI / detector VERSION / cache-busting 更新為 v31.62。
