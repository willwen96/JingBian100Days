import { describe, expect, it } from 'vitest';

import { GameRules } from '../demo/js/rules.js';
import { loadFixtureData } from './helpers/load-data.js';

const fixture = await loadFixtureData();

function createState(overrides = {}) {
  return {
    day: 10,
    stats: { humanity: 50, supplies: 100, ammo: 20 },
    partners: [],
    items: [],
    suppliesCostModifier: 0,
    skipNextDayActions: false,
    exploreEventCount: 0,
    choseConvertToSupplies: false,
    ...overrides,
  };
}

describe('GameRules', () => {
  const rules = new GameRules(fixture.rules, fixture.partners);

  it('calculates day supplies cost with partners, items, and modifiers', () => {
    const state = createState({
      partners: ['blake'],
      items: ['供暖装置'],
    });
    const dayDef = fixture.days.find((d) => d.day === 10);

    const result = rules.calculateDaySuppliesCost(10, state, dayDef);

    expect(result.total).toBe(20);
    expect(result.breakdown.map((b) => b.label)).toEqual([
      '第 10 天基础消耗',
      '伙伴·布莱克',
      '物品·供暖装置',
    ]);
  });

  it('consumes adrenaline only on meaningful cost', () => {
    const state = createState({
      items: ['肾上腺素'],
      stats: { humanity: 50, supplies: 30, ammo: 10 },
    });

    const free = rules.payChoiceCost(state, null);
    expect(free.usedAdrenaline).toBe(false);
    expect(state.items).toEqual(['肾上腺素']);

    const paid = rules.payChoiceCost(state, { ammo: 5 });
    expect(paid.usedAdrenaline).toBe(true);
    expect(state.stats.ammo).toBe(10);
    expect(state.items).toEqual([]);
  });

  it('returns insufficient result when next day cost cannot be paid', () => {
    const state = createState({
      stats: { humanity: 50, supplies: 3, ammo: 10 },
    });
    const dayDef = fixture.days.find((d) => d.day === 20);

    const result = rules.tryEnterDay(20, state, dayDef);

    expect(result.ok).toBe(false);
    expect(result.need).toBe(15);
    expect(result.shortage).toBe(12);
  });

  it('waives base day cost for savior routes on post-80 routeOnly days', () => {
    const day90 = fixture.days.find((d) => d.day === 90);
    const day85 = fixture.days.find((d) => d.day === 85);

    expect(
      rules.calculateDaySuppliesCost(90, createState({ route: 'savior' }), day90).total
    ).toBe(0);
    expect(
      rules.calculateDaySuppliesCost(85, createState({ route: 'savior_zombie' }), day85).total
    ).toBe(0);
    expect(
      rules.calculateDaySuppliesCost(90, createState({ route: 'adam_eve' }), day90).total
    ).toBe(20);
    expect(
      rules.calculateDaySuppliesCost(85, createState({ route: 'adam_eve' }), day85).total
    ).toBe(20);
  });

  it('derives auto tags from final state context', () => {
    const state = createState({
      exploreEventCount: 7,
      choseConvertToSupplies: false,
    });

    const tags = rules.getAutoTagsForState(state, { survived: true });

    expect(tags).toContain('人性的光芒');
    expect(tags).toContain('末世之王');
  });

  it('clamps supplies to zero when effects would go negative', () => {
    const state = createState({ stats: { humanity: 50, supplies: 5, ammo: 10 } });
    state.stats.supplies -= 20;
    rules.clampStats(state);
    expect(state.stats.supplies).toBe(0);
  });
});
