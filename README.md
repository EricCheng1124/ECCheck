# ASAP Check v31.33

C refine guard fix.

Fix:
- If C/T pair is already selected correctly, C refine is not allowed to jump down into the T zone.
- Example failure fixed: raw C=201, raw T=239, C refine incorrectly changed C to 239.
- Debug now shows `guard=BLOCKED-...` when the guard prevents a bad C refine.
