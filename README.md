# ASAP Check v32.02

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


## v32.02
- OpenCV outer contour is now the primary gate.
- QR size, QR sticker position, and QR angle are no longer required to accept an outer contour.
- QR center is used only to pair a detected outer contour to a card; QR orientation resolves 180-degree TOP/BOTTOM after pairing.
- Window/slot and S well are not used for outer detection.
- CT remains based on the warped 60x18 mm cassette physical coordinate; T search remains C + 3–6 mm.


## v32.02
- Only the green C Search window was moved downward by 3 mm.
- C Search: 24–31 mm -> 27–34 mm from cassette TOP.
- Cyan CT analysis zone unchanged.
- Purple T Search unchanged: actual C + 3–6 mm.
- Outer frame / QR orientation / T/C / FWHM logic unchanged.


## v32.02
- Cyan Outer-based CT debug box is no longer drawn.
- Green C Search is now 3 mm high: 29–32 mm from cassette TOP.
- Purple T Search remains 3 mm high: actual C + 3–6 mm.
- Outer frame, QR orientation, T/C threshold, and FWHM logic are unchanged.


## v32.02
- Only Outer Frame reliability was changed.
- Added independent TOP / RIGHT / BOTTOM / LEFT border-support measurements.
- Border support participates in outer-candidate ranking and the final outer gate.
- Edge Snap is rejected if it weakens the real four-side border evidence.
- C Search stays 29–32 mm; T Search stays actual C + 3–6 mm.
- T/C, FWHM, QR orientation and CT thresholds are unchanged.


## v32.02
- Warp geometry only was changed; C/T parameters are untouched.
- Left/right outer edges measure cassette width.
- Cassette length is forced to Width x 3.333 (70/20).
- The actual TOP edge is searched and locked as the 0 mm physical origin.
- BOTTOM is derived as TOP + Width x 3.333 and no longer independently shifts the 70 mm scale.
- C Search remains 29-32 mm; T Search remains actual C + 3-6 mm.


## v32.02
- Outer reconstruction changed to LONG-EDGE FIRST.
- The two cassette long sides determine angle and physical 20 mm width.
- TOP is searched over a much larger range toward the QR end and must have across-width edge continuity.
- QR only resolves which end is TOP and pairs the card; QR sticker position is not used for dimensions.
- Length is fixed at Width x 3.333; BOTTOM is derived from TOP + length.
- C Search remains 29-32 mm; T Search remains actual C + 3-6 mm. No CT thresholds changed.


## v32.02 Four-Line Perspective Outer
- Removed image-space Length = Width x 3.333 outer reconstruction.
- OpenCV-style edge analysis now recovers LEFT, RIGHT, TOP and BOTTOM physical border lines independently.
- Final cassette corners are intersections of the four recovered border lines.
- Perspective is allowed: top/bottom pixel widths may differ in an oblique photo.
- QR is used only for card pairing and TOP orientation; sticker position does not set cassette geometry.
- Existing perspective warp uses the recovered four corners.
- C Search remains 29-32 mm; T Search remains actual C + 3-6 mm; CT thresholds unchanged.


## v32.02 Hard 60x18 Outer
- Four physical border lines are still recovered independently.
- TOP/BOTTOM are no longer chosen by edge strength alone; multiple candidates are enumerated.
- Every four-line combination is checked against cassette 60:18 = 3.333 geometry.
- Perspective-tolerant physical-ratio gate: 2.88-3.86, target 3.333.
- Geometry score dominates edge strength, preventing the strong QR sticker lower edge from winning when it makes the cassette too short.
- QR is still only used for TOP orientation and card pairing.
- C Search remains 29-32 mm; T Search remains actual C + 3-6 mm; CT thresholds unchanged.


## v32.02 Physical Size Correction
- Cassette physical size corrected to 60 x 18 mm.
- Target outer ratio = 60/18 = 3.3333.
- Perspective-tolerant hard ratio gate adjusted to 2.88-3.86.
- C Search remains 29-32 mm from TOP.
- T Search remains actual C + 3-6 mm.
- No C/T threshold, FWHM, QR orientation, or capture logic changed.


