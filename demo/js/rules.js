/**
 * 《惊变100天》引擎规则 — 与 data/rules.json 配套
 */

export class GameRules {
  constructor(rulesConfig, partners = []) {
    this.config = rulesConfig;
    this.partnersById = Object.fromEntries(partners.map((p) => [p.id, p]));
  }

  get demoMaxDay() {
    return this.config.demo?.maxDay ?? 10;
  }

  get nearDeathCost() {
    return this.config.nearDeath?.suppliesCost ?? 30;
  }

  /** 计算进入某天时的物资消耗明细 */
  calculateDaySuppliesCost(day, state, dayDef) {
    const breakdown = [];
    let total = 0;

    const base = this._resolveBaseDayCost(day, dayDef, state);
    if (base > 0) {
      breakdown.push({ label: `第 ${day} 天基础消耗`, amount: base });
      total += base;
    } else if (base === 0 && dayDef?.suppliesCost === 0) {
      breakdown.push({ label: `第 ${day} 天`, amount: 0, note: '不消耗物资' });
    }

    const partnerCfg = this.config.daySuppliesCost?.partnerSuppliesPerDay ?? {};
    for (const pid of state.partners) {
      const perDay = partnerCfg[pid] ?? this.partnersById[pid]?.suppliesPerDay ?? 0;
      if (perDay > 0) {
        const name = this.partnersById[pid]?.name ?? pid;
        breakdown.push({ label: `伙伴·${name}`, amount: perDay });
        total += perDay;
      }
    }

    for (const mod of this.config.daySuppliesCost?.itemModifiers ?? []) {
      if (state.items.includes(mod.item)) {
        breakdown.push({ label: `物品·${mod.item}`, amount: mod.suppliesPerDay });
        total += mod.suppliesPerDay;
      }
    }

    const accField = this.config.daySuppliesCost?.accumulateEffectField;
    if (accField && state[accField]) {
      breakdown.push({ label: '状态修正', amount: state[accField] });
      total += state[accField];
    }

    return { total: Math.max(0, total), breakdown };
  }

  _resolveBaseDayCost(day, dayDef, state) {
    if (dayDef && this.config.daySuppliesCost?.useDayDefinitionWhenPresent) {
      // 救世主线 80 天后进入结局段（85/90 等 routeOnly 天）不再扣基础日耗；亚当夏娃线仍按 suppliesCost
      if (
        dayDef.routeOnly &&
        day > 80 &&
        (state?.route === 'savior' || state?.route === 'savior_zombie')
      ) {
        return 0;
      }
      if (dayDef.suppliesCost != null) return dayDef.suppliesCost;
    }
    for (const tier of this.config.daySuppliesCost?.fallbackTiers ?? []) {
      if (day >= tier.fromDay && day <= tier.toDay) return tier.base;
    }
    return 0;
  }

  canAffordSupplies(state, amount) {
    return state.stats.supplies >= amount;
  }

  canAffordCost(state, cost) {
    if (!cost) return true;
    if (cost.ammo && state.stats.ammo < cost.ammo) return false;
    if (cost.supplies && state.stats.supplies < cost.supplies) return false;
    return true;
  }

  /**
   * 支付选项消耗；若肾上腺素生效则跳过并消耗一次效果
   * @returns {{ paid: boolean, usedAdrenaline: boolean, immune: boolean }}
   */
  _hasMeaningfulCost(cost) {
    if (!cost) return false;
    return (cost.ammo ?? 0) > 0 || (cost.supplies ?? 0) > 0;
  }

  payChoiceCost(state, cost) {
    if (!this._hasMeaningfulCost(cost)) {
      return { paid: true, usedAdrenaline: false, immune: false };
    }

    const adrenalineItem = '肾上腺素';
    // 手册：使用后下一次「有消耗的选择」免费；无消耗选项不消耗肾上腺素
    if (state.items.includes(adrenalineItem)) {
      state.items = state.items.filter((i) => i !== adrenalineItem);
      state.adrenalineCharges = 0;
      return { paid: true, usedAdrenaline: true, immune: true };
    }

    if (!this.canAffordCost(state, cost)) {
      return { paid: false, usedAdrenaline: false, immune: false };
    }

    if (cost.ammo) state.stats.ammo -= cost.ammo;
    if (cost.supplies) state.stats.supplies -= cost.supplies;
    this.clampStats(state);
    return { paid: true, usedAdrenaline: false, immune: false };
  }

