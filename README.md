# ASAP Check v31.69 — Relative T threshold 10% of C

## Geometry
- Cassette: 70 × 20 mm.
- QR code: direction/orientation only.
- CT analysis zone: middle 10 mm (30 mm from top to 40 mm from top).
- T candidate must be 0.8–6.0 mm below the detected C line.

## v31.69 changes
- Positive/Negative T threshold is now relative to the detected C line.
- T strength must be at least 10% of C strength to be accepted.
- C/T strength uses a small ±0.35 mm integrated band instead of a single row/pixel.
- Existing T geometry and red-line continuity gates remain active.
- Result: C + qualifying T = Positive; C only / T below 10% = Negative; no valid C = Invalid.
- Version badge, detector version, and cache keys updated to v31.69.

## Debug
Displays C Strength, T Strength, 10% C threshold, and T/C percentage for tuning.