## v32.02 Outer Detection Architecture
- QR is used only for identity/TOP direction; QR position does not define cassette geometry.
- LEFT/RIGHT long shell edges are selected first.
- BOTTOM is selected second.
- TOP is selected last, between the established long-edge skeleton.
- QR and expanded sticker region are explicitly excluded from TOP-edge scoring.
- 60 x 18 mm ratio is a final plausibility check only; it does not generate the outer frame.
- C Search remains 29-32 mm and T Search remains actual C + 3-6 mm.


## v32.02 Physical Inner Geometry
- Outer detection is unchanged from v31.91.
- Cassette: 60 x 18 mm.
- Center groove: y=22..40 mm, length 18 mm, width 8 mm.
- Strip: centered on cassette centerline, y=26..36 mm, length 10 mm, width 4 mm.
- Conservative CT safe zone: y=27..35 mm.
- C searches upper part of safe zone (27..32 mm); T remains actual C + 3..6 mm and is clipped to safe zone.
- T/C=10% and FWHM thresholds are unchanged.


## v32.02 Inner-Structure Validated Outer
- Keeps v31.91/v31.92 outer and CT geometry.
- Every outer candidate is perspective-warped and checked against known internal mechanics.
- Groove expected at y=22..40 mm, width=8 mm, centered.
- Strip expected at y=26..36 mm, width=4 mm, centered.
- Internal-geometry score is added strongly to outer-candidate ranking.
- Edge snap is rejected if it destroys the expected inner geometry.
- This specifically targets oblique shots whose outer quadrilateral looks plausible but warps internal structures to wrong positions.
- CT algorithm/thresholds are unchanged from v31.92.


## v32.02 Second-Stage Inner Registration
- Stage 1 remains the v31.93 four-corner perspective warp.
- Stage 2 measures the known centered groove after warp: y=22..40 mm, width=8 mm.
- Only small X/Y translation and X/Y scale correction are permitted; no rotation, shear, or free deformation.
- Scale correction is clamped to 0.94..1.06; translation is clamped to +/-1.5 mm.
- Low-confidence internal edges cause NO second-stage correction, protecting good front-view images.
- The 60x18 cassette, 4 mm centered strip, CT safe zone, T/C and FWHM logic remain unchanged.


## v32.02 QR Plane Perspective Reference
- QR is confirmed flat and square, so its four corners are used as a projective reference for the cassette plane.
- QR sticker POSITION is still never used to place cassette TOP/BOTTOM/LEFT/RIGHT.
- Each outer candidate is transformed into QR-rectified plane coordinates and must look like a 60x18 rectangle there.
- QR-plane checks include target ratio 3.333, opposite-edge parallelism, near-orthogonality, and opposite-side balance.
- QR-plane score is strongly included in outer-candidate ranking and final outer validation.
- Edge snap is rejected if it damages QR-plane rectangular geometry.
- v31.94 second-stage inner registration remains enabled after final outer perspective warp.
- C/T geometry and thresholds are unchanged.


## v32.02 Multi-Anchor + Wide C Locator
- Phone orientation sensors are intentionally NOT used.
- QR remains a perspective/identity/orientation reference; QR sticker position does not locate C/T.
- Outer remains 60x18 mm and v31.95 QR-plane validation is preserved.
- v31.94 inner registration remains preserved.
- C is no longer hard-clipped to 27..32 mm. It is image-located in a guarded 24.8..32.8 mm physical region.
- The nominal C position (29.5 mm) is only a soft prior; clear horizontal red/pink evidence can move the C anchor.
- Once actual C is located, T is still hard constrained to actual C + 3..6 mm.
- T/C >=10% and T FWHM 0.15..1.50 mm remain unchanged.
- Analysis Y guard band is 24.5..36.5 mm; X remains the known centered 4 mm strip.
- Added C locator confidence and physical C position debug values.


## v32.02 Multi-Anchor 2-of-3 Fallback
- QR perspective is no longer a hard final gate.
- Geometry uses three anchors: OUTER, QR-plane, INNER structure.
- Final geometry passes when at least 2 of 3 anchors agree, while the cassette candidate still passes basic physical plausibility.
- If QR perspective is LOW/FAIL but OUTER + INNER pass, analysis continues in FALLBACK mode.
- If QR perspective was initially good, edge snapping is not allowed to destroy it.
- QR scoring penalty was reduced so steep shots are not automatically discarded.
- v31.96 Wide C Locator, actual-C anchor, T=C+3..6mm, T/C 10%, and FWHM 0.15..1.50mm are unchanged.
- Phone orientation sensors are still not used.


