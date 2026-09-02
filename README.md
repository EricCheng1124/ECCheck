# ASAP Check v31.55 — Compact CT ROI + Fixed C/T Bands

Build: **v31.55 / 2026-09-02**

## Changes from v31.54

- CT analysis ROI is narrower, shorter, and shifted farther away from the QR code.
- ROI width is limited to the center test strip to exclude plastic slot side-wall shadows.
- C search band is fixed near ~1.32Q below QR bottom.
- T search band follows C by ~0.33Q with a narrow ±0.10Q tolerance.
- Keeps Negative Guard, fast multi-card detection, and per-capture QR reset.

Goal: prevent cassette-slot shadows from being selected as C/T peaks while keeping clear positive and negative cards separable.
