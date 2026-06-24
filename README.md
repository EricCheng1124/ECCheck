# ASAP Check v31.36

T refine guard fix.

Fix:
- v31.35 fixed the C line position selection so C is no longer pulled to the upper shoulder peak.
- This version fixes weak T line over-refine: when T is faint, the detector keeps the original T peak position instead of allowing refine to jump downward into a blank/background area.
- Debug now shows `T REFINE ... guard=BLOCKED-weak-t-no-refine` for faint T cases.
- Updated cache version to `31.36` in `index.html`.
