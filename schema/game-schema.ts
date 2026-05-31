/**
 * 《惊变100天》互动文字游戏 — 数据结构定义
 * 网页端可直接 import 此类型，或据此校验 JSON
 */

/** 三大数值 */
export type StatKey = 'humanity' | 'supplies' | 'ammo';

/** 庇护所类型（影响分支） */
export type ShelterType = 'villa' | 'bunker';

/** 跳转目标 */
export type Goto =
  | { type: 'nextDay' }
  | { type: 'day'; day: number }
  | { type: 'event'; eventId: string; nodeId?: string }
  | { type: 'explore'; areaId?: string }
  | { type: 'fixed'; fixedId: string }
  | { type: 'ending'; endingId: string }
  | { type: 'route'; routeId: string }
  | { type: 'nearDeath' }
  | { type: 'retryChoices' }
  | { type: 'areaNode'; nodeId: string };

/** 选项前置条件（全部满足才可点） */
export interface ChoiceRequirements {
  shelter?: ShelterType;
  /** 必须拥有全部词条 */
  tags?: string[];
  /** 必须拥有全部内部标记（不展示给玩家） */
  flags?: string[];
  /** 须拥有全部伙伴 */
  partners?: string[];
  /** 固定事件 id；若已在 disabledFixedEvents 中则不可选 */
  fixedEventId?: string;
  /** 必须拥有任一词条 */
  tagsAny?: string[];
  /** 必须没有的词条 */
  tagsNot?: string[];
  /** 必须没有的内部标记 */
  flagsNot?: string[];
  partnersNot?: string[];
  items?: string[];
  minAmmo?: number;
  minSupplies?: number;
  maxHumanity?: number;
  minHumanity?: number;
  /** 仅可触发一次 */
  once?: boolean;
  /** 天数范围 [min, max] 含端点 */
  dayRange?: [number, number];
  /** 探索过某区域 */
  exploredArea?: string;
  /** 某区域状态，如希望酒吧已关闭 */
  areaClosed?: string[];
}

/** 选项消耗（选前扣除） */
export interface ChoiceCost {
  supplies?: number;
  ammo?: number;
  /** 弹药区间随机消耗时用 min/max */
  ammoRange?: [number, number];
}

/** 选项后果（选后应用） */
export interface ChoiceEffects {
  humanity?: number;
  supplies?: number;
  ammo?: number;
  /** 设置内部标记（不展示给玩家） */
  setFlag?: string;
  /** 清除内部标记 */
  clearFlag?: string;
  addPartner?: string;
  removePartner?: string;
  addTag?: string;
  addTags?: string[];
  /** 重复获得词条时不提示 */
  addTagSilentIfDuplicate?: string;
  addItem?: string;
  removeItem?: string;
  /** 物资消耗修正（如供暖装置 -5/天） */
  suppliesCostModifier?: number;
  /** 固定剩余物资（特殊剧情） */
  setSupplies?: number;
  /** 物资减半 */
  suppliesHalve?: boolean;
  /** 关闭探索区域 */
  closeExploreArea?: string;
  /** 禁用固定事件 */
  disableFixedEvent?: string;
  /** 下一天无法行动 */
  skipNextDayActions?: boolean;
  /** 濒死标记 */
  nearDeath?: boolean;
  /** 游戏结束 */
  gameOver?: boolean;
}

/** 数字输入型选项（如输入击杀数量） */
export interface NumericChoiceInput {
  type: 'number';
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  placeholder?: string;
  label?: string;
  submitText?: string;
  /** 每输入 1 点时额外扣除的资源 */
  perUnitCost?: ChoiceCost;
  /** 每输入 1 点时额外获得/失去的数值 */
  perUnitEffects?: Pick<ChoiceEffects, 'humanity' | 'supplies' | 'ammo'>;
  /** 支持 {{value}} / {{ammoDelta}} / {{suppliesDelta}} / {{humanityDelta}} / {{ammoCost}} / {{suppliesCost}} */
  resultTextTemplate?: string;
}

