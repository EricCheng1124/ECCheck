# ASAP Check v31.56 — Per-QR Fixed CT Geometry

- Each card's CT zone is anchored to that card's actual QR center and QR size after cassette normalization.
- CT zone no longer derives QR position from cassette height, preventing multi-card ROI drift.
- CT zone moved farther from QR and remains compact.
- Window/slot, shadows, C/T peaks, and neighboring cards cannot move the CT zone.
- Multi-card pipeline remains independent per detected QR.
