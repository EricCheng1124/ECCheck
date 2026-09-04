# ASAP Check v31.77 Base70 Multi-Card UI-First QR

Based on v31.76, with QR scanning changed to keep mobile UI responsive.

- Captured photo is displayed immediately before QR/OpenCV analysis.
- Removed exhaustive sliding-window + six-pass masked QR scan.
- Uses native BarcodeDetector first, then a limited set of overlapping 2/3/4/5-column and 2-row jsQR tiles.
- QR work yields back to the browser every few tiles so iPhone/Safari can repaint.
- Keeps v31.75 QR Geometry Backup.
- Keeps weak-T analysis, C-relative 3–6 mm search, T/C 10%, and FWHM gate unchanged.
- Multi-card maximum remains 8.
