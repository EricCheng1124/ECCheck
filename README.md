# ASAP Check v31.79 — QR 4-Direction Guided OpenCV Outer

- Based on v31.78 QR-Guided OpenCV Outer.
- Fixes cassette direction errors caused by treating QR corner ordering as physical cassette TOP.
- QR is used as scale/axis reference only; Window/slot and S well are NOT required for outer-frame detection.
- Builds four cassette hypotheses from QR (±u, ±v).
- Scores each 70×20 mm hypothesis against the real image border/brightness support and chooses the strongest direction.
- OpenCV contour candidates still use 70×20 mm / QR 14×14 mm geometry validation.
- Existing UI-first capture, multi-card, QR backup, Weak-T, T gap 3–6 mm, T/C 10%, and FWHM logic are preserved.
- Debug shows `QR Direction Hypothesis` and `QR Template Image Support`.
