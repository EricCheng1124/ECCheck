# ASAP Check v31.22 Compact Live QR

Compact mobile reader UI based on detector v31.20.

- Live rear-camera QR scanning.
- QR automatically fills Test Item / LOT / EXP / PN.
- Main screen keeps QR info to two fixed lines.
- Camera preview and Detection Image share the same stage to reduce scrolling.
- Detection result is kept compact on one primary line plus one small context line.
- Raw QR, PN, GPS and detector/debug details are moved into Advanced Info.
- QR failure does not block the original cassette C/T analysis.
- Supported structured QR examples:
  - `LOT=AS26081501;ITEM=COVID-19 Ag;EXP=2027-08-15;PN=ASAP-COV01`
  - JSON object with equivalent keys.
- Live camera requires HTTPS (or localhost) and camera permission.