  /** 进入新一天：扣物资。不足时返回处理方式 */
  tryEnterDay(day, state, dayDef) {
    const { total, breakdown } = this.calculateDaySuppliesCost(day, state, dayDef);

    if (total <= 0) {
      return { ok: true, paid: 0, breakdown };
    }

    if (state.stats.supplies >= total) {
      state.stats.supplies -= total;
      this.clampStats(state);
      return { ok: true, paid: total, breakdown };
    }

    return {
      ok: false,
      need: total,
      breakdown,
      shortage: total - state.stats.supplies,
    };
  }

  shouldOfferCompanionToSupplies(state) {
    const cfg = this.config.companionToSupplies;
    if (!cfg?.enabled) return false;
    if (!state.partners?.length) return false;
    return true;
  }

  payNearDeathSkip(state) {
    const cost = this.nearDeathCost;
    if (state.stats.supplies < cost) {
      return { ok: false, reason: '物资不足以脱离濒死' };
    }
    state.stats.supplies -= cost;
    this.clampStats(state);
    return { ok: true, paid: cost };
  }

  clampStats(state) {
    const minAmmo = this.config.stats?.ammoMinimum ?? 0;
    if (state.stats.ammo < minAmmo) state.stats.ammo = minAmmo;
    if (state.stats.supplies < 0) state.stats.supplies = 0;

    const hMin = this.config.stats?.humanityMin;
    const hMax = this.config.stats?.humanityMax;
    if (hMin != null && state.stats.humanity < hMin) state.stats.humanity = hMin;
    if (hMax != null && state.stats.humanity > hMax) state.stats.humanity = hMax;
  }

  /** 获得物品时注册被动效果 */
  onItemAcquired(state, itemName) {
    const itemRules = this.config.items?.[itemName];
    if (!itemRules) return;

    // 肾上腺素在 payChoiceCost 中于首次有消耗的选择时自动消耗，不在获得时预激活
  }

  hasAdrenalineReady(state) {
    return state.items.includes('肾上腺素');
  }

  /** 累计物资消耗修正（供暖装置等通过 effects.suppliesCostModifier 写入 state） */
  applySuppliesCostModifier(state, delta) {
    const field = this.config.daySuppliesCost?.accumulateEffectField ?? 'suppliesCostModifier';
    state[field] = (state[field] || 0) + delta;
  }

  onExploreCompleted(state) {
    if (!this.config.explore?.countRandomExploreFor末世之王) return;
    state.exploreEventCount = (state.exploreEventCount || 0) + 1;
  }

  /** 是否因「转化为物资」类选项（人性光芒判定） */
  trackChoiceForRules(choice, state) {
    const cfg = this.config.tracking?.convertToSupplies;
    if (!cfg) return;

    const text = choice.text || '';
    const keywords = cfg.choiceTextKeywords ?? [];
    if (keywords.some((k) => text.includes(k))) {
      state.choseConvertToSupplies = true;
    }
    if (choice.effects?.addTagSilentIfDuplicate === '底线') {
      state.choseConvertToSupplies = true;
    }
  }

  shouldSkipDayActions(state) {
    return Boolean(state.skipNextDayActions);
  }

  clearDayActionFlags(state) {
    state.skipNextDayActions = false;
  }

  getHostReminder(day) {
    const list = this.config.hostReminders ?? [];
    return list.filter((r) => day >= r.fromDay).map((r) => r.message).pop() || null;
  }

  /** 结算前自动词条（占位：完整结算在结局阶段调用） */
  getAutoTagsForState(state, context = {}) {
    const granted = [];
    const auto = this.config.tags?.autoGrant ?? [];

    for (const rule of auto) {
      if (rule.when === 'gameOverInsufficientSupplies' && context.gameOver) {
        granted.push(rule.tagId);
      }
      if (rule.when === 'neverChoseConvertToSupplies' && context.survived && !state.choseConvertToSupplies) {
        granted.push(rule.tagId);
      }
      if (rule.when === 'exploreEventCountGte') {
        const n = rule.value ?? 7;
        if ((state.exploreEventCount || 0) >= n) granted.push(rule.tagId);
      }
    }
    return granted;
  }

  formatBreakdown(breakdown) {
    return breakdown
      .map((b) => {
        if (b.amount === 0) return b.note || b.label;
        const sign = b.amount > 0 ? `-${b.amount}` : `+${Math.abs(b.amount)}`;
        return `${b.label} ${sign}`;
      })
      .join('；');
  }
}
