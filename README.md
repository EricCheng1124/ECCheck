# ASAP Check v31.61 — CT Up 0.20Q + Per-QR Fixed CT Geometry

This build keeps the v31.59 Per-QR fixed CT geometry and moves the complete CT analysis region 0.20Q toward the QR code.

## v31.61 geometry
- CT ROI top: QR bottom + 0.65Q
- CT ROI bottom: QR bottom + 1.41Q
- C expected position: QR bottom + 0.77Q
- T expected position: QR bottom + 1.07Q
- C search band: QR bottom + 0.77Q to +1.01Q
- Width/height and QR-based scale logic otherwise unchanged.
- Each detected card uses its own QR center and QR size.
- Window/slot, shadows, peaks, and neighboring cards cannot move the CT zone.
- UI, detector VERSION, stylesheet/script cache-busting strings updated to v31.61.
