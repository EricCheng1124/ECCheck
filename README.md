# ASAP Check v28.3

- 修正 OpenCV.js `cv.inRange()` 在部分版本會出現 BindingError 的問題。
- `app.js` 加入 try/catch，避免 OpenCV 例外造成整個分析停止。
- S Well 偵測改為只在 Window 下方、同一中線附近搜尋。
- 提高 circularity / fill 條件，避免把 C/T/S 文字或陰影當成 S Well。
- Debug 顯示 Gray / White Mask / Edge / Bright Foreground。
- Candidate Debug 顯示 Window Score、S Well Score、Align Score 與 Sample Candidates。

版本：v28.3-sample-area-fixed
