# 惊变100天 · 网页 Demo

试玩：**爆发前 → 第 100 天**（含第 80–100 天三条结局线：救世主线 / 亚当夏娃 / 独狼）。中期含全部外出探索、黎明者营地、布莱克/露娜/莱姆/伊芙琳/克里斯/英雄营地等事件。

## 运行方式

在项目根目录 `100Days/` 启动静态服务器（不能直接双击 HTML，否则无法加载 JSON）：

```bash
npx serve .
```

浏览器打开：**http://localhost:3000/demo/**

或：

```bash
python -m http.server 8080
```

打开：**http://localhost:8080/demo/**

小游戏测试页：**http://localhost:8080/demo/minigames.html**

## 推荐试玩路线

| 路线 | 选择 |
|------|------|
| 布莱克 | 山中别墅 → 第4天苟家里 → 布莱克事件 |
| 露娜 | 防空洞 → 第5天外出探索 → 露娜事件 |
| 探索 | 第2天起选「外出探索」→ 罐头厂 / 第五大道等 |
| 濒死 | 农户家选「共进晚餐」，或布莱克线放走他 |
| 同伴转化前夜 | 第4天末物资不足开第5天；有布莱克/露娜等；莱姆需无《伙伴》词条才可转化 |

## 文件

- `js/rules.js` — 引擎规则（读 `data/rules.json`）
- `js/engine.js` — 剧情状态机
- `js/main.js` — 界面渲染
- `js/minigames.js` — 黎明者营地小游戏逻辑
- `js/minigames-page.js` — 小游戏手动测试页

## 单元测试

项目根目录执行：

```bash
npm test
```

监听模式：

```bash
npm run test:watch
```

规则配置见 `../data/rules.json`（日耗、濒死 30、肾上腺素、同伴转化 template 等）。

完整数据格式见上级目录 `DATA_FORMAT.md`。
