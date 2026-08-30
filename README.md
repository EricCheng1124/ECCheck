# ASAP Check v31.44 QR Template Cassette + Lossless Capture + Fixed Share Layout

## v31.44

- Keeps the v31.42 QR-directed cassette rectification and C/T detection logic unchanged.
- Camera capture is now transferred to the analysis pipeline as **lossless PNG** instead of JPEG 0.94. This avoids JPEG recompression from flattening very faint C/T contrast and makes the analyzed pixels match the captured frame as closely as the browser permits.
- No brightness, white-balance, histogram equalization, or contrast enhancement is applied to the displayed corrected cassette. The center panel is a perspective-corrected crop of the original captured pixels.
- **Share Analysis Image** now always occupies the same full-width second row in the action area. Before the first successful analysis it remains visible but disabled.
- Camera layout is now: `Capture & Detect` + `Close` on the first row, then `Share Analysis Image` on the second row.
- Result layout is now: `Open Camera` + `Choose Photo` on the first row, then `Share Analysis Image` on the second row.
- If a previous analysis already exists when the camera is reopened, Share remains enabled and stays in the same position.

## v31.42

- Keeps the v31.41 QR-directed cassette rectification and fixed new-cassette C/T analysis geometry.
- Clarifies the C/T debug overlay: the green `C` and purple `T` markers are the detected peak rows, not the printed C/T letters on the cassette.
- Adds short dashed ticks at both edges of the cyan `CT zone` so the exact sampled C/T Y positions are visible without covering the real test lines.
- Adds **Share Analysis Image** below the main controls. It shares the exact three-column analysis canvas (Original Image + corrected cassette/debug overlay + result metadata) as a PNG.
- On iPhone/Safari and browsers that support Web Share with files, the button opens the native share sheet directly.
- If file sharing is unavailable, the same PNG is saved as a fallback.
- Suggested support workflow: run the test -> tap **Share Analysis Image** -> send that PNG for troubleshooting.

## v31.41

- Uses QR geometry to generate whole-cassette candidates instead of allowing a QR-sized region to become the cassette crop.
- When QR orientation is trusted, the corrected cassette uses a fixed proportional result-slot ROI for this new cassette generation.
- The cyan `CT zone` is the actual pixel region analyzed for C/T peaks.
- The green `C` and purple `T` horizontal guides represent the detected peak Y coordinates.
- The larger blue `Window/slot` rectangle is only the geometric result-slot region; it is intentionally larger than the cyan C/T measurement zone.
- Keeps the original C/T pixels unobstructed so faint positive lines remain visible in the diagnostic image.

## v31.39

- QR 仍作為方向基準，QR 必須位於卡匣上方。
- 外框候選除了必須包住 QR，透視校正後還需通過白色低飽和卡匣驗證。
- 新增四角白色塑膠檢查與彩色背景比例，排除桌面/木紋大框。
- 固定比例框只保留為搜尋範圍，不再作為 C/T 測量區。
- 必須找到真實判讀窗（紅線或 OpenCV 視窗輪廓）才分析 C/T；否則回報 Invalid，避免誤判。
- 不使用單一廠牌的 QR 尺寸或卡匣長寬比例。

## v31.38

- Enlarges right-side result labels and values by another step.
- Shows GPS coordinates immediately, then resolves the current device location to locality, administrative region, and country.
- Keeps coordinates as a fallback when reverse geocoding is unavailable.
- Uses BigDataCloud's browser-only free reverse-geocoding endpoint with no API key.

## v31.37

- Enlarges labels and values in the right-side result metadata panel by approximately 20-25%.
- Adds slightly more line spacing while keeping all information inside the right black panel.

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


## v31.44 - Peak-locked C/T markers + capture-only Share

- C/T marker Y positions are now locked to the actual selected 1-D profile peaks.
- Red-line continuity refinement is retained only as validation evidence and can no longer move the visible C/T marker away from its profile peak.
- The Share Analysis Image button is hidden whenever the camera is open or a new capture has not finished.
- Share Analysis Image appears only after a photo has completed analysis.
- Starting a retake immediately hides Share Analysis Image until the new analysis is available.


## v31.45 - Cassette-fixed C/T ROI

- Fixed the C/T analysis box being horizontally offset from the real reaction strip on the new cassette.
- C/T ROI is now anchored directly to the perspective-corrected full cassette, not derived from the pale Window/slot contour.
- New-cassette ROI: X 43-61% and Y 33-55% of the normalized cassette image.
- C/T markers remain locked to the actual selected 1-D profile peaks.
- The Window/slot rectangle is retained only as a visual/debug reference; it no longer determines the C/T profile position.
- Share Analysis Image remains visible only after a completed Capture & Detect / photo analysis. Opening the camera for a new capture hides it until the new analysis finishes.
