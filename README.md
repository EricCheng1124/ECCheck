# ASAP Check v31.59 — CT Up 0.12Q + Per-QR Fixed CT Geometry

- Based directly on v31.58.
- Each card's CT zone remains anchored to that card's own normalized QR center and QR size.
- Compared with v31.58, the entire CT ROI is moved another 0.12Q toward the QR code.
- CT ROI width and height are unchanged.
- C/T spacing is unchanged.
- Multi-card Per-QR geometry and QR reset behavior are unchanged.
- Window/slot, shadows, peaks, and neighboring cards cannot move the CT zone.

## v31.59 geometry
- C expected position: QR bottom + 0.97Q
- T expected position: QR bottom + 1.27Q
- CT ROI: QR bottom + 0.85Q to +1.61Q
- C search band: QR bottom + 0.97Q to +1.21Q
- UI, detector VERSION, and cache-busting query strings updated to v31.59.
