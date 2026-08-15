# ASAP Check v31.20 + QR

Base: v31.20 Half-width T shape gate + auto GPS metadata overlay.

Added QR Code support:
- Reads QR Code from the same uploaded/taken photo.
- Displays arbitrary QR raw text.
- Auto-parses JSON or key/value data such as LOT, ITEM, EXP, PN.
- Checks YYYY-MM-DD expiry dates and marks expired tests.
- Adds parsed QR fields to the Detection Image metadata overlay.
- QR failure does not block the original rapid-test C/T detection.

Example QR data:
`LOT=AS26081501;ITEM=COVID-19;EXP=2027-08-15;PN=ASAP-COV01`

Note: The page loads jsQR 1.4.0 from jsDelivr and OpenCV.js 4.9.0 from the existing OpenCV CDN, so internet access is required unless those libraries are hosted locally.
