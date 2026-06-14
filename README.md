# ASAP Check v22

- OpenCV outer frame detection: edge + white-mask dual path
- Background/shadow normalization before internal detection
- Window detection: contour + dark-profile
- Sample detection: inner-hole first, then stable visual S well ellipse
- Orientation correction uses Window and S only; no C/T line is used.
