# ASAP Check v31.88

## Architecture
- QR is used for data and orientation only. Manual QR sticker position is NOT used for precise cassette geometry or C/T coordinates.
- OpenCV outer contour/minAreaRect supplies cassette center, precise angle, width and length.
- QR logical corner orientation resolves only the 180-degree TOP/BOTTOM ambiguity.
- Multi-card runs OpenCV on the full captured image for each QR. A candidate must contain its own QR and may not contain another detected QR center. Voronoi cropping is no longer used.
- QR geometry backup is disabled so a manually shifted QR cannot fabricate a wrong 70x20 cassette frame.
- After perspective warp, C/T coordinates are derived only from the 70 mm outer frame.
- C search physical range: 24~31 mm from cassette TOP.
- T search: 3~6 mm below the detected C line.
- Weak-T, T/C >= 10%, and FWHM gate are preserved.

## Debug
- Cyan: broad outer-based CT analysis band (24~37.5 mm).
- Green: C search region (24~31 mm).
- Purple: dynamic T search region (actual C + 3~6 mm).


## v31.88
- OpenCV outer contour is now the primary gate.
- QR size, QR sticker position, and QR angle are no longer required to accept an outer contour.
- QR center is used only to pair a detected outer contour to a card; QR orientation resolves 180-degree TOP/BOTTOM after pairing.
- Window/slot and S well are not used for outer detection.
- CT remains based on the warped 70x20 mm cassette physical coordinate; T search remains C + 3–6 mm.


## v31.88
- Only the green C Search window was moved downward by 3 mm.
- C Search: 24–31 mm -> 27–34 mm from cassette TOP.
- Cyan CT analysis zone unchanged.
- Purple T Search unchanged: actual C + 3–6 mm.
- Outer frame / QR orientation / T/C / FWHM logic unchanged.


## v31.88
- Cyan Outer-based CT debug box is no longer drawn.
- Green C Search is now 3 mm high: 29–32 mm from cassette TOP.
- Purple T Search remains 3 mm high: actual C + 3–6 mm.
- Outer frame, QR orientation, T/C threshold, and FWHM logic are unchanged.


## v31.88
- Only Outer Frame reliability was changed.
- Added independent TOP / RIGHT / BOTTOM / LEFT border-support measurements.
- Border support participates in outer-candidate ranking and the final outer gate.
- Edge Snap is rejected if it weakens the real four-side border evidence.
- C Search stays 29–32 mm; T Search stays actual C + 3–6 mm.
- T/C, FWHM, QR orientation and CT thresholds are unchanged.


## v31.88
- Warp geometry only was changed; C/T parameters are untouched.
- Left/right outer edges measure cassette width.
- Cassette length is forced to Width x 3.50 (70/20).
- The actual TOP edge is searched and locked as the 0 mm physical origin.
- BOTTOM is derived as TOP + Width x 3.50 and no longer independently shifts the 70 mm scale.
- C Search remains 29-32 mm; T Search remains actual C + 3-6 mm.


## v31.88
- Outer reconstruction changed to LONG-EDGE FIRST.
- The two cassette long sides determine angle and physical 20 mm width.
- TOP is searched over a much larger range toward the QR end and must have across-width edge continuity.
- QR only resolves which end is TOP and pairs the card; QR sticker position is not used for dimensions.
- Length is fixed at Width x 3.50; BOTTOM is derived from TOP + length.
- C Search remains 29-32 mm; T Search remains actual C + 3-6 mm. No CT thresholds changed.


## v31.88 Four-Line Perspective Outer
- Removed image-space Length = Width x 3.50 outer reconstruction.
- OpenCV-style edge analysis now recovers LEFT, RIGHT, TOP and BOTTOM physical border lines independently.
- Final cassette corners are intersections of the four recovered border lines.
- Perspective is allowed: top/bottom pixel widths may differ in an oblique photo.
- QR is used only for card pairing and TOP orientation; sticker position does not set cassette geometry.
- Existing perspective warp uses the recovered four corners.
- C Search remains 29-32 mm; T Search remains actual C + 3-6 mm; CT thresholds unchanged.
