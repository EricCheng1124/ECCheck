# ASAP Check v31.76 Base70 Multi-Card Dense QR

Based on v31.75. QR/outer/CT architecture is preserved.

Changes:
- Multi-card QR discovery now uses dense overlapping grid + sliding-window scans.
- Added 4/5-column passes for side-by-side cassettes.
- Small QR windows may be upscaled for better jsQR finder sampling.
- Known QR codes are masked and the remaining image is re-scanned up to 6 passes.
- Duplicate identity remains geometry-based, so identical QR payloads are allowed.
- QR Geometry Backup from v31.75 remains enabled.
- Weak-T 3-6 mm / T-C 10% / FWHM logic remains unchanged from v31.75.
