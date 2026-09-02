# ASAP Check v31.58 — CT Up 0.12Q + Per-QR Fixed CT Geometry

- Each card's CT zone is anchored to that card's actual QR center and QR size after cassette normalization.
- CT zone no longer derives QR position from cassette height, preventing multi-card ROI drift.
- CT zone moved farther from QR and remains compact.
- Window/slot, shadows, C/T peaks, and neighboring cards cannot move the CT zone.
- Multi-card pipeline remains independent per detected QR.


## v31.58
- CT zone is moved 0.12Q toward the QR code compared with v31.57.
- C/T ROI width and height are unchanged.
- Per-QR fixed geometry and multi-card logic are unchanged.
- UI and detector version labels updated to v31.58.
