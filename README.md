# ASAP Check v31.53 — Negative Guard + Faster Multi-Card

Build: **v31.53 / 2026-09-02**

Changes:
- Tightened T-line validation so gray/dark slot shadows cannot pass without measurable pink/red evidence.
- Slightly raised the relative T threshold and shape quality gate to reduce false positive calls on true negative cards.
- Reworked multi-card QR discovery from dozens of full-resolution jsQR passes to a small adaptive set of downscaled regions.
- Each QR/card now runs cassette detection on a QR-centered local ROI instead of re-processing the full photo for every card.
- Single-card behavior and QR-anchored C/T geometry remain compatible with v31.50.
