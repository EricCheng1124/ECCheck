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


## v31.23
- Any successfully decoded QR now appears on the compact main screen.
- Structured QR data still maps to ITEM / LOT / EXP / PN.
- Unstructured QR text falls back to Raw QR content with `QR ✓`.

## v31.24
- QR information is displayed as clear label/value rows instead of a fixed two-line strip.
- Long values wrap automatically; decoded information is no longer truncated with ellipses.
- Supports `Name of Test`, `Manufacturer`, `Date of Manufacturer`, `Lot Number`, and `Expired Date of Test`.
- Slash-formatted dates such as `2027/08/17` are supported for expiry checking.
- Unknown structured fields are preserved and shown, so all information contained in the QR remains visible.

## v31.25
- Improves dense QR recognition with native BarcodeDetector when available.
- Adds full-frame, inset, and center-square jsQR retries.
- Adds grayscale contrast and threshold retries for difficult camera images.
- Raises live scan resolution from 720 to 1100 pixels while reducing scan frequency to control CPU use.

## v31.26
- QR position is the mandatory orientation reference; the cassette end nearest the QR becomes the top.
- The captured still image is rescanned so stale live-preview QR coordinates are never reused.
- Missing QR returns `Invalid - QR not detected`; S/R well orientation fallback is disabled.
- Supports compact QR keys N/M/D/L/E and displays their full field names.
- Combined result canvas uses three columns: original photo on the left black panel, corrected cassette in the center, and QR/result metadata on the right black panel.
- Original photo and metadata no longer overlap the cassette.

## v31.27
- Removes the large Test Information card above the result image.
- After capture, the three-column photo/result area is the first main content shown.
- Shrinks the C/T analysis zone to the inner 86% of the detected window.
- Excludes the lower edge region and rejects T candidates too close to the window bottom.
