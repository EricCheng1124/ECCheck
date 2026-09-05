# ASAP Check v31.80

## Changes
- Multi-card: true QR Voronoi ownership. Each QR/card is isolated at the midpoint to neighboring QR centers before OpenCV outer-frame detection.
- Single-card: keeps QR-guided OpenCV outer detection.
- Internal positioning: Window/slot and S-well are retired as positioning gates.
- After 70x20 mm perspective warp, CT uses a fixed physical ROI: cassette 30~40 mm band, centered on cassette.
- C is detected inside the fixed CT band; T is searched 3~6 mm below C.
- Keeps Weak-T, T/C 10%, and FWHM logic.

Goal: outer frame from QR+OpenCV; internal CT from physical cassette coordinates, not re-detected slot geometry.