/** 条件分支结果（如别墅/防空洞不同叙述） */
export interface ConditionalResult {
  when: Partial<ChoiceRequirements> & {
    /** 人性高于/低于 */
    humanityAbove?: number;
    humanityBelow?: number;
    exploredBar?: 'serena_alive' | 'serena_dead' | 'not_explored';
  };
  resultText: string;
  cost?: ChoiceCost;
  effects?: ChoiceEffects;
  goto?: Goto;
  /** 仅当前分支命中时，标红为特殊事件 */
  specialEvent?: boolean;
}

export interface Choice {
  id: string;
  text: string;
  input?: NumericChoiceInput;
  requirements?: ChoiceRequirements;
  cost?: ChoiceCost;
  /** 无分支时的统一结果 */
  resultText?: string;
  effects?: ChoiceEffects;
  goto?: Goto;
  /** 多条件不同结果 */
  branches?: ConditionalResult[];
  /** 主持人备注，不展示给玩家 */
  hostNote?: string;
  /** 强制标红「特殊事件」（否则由引擎根据是否进入新剧情事件推断） */
  specialEvent?: boolean;
}

export interface EventNode {
  id: string;
  narrative?: string;
  choices: Choice[];
  /** 进入本节点时自动应用（如商场初始物资） */
  onEnterEffects?: ChoiceEffects;
  /** 伴随 onEnterEffects 展示给玩家的文字 */
  onEnterResultText?: string;
}

export interface GameEvent {
  id: string;
  title: string;
  /** 不消耗当天物资 */
  noSuppliesCost?: boolean;
  /** 仅特定庇护所 */
  shelter?: ShelterType;
  nodes: EventNode[];
}

export interface GameDay {
  day: number;
  title: string;
  /** 开启本天时消耗物资（0=不消耗，如第38天防空洞） */
  suppliesCost: number;
  /** 从本轮起额外消耗（如第10天起+10） */
  suppliesCostBonus?: number;
  /** 伙伴额外消耗说明 */
  partnerCostNote?: string;
  openingText?: string;
  choices: Choice[];
  hostNote?: string;
}

export interface ExploreArea {
  id: string;
  name: string;
  narrative?: string;
  choices: Choice[];
  /** 子节点事件树 */
  nodes?: Record<string, EventNode>;
}

export interface PartnerDef {
  id: string;
  name: string;
  intro: string;
  suppliesPerDay: number;
}

export interface EndingTag {
  id: string;
  name: string;
  flavorText: string;
  /** 结算分数；null = 待填写 */
  score: number | null;
  /** 是否大结局词条（参与乘数） */
  isFinale?: boolean;
  /** 重复获得不提醒 */
  silentIfDuplicate?: boolean;
}

export interface Ending {
  id: string;
  route: string;
  title: string;
  narrative: string;
  requiredTags?: string[];
  requiredTagsAny?: string[];
  requiredShelter?: ShelterType;
  tagsGranted?: string[];
  score: number | null;
}

export interface ScoringTemplate {
  /** 人性值初始 */
  humanityInitial: number;
  /** 公式说明（手册原文） */
  formulaDescription: string;
  /** 实现用表达式占位 — 填入后可 eval 或自写引擎 */
  formula: {
    /** 例: "(humanity * humanityMultiplier) + tagScoreSum" */
    baseExpression: string;
    humanityMultiplier: number | null;
    /** 大结局词条乘数；无大结局时用 defaultFinaleMultiplier */
    finaleMultiplierWhenNone: number | null;
    tagScoreSum: 'sum_of_player_tags' | null;
  };
  grades: Array<{
    rank: string;
    min: number | null;
    max: number | null;
    label: string;
  }>;
  /** 通关时自动判定的隐藏词条 */
  autoTags: Array<{
    tagId: string;
    condition: string;
    score: number | null;
  }>;
}

export interface GameMeta {
  title: string;
  subtitle?: string;
  intro: string[];
  hostOpening: string;
  initialStats: Record<StatKey, number>;
  specialMechanics: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

export interface GameData {
  meta: GameMeta;
  partners: PartnerDef[];
  tags: EndingTag[];
  scoring: ScoringTemplate;
  preOutbreak: GameDay[];
  days: GameDay[];
  events: GameEvent[];
  exploration: ExploreArea[];
  fixedEvents: GameEvent[];
  endings: Ending[];
  routes: Array<{
    id: string;
    name: string;
    description: string;
    entryConditions?: string;
  }>;
}
