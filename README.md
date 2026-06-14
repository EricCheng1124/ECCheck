# ASAP Check v29.0

本版新增外框尺寸保護：

- 避免把試紙判讀窗/內部紅線區當成整支卡匣外框
- 面積過小候選會被 SmallOuterPenalty 扣分
- 面積過小且比例像判讀窗者會被 InnerWindowPenalty 再扣分
- 保留中央優先、亮色卡匣外觀、封閉邊緣與 Window/S Well 判斷

版本：v29.0-outer-size-guard
