# ASAP Check v28.2

- 修正 OpenCV.js `cv.inRange()` 在部分版本不能吃 `new cv.Scalar(...)` 的問題，改用 Mat lower/upper。
- `app.js` 已加入 `try/catch`，OpenCV 例外不會讓整個分析流程直接中斷。
- Debug 會顯示 Gray、White Mask、Edge、Bright Foreground。
- Candidate Debug 會列出 Candidate Score、Feature Score、Window Score、S Well Score、Align Score。
- Outer frame: white mask + edge + bright foreground。
- Candidate selection uses Window/S same-axis feature score。
- Orientation uses Window + S Well only。
