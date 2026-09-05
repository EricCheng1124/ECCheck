# ASAP Check v31.81

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
