# ASAP Check v31.36 Branded Reader

## v31.36

- Adds the supplied horizontal A.S.A.P logo to the main header.
- Replaces the large text heading while keeping the browser title `ASAP Check`.
- Keeps the logo proportional and compact on mobile screens.

## v31.35

- Uses QR geometry as an anchor and accepts only outer-frame candidates that fully enclose all QR corners.
- Does not use any fixed QR-to-cassette size ratio.
- Keeps broad cassette aspect support for different manufacturers.
- Orients every candidate with QR before evaluating its internal test window.
- Returns `Invalid` when a trustworthy white outer frame enclosing the QR cannot be found.

## v31.34

- Keeps C/T red-line refinement anchored near the original detected peak, preventing perspective correction from moving a marker onto a different dark row or slot edge.
- Sends one non-blocking ntfy message after each completed reading to topic `ASAPRapidReader`.
- The ntfy message contains result, test name, lot number, time, and available region.

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

## v31.28
- Hides the separate Ready/Result card because the result is already shown in the three-column image.
- Hides Rescan QR and QR detected/not detected status from the main UI.
- Keeps Open Camera, Choose Photo, the result image, and Advanced Info for a simpler workflow.

## v31.29
- Fixes the hidden detection panel being shown underneath the live camera due to a CSS display override.
- Live camera mode now shows only the camera preview; the three-column result appears only after capture.
- Enlarges the live camera preview to use the freed vertical space.

## v31.30
- Makes detected C/T peaks clearly visible in the result image.
- Draws a thicker horizontal guide, a filled point on the actual strip peak, and a large C or T badge.
- Keeps the numeric peak score beside the waveform.
- Updates the detector version shown in Advanced Info.

## v31.31
- Fixes QR-directed rotation being lost because the perspective crop reordered corners again by screen coordinates.
- Finds the cassette's two short-end edge pairs directly from its four corners.
- Uses the short end nearest the QR as the top and preserves that order through perspective correction.
- Corrects horizontal, upside-down, and angled cassette photos to QR-on-top output.

## v31.32
- Prevents C and T refinement from collapsing two raw peaks onto the same stronger row.
- Splits C/T refinement ranges at the midpoint between their original peaks.
- Requires the refined C and T positions to remain separately ordered.
- Moves marker dots and guide lines outside the physical test window so the original C/T lines remain visible.

## v31.33
- Recovers strong C/T candidates when angled perspective correction produces a plateau without a strict local maximum.
- Adds non-overlapping expected C and T candidate zones before final continuity and shape gates.
- Allows tolerant continuity recovery for a blurred/faint C while retaining score and position requirements.
- Waits for a real video frame before first capture on iPhone/Safari and automatically retries readiness for up to 2.5 seconds.
- Prevents double capture and reports a retry message instead of silently doing nothing.
