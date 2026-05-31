# TODO

已完成（2026-05-27）

- [x] **UI 提升**
  - 词条改为可折叠面板，不再堆在顶栏
  - 效果以独立 chip 展示，选择/场景结果分栏
  - 进入新一天时有轻量 header / 正文过渡动画
- [x] **下一天物资预览**：按 `_getNextPlayableDay` 显示「开启第 N 天预计消耗」（非 day+1）
- [x] **探索选项**：外出探索（explore / explore_pick）不标注「特殊事件」
- [x] **固定特殊事件**（莱姆、伊芙琳等）：仍显示特殊事件标签
- [x] **选择日志**：`choiceLog` 记录每次选择，游玩中可展开，结局页完整回顾
- [x] **Deadlock 检测**：无可用选项/探索区域时在界面显示警告（路由审计见 `npm run audit:routes`）
- [x] **物资下限**：`clampStats` 将 supplies 钳制为 ≥0，避免 effect 扣成负数
- [x] **React 网页版**：见 `web/`，运行 `npm run dev:web`
