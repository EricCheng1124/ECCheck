# ASAP Check v31.94

## Architecture
- QR is used for data and orientation only. Manual QR sticker position is NOT used for precise cassette geometry or C/T coordinates.
- OpenCV outer contour/minAreaRect supplies cassette center, precise angle, width and length.
- QR logical corner orientation resolves only the 180-degree TOP/BOTTOM ambiguity.
- Multi-card runs OpenCV on the full captured image for each QR. A candidate must contain its own QR and may not contain another detected QR center. Voronoi cropping is no longer used.
- QR geometry backup is disabled so a manually shifted QR cannot fabricate a wrong 60x18 cassette frame.
- After perspective warp, C/T coordinates are derived only from the 70 mm outer frame.
- C search physical range: 24~31 mm from cassette TOP.
- T search: 3~6 mm below the detected C line.
- Weak-T, T/C >= 10%, and FWHM gate are preserved.

## Debug
- Cyan: broad outer-based CT analysis band (24~37.5 mm).
- Green: C search region (24~31 mm).
- Purple: dynamic T search region (actual C + 3~6 mm).


## v31.94
- OpenCV outer contour is now the primary gate.
- QR size, QR sticker position, and QR angle are no longer required to accept an outer contour.
- QR center is used only to pair a detected outer contour to a card; QR orientation resolves 180-degree TOP/BOTTOM after pairing.
- Window/slot and S well are not used for outer detection.
- CT remains based on the warped 60x18 mm cassette physical coordinate; T search remains C + 3–6 mm.


## v31.94
- Only the green C Search window was moved downward by 3 mm.
- C Search: 24–31 mm -> 27–34 mm from cassette TOP.
- Cyan CT analysis zone unchanged.
- Purple T Search unchanged: actual C + 3–6 mm.
- Outer frame / QR orientation / T/C / FWHM logic unchanged.


## v31.94
- Cyan Outer-based CT debug box is no longer drawn.
- Green C Search is now 3 mm high: 29–32 mm from cassette TOP.
- Purple T Search remains 3 mm high: actual C + 3–6 mm.
- Outer frame, QR orientation, T/C threshold, and FWHM logic are unchanged.


## v31.94
- Only Outer Frame reliability was changed.
- Added independent TOP / RIGHT / BOTTOM / LEFT border-support measurements.
- Border support participates in outer-candidate ranking and the final outer gate.
- Edge Snap is rejected if it weakens the real four-side border evidence.
- C Search stays 29–32 mm; T Search stays actual C + 3–6 mm.
- T/C, FWHM, QR orientation and CT thresholds are unchanged.


## v31.94
- Warp geometry only was changed; C/T parameters are untouched.
- Left/right outer edges measure cassette width.
- Cassette length is forced to Width x 3.333 (70/20).
- The actual TOP edge is searched and locked as the 0 mm physical origin.
- BOTTOM is derived as TOP + Width x 3.333 and no longer independently shifts the 70 mm scale.
- C Search remains 29-32 mm; T Search remains actual C + 3-6 mm.


## v31.94
- Outer reconstruction changed to LONG-EDGE FIRST.
- The two cassette long sides determine angle and physical 20 mm width.
- TOP is searched over a much larger range toward the QR end and must have across-width edge continuity.
- QR only resolves which end is TOP and pairs the card; QR sticker position is not used for dimensions.
- Length is fixed at Width x 3.333; BOTTOM is derived from TOP + length.
- C Search remains 29-32 mm; T Search remains actual C + 3-6 mm. No CT thresholds changed.


## v31.94 Four-Line Perspective Outer
- Removed image-space Length = Width x 3.333 outer reconstruction.
- OpenCV-style edge analysis now recovers LEFT, RIGHT, TOP and BOTTOM physical border lines independently.
- Final cassette corners are intersections of the four recovered border lines.
- Perspective is allowed: top/bottom pixel widths may differ in an oblique photo.
- QR is used only for card pairing and TOP orientation; sticker position does not set cassette geometry.
- Existing perspective warp uses the recovered four corners.
- C Search remains 29-32 mm; T Search remains actual C + 3-6 mm; CT thresholds unchanged.


## v31.94 Hard 60x18 Outer
- Four physical border lines are still recovered independently.
- TOP/BOTTOM are no longer chosen by edge strength alone; multiple candidates are enumerated.
- Every four-line combination is checked against cassette 60:18 = 3.333 geometry.
- Perspective-tolerant physical-ratio gate: 2.88-3.86, target 3.333.
- Geometry score dominates edge strength, preventing the strong QR sticker lower edge from winning when it makes the cassette too short.
- QR is still only used for TOP orientation and card pairing.
- C Search remains 29-32 mm; T Search remains actual C + 3-6 mm; CT thresholds unchanged.


## v31.94 Physical Size Correction
- Cassette physical size corrected to 60 x 18 mm.
- Target outer ratio = 60/18 = 3.3333.
- Perspective-tolerant hard ratio gate adjusted to 2.88-3.86.
- C Search remains 29-32 mm from TOP.
- T Search remains actual C + 3-6 mm.
- No C/T threshold, FWHM, QR orientation, or capture logic changed.


## v31.94 Outer Detection Architecture
- QR is used only for identity/TOP direction; QR position does not define cassette geometry.
- LEFT/RIGHT long shell edges are selected first.
- BOTTOM is selected second.
- TOP is selected last, between the established long-edge skeleton.
- QR and expanded sticker region are explicitly excluded from TOP-edge scoring.
- 60 x 18 mm ratio is a final plausibility check only; it does not generate the outer frame.
- C Search remains 29-32 mm and T Search remains actual C + 3-6 mm.


## v31.94 Physical Inner Geometry
- Outer detection is unchanged from v31.91.
- Cassette: 60 x 18 mm.
- Center groove: y=22..40 mm, length 18 mm, width 8 mm.
- Strip: centered on cassette centerline, y=26..36 mm, length 10 mm, width 4 mm.
- Conservative CT safe zone: y=27..35 mm.
- C searches upper part of safe zone (27..32 mm); T remains actual C + 3..6 mm and is clipped to safe zone.
- T/C=10% and FWHM thresholds are unchanged.


## v31.94 Inner-Structure Validated Outer
- Keeps v31.91/v31.92 outer and CT geometry.
- Every outer candidate is perspective-warped and checked against known internal mechanics.
- Groove expected at y=22..40 mm, width=8 mm, centered.
- Strip expected at y=26..36 mm, width=4 mm, centered.
- Internal-geometry score is added strongly to outer-candidate ranking.
- Edge snap is rejected if it destroys the expected inner geometry.
- This specifically targets oblique shots whose outer quadrilateral looks plausible but warps internal structures to wrong positions.
- CT algorithm/thresholds are unchanged from v31.92.


## v31.94 Second-Stage Inner Registration
- Stage 1 remains the v31.93 four-corner perspective warp.
- Stage 2 measures the known centered groove after warp: y=22..40 mm, width=8 mm.
- Only small X/Y translation and X/Y scale correction are permitted; no rotation, shear, or free deformation.
- Scale correction is clamped to 0.94..1.06; translation is clamped to +/-1.5 mm.
- Low-confidence internal edges cause NO second-stage correction, protecting good front-view images.
- The 60x18 cassette, 4 mm centered strip, CT safe zone, T/C and FWHM logic remain unchanged.
