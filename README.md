# ASAP Check v31.77 — Multi-Card Per-Card Isolation + Net Pink T/C 10%

## v31.77 變更

- 保留 v31.76 的 Multi-Card QR Ownership / Voronoi 邏輯與 0.8~6 mm T 幾何限制。
- CT X 範圍縮窄到卡匣中央約 3 mm，只分析試紙本體，排除 C/T 印字、塑膠槽邊與鄰卡。
- C/T Pink 強度改成 Local Background Subtraction：Signal Pink - nearby background Pink = Net Pink。
- C 使用上方局部背景；T 使用下方局部背景，避免 C/T 彼此污染。
- Positive 主判斷：Net Pink(T) / Net Pink(C) >= 10%。
- 另加入非常低的 local-noise floor，避免多卡曝光/反射造成背景小波動被誤判成 T。
- 版本號更新為 v31.77。
