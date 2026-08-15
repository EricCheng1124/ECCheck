# ASAP Check v31.21 Live QR

Based on v31.20 detector logic.

Added:
- Live rear-camera preview using `getUserMedia()`.
- Continuous QR scanning while the camera preview is open.
- QR data is locked after detection so the values remain stable during capture.
- `Rescan QR` clears the lock and scans for another code.
- `Capture & Detect` captures the current camera frame and runs the existing cassette / C-T detection.
- QR Raw Data is always shown when detected.
- Structured QR data can parse ITEM / LOT / EXP / PN from JSON or `KEY=VALUE` text.
- Gallery upload remains available as a fallback.

Example QR content:
`LOT=AS26081501;ITEM=COVID-19;EXP=2027-08-15;PN=ASAP-COV01`

Important: live camera access normally requires HTTPS (or localhost during PC development).
