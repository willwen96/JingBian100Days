# 《惊变100天》游戏数据格式说明

## 目录结构

```
100Days/
├── schema/game-schema.ts    # 类型定义（建议网页端 import）
├── data/
│   ├── index.json           # 数据包索引
│   ├── meta.json            # 标题、开场、初始数值
│   ├── rules.json           # 引擎规则（日耗、濒死、肾上腺素等）⭐
│   ├── scoring.json         # 结局评分公式模板 ⭐
│   ├── partners.json        # 伙伴定义
│   ├── tags.json            # 结局词条 + 分数
│   ├── pre-outbreak.json    # 爆发前三阶段
│   ├── days.json            # 按天剧情骨架
│   ├── days-choices-template.json  # 第10天起共用选项
│   ├── events.json          # 嵌套事件树
│   ├── exploration.json     # 外出探索区域
│   └── endings.json         # 结局路线
└── DATA_FORMAT.md           # 本文件
```

## 核心概念

| 概念 | 说明 |
|------|------|
| **人性值 / 物资 / 弹药** | 三大数值，见 `meta.initialStats` |
| **庇护所** | `villa` 别墅 / `bunker` 防空洞，影响分支 |
| **伙伴** | 莱姆、布莱克、露娜、伊芙琳、约翰、婴儿 |
| **词条 (tag)** | 结局结算用，玩家游戏中只显示名称 |
| **事件 (event)** | 多节点剧情树，如布莱克、露娜 |
| **探索 (explore)** | 外出探索随机/固定区域 |

## 选项 (Choice) 字段

```json
{
  "id": "唯一ID",
  "text": "玩家看到的选项文字",
  "requirements": {
    "shelter": "villa",
    "tags": ["穿越者"],
    "partners": ["lime"],
    "items": ["收音机"],
    "minAmmo": 10,
    "once": true,
    "dayRange": [20, 25]
  },
  "cost": { "ammo": 5, "supplies": 10 },
  "resultText": "选择后的叙述",
  "effects": {
    "humanity": 10,
    "supplies": -30,
    "ammo": 5,
    "addPartner": "lime",
    "removePartner": "blake",
    "addTag": "伙伴",
    "addTagSilentIfDuplicate": "底线",
    "addItem": "收音机",
    "nearDeath": true,
    "gameOver": true
  },
  "goto": { "type": "nextDay" }
}
```

### `goto` 类型

| type | 含义 |
|------|------|
| `nextDay` | 进入下一天（先扣当日物资） |
| `day` | 跳到指定天数 |
| `event` | 进入 `events.json` 中某事件的节点 |
| `explore` | 打开探索选区 UI |
| `route` | 进入结局线（savior / adam_eve / lone_wolf） |
| `nearDeath` | 濒死：消耗 30 物资跳过 |
| `retryChoices` | 重新显示当天选项 |

### 条件分支 `branches`

同一选项因别墅/防空洞、人性高低等产生不同结果：

```json
"branches": [
  {
    "when": { "shelter": "villa" },
    "resultText": "...",
    "effects": { "humanity": -5 },
    "goto": { "type": "event", "eventId": "blake" }
  }
]
```

## 结局评分模板 (`scoring.json`)

手册公式：

> **【（人性值×10）+ 结局词条分数】× 大结局词条分数 = 结局分数**

已预填：

- `humanityMultiplier`: **10**
- 等级档位 X / C / B / A / S / SS / SSS
- 自动词条：尽头、人性的光芒、末世之王

### 你需要填写的内容

1. **`tags.json`** 中 `score: null` 的词条（若有新增）
2. **大结局乘数**：`isFinale: true` 的词条分数（如 `2`、`1.7`、`1.5`、`1.2`）已按手册填写
3. **`scoring.formula`** 若你有更复杂的结算规则，可改 `baseExpression` 或在引擎中实现

示例计算（伪代码）：

```javascript
const tagSum = player.tags.reduce((s, id) => s + (tags[id].score ?? 0), 0);
const finale = player.tags.find(t => tags[t].isFinale);
const finaleMul = finale ? tags[finale].score : scoring.formula.finaleMultiplierWhenNone;
const score = ((player.humanity * 10) + tagSum) * finaleMul;
```

## 词条分数速查

所有词条及分数在 `data/tags.json`。手册中「仅用于结算」的分数均已录入；**重复获得不提醒**的词条标记了 `silentIfDuplicate: true`（如《底线》）。

## 引擎规则 (`rules.json`)

与 `demo/js/rules.js` 配套，实现手册中的系统逻辑（不写在剧情 JSON 里）。

| 规则 | 配置键 | 说明 |
|------|--------|------|
| 每日开天扣物资 | `daySuppliesCost` | 优先 `days.json` 的 `suppliesCost`，否则 `fallbackTiers`；叠加伙伴/供暖装置 |
| 物资 ≤ 0 | `stats.gameOverWhenSuppliesAtOrBelow` | 行动后检测，结束游戏 |
| 濒死 | `nearDeath.suppliesCost` | 不足日耗时可花 30 跳过，并免除**本次**开天消耗 |
| 同伴转化物资 | `companion-convert.json` | 日耗不足时触发**当前天前夜**（非弹窗）；多同伴时先选人；婴儿不可转化；有《伙伴》词条不可转化莱姆 |
| 肾上腺素 | `items.肾上腺素` | 下一次选择免疫所有 `cost` |
| 供暖装置 | `itemModifiers` | 每天物资 -5 |
| 自动词条 | `tags.autoGrant` | 尽头 / 人性的光芒 / 末世之王（探索满 7 次） |
| 转化物资追踪 | `tracking.convertToSupplies` | 从未选「转化为物资」→ 人性的光芒 |

修改规则后无需改剧情 JSON，重启页面即可。

## 实现建议

1. **加载**：`fetch('/data/index.json')` 再按 `files` 字段并行加载各 JSON
2. **状态机**：维护 `{ day, stats, shelter, partners[], tags[], items[], flags{} }`
3. **第10天+**：读取 `days.json` + merge `days-choices-template.json` 的 `dayOverrides`
4. **探索**：`goto.type === 'explore'` 时弹出 `exploration.json` 区域列表（可随机或让玩家选）
5. **黎明者营地**：`dawn_camp` 事件可无限循环，选「回家」不消耗当天

## 尚未在手册中出现的部分

以下在数据里留了结构，便于你后续直接填数：

- 骰子游戏「以大搏小」的具体概率表 → 可在 `events.dawn_camp` 加 `minigame` 字段
- 「同伴转化物资」详细规则 → `meta.specialMechanics` 已引用，待对照《判定与结局评分》补充
- 第 6–9 天：手册未单独列出，若实际有剧情可在 `days.json` 插入

## 源文件

转换自项目根目录：

- `《惊变100天》主持人手册.docx.md`
- `外出探索.docx.md`

如需把剩余天数展开为与第 1–5 天同等粒度的完整 `choices` 数组，告诉我优先哪几天，我可以继续补全。