## v32.02 Actual Groove Anchor
- C/T ROI no longer uses crop width/18 and crop height/60 as the primary coordinate source.
- After the outer warp, the actual observed 8x18 mm groove is detected again.
- Measured groove left/right define local X center and X mm scale.
- Measured groove top/bottom define local Y origin and Y mm scale.
- The 4 mm strip is taken as the centered half-width of the measured 8 mm groove.
- C is image-located within the v31.96 wide locator using this groove-based coordinate system.
- T remains actual C + 3..6 mm; T/C 10% and FWHM 0.15..1.50 mm are unchanged.
- If actual groove confidence is insufficient, the system falls back to outer-derived coordinates instead of forcing a bad groove anchor.
- v31.97 2-of-3 geometry fallback remains unchanged.


## v32.02 Logic Cleanup / Single-Warp Geometry
- Active cassette geometry normalized to 60x18 mm (aspect 3.3333); stale 70-based active formulas were corrected.
- Only one image resampling stage remains: outer perspective warp. Residual inner registration is measurement-only; no second warpAffine is applied.
- Actual Groove gate now requires individual L/R and T/B evidence, side balance, center plausibility, size plausibility, continuity, and confidence >=58.
- Multi-Anchor final gate is now a true 2-of-3 vote among OUTER / QR / INNER, with at least one image-geometry anchor required.
- Final T requires weak chromatic/horizontal evidence in addition to C+3..6 mm, T/C>=10%, and FWHM 0.15..1.50 mm.
- UI/debug window now uses the exact CT analysis ROI, avoiding stale window mismatch.
- Phone orientation sensors remain unused.


## v32.02 Confirmed Physical Geometry
- Confirmed cassette outer size: 70 x 20 mm (aspect 3.500).
- QR code physical square: 14 x 14 mm. QR square geometry is used for perspective/orientation; sticker position is not used to derive C/T position.
- Reagent groove starts 25 mm from cassette TOP and is 19 mm long: 25..44 mm.
- Strip region starts 29 mm from cassette TOP and is 12 mm long: 29..41 mm.
- C nominal center: about 32 mm from TOP (soft image-search prior).
- T nominal center: about 37 mm from TOP. Dynamic T remains anchored to detected C with 3.5..6.5 mm separation tolerance.
- C/T line width is approximately <=2 mm; T FWHM maximum updated to 2.00 mm.
- Previous known groove width 8 mm and centered-strip width 4 mm are retained because this update did not redefine their widths.
- Single-warp policy, actual-groove confidence gate, true 2-of-3 consensus, T color evidence gate, and UI/analysis ROI synchronization are retained.


## v32.02 Outer-Y Locked
- C/T absolute Y uses OUTER TOP=0 and 70 mm length only.
- Groove only validates geometry / aligns X; it cannot shift Y.
- Strip=29..41 mm; C search=30..34.5 mm; T absolute guard=35..39.5 mm plus C gap=3.5..6.5 mm.


## v32.02 CT Cross-Validated Logic
- Fix: C absolute 30.0..34.5 mm gate is now actually connected to final cDetected.
- T evidence changed from OR-style evidence to Horizontal AND Weak-Chromatic evidence.
- Groove never shifts Y; when groove detection passes, 25..44 mm is used only to cross-check OUTER-derived Y.
- If trusted Groove Y disagrees with OUTER by more than 3.5 mm at either end, CT result is forced Invalid instead of Positive/Negative.
- If Groove is unavailable/low-confidence, it does not block analysis; OUTER physical Y remains the primary anchor.
- C reject/debug now reports c-outside-30.0-34.5mm; T reject/debug reports updated 3.5..6.5 mm and chromatic/horizontal reasons.
- Existing 70x20 cassette, QR 14x14, strip 29..41, C~32, T~37, T/C>=10%, FWHM<=2.0 mm remain.
