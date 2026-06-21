# ASAP Check v31.29

Minimal CT order fix based on rollback stable version.

Changes:
- Keep stable v31.21/v31.23 behavior.
- T refine is restricted to the area below C, so it cannot snap back to the C line.
- T search range is slightly extended downward to include real lower T lines.
- C remains the upper valid peak; T is the lower valid peak.
