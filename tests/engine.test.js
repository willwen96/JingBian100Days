import { describe, expect, it } from 'vitest';

import { GameEngine } from '../demo/js/engine.js';
import { GameRules } from '../demo/js/rules.js';
import { loadFixtureData } from './helpers/load-data.js';

const fixture = await loadFixtureData();

function createEngine() {
  return new GameEngine(fixture);
}

/** 第 80 天决策测试用：弹药/物资充足，默认别墅庇护所 */
function setupDay80({
  partners = [],
  tags = [],
  flags = {},
  ammo = 50,
  supplies = 999,
  shelter = 'villa',
} = {}) {
  const engine = createEngine();
  engine.state.mode = 'day';
  engine.state.day = 80;
  engine.state.shelter = shelter;
  engine.state.partners = [...partners];
  engine.state.tags = [...tags];
  engine.state.flags = { ...engine.state.flags, ...flags };
  engine.state.stats.ammo = ammo;
  engine.state.stats.supplies = supplies;
  return engine;
}

function advanceToNextMilestone(engine) {
  return engine._advanceDay();
}

describe('GameEngine', () => {
  it('skips removed demo placeholder days when advancing', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 5;
    engine.state.stats.supplies = 999;

    engine._advanceDay();

    expect(engine.state.day).toBe(10);
  });

  it('shows radio content even when first listened on a later day', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 15;
    engine.state.items = ['收音机'];
    engine.state.stats.supplies = 999;

    const result = engine.pickChoice('radio');

    expect(result.ok).toBe(true);
    expect(engine.state.lastChoiceOutcome?.text).toContain('约翰博士正在想办法制造丧尸病毒血清');
  });

  it('disables fixed events after they are blacklisted', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 20;
    engine.state.disabledFixedEvents.push('dawn_camp');

    const view = engine.getView();
    const dawnCamp = view.choices.find((choice) => choice.id === 'dawn_camp');

    expect(dawnCamp.disabled).toBe(true);
    expect(dawnCamp.hint).toContain('此地已不再欢迎你');
  });

  it('applies area on-enter effects for exploration spots like hospital', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 10;
    engine.state.stats.supplies = 0;

    const result = engine.pickExploreArea('hospital');

    expect(result.ok).toBe(true);
    expect(engine.state.mode).toBe('explore');
    expect(engine.state.stats.supplies).toBe(30);
    expect(engine.state.lastSceneOutcome?.text).toContain('药局找到了一些抗生素');
  });

  it('hides evelyn co-explore areas before day 45 even with evelyn partner', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 40;
    engine.state.partners = ['evelyn'];
    engine.state.flags.evelynEventDone = true;
    engine.state.stats.supplies = 100;

    engine.pickChoice('explore');
    const areas = engine.getView().areas.map((area) => area.id);
    expect(areas).not.toContain('inn_evelyn');
    expect(areas).not.toContain('library_evelyn');

    engine.state.mode = 'day';
    engine.state.day = 45;
    engine.state.flags.evelynEventDone = true;
    engine.state.explore = null;
    engine.pickChoice('explore');
    const day45Areas = engine.getView().areas.map((area) => area.id);
    expect(day45Areas).toContain('inn_evelyn');
    expect(day45Areas).toContain('library_evelyn');
  });

  it('removes explored areas from future exploration choices', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 10;
    engine.state.stats.supplies = 100;

    const firstPick = engine.pickExploreArea('hospital');
    expect(firstPick.ok).toBe(true);
    expect(engine.state.closedExploreAreas).toContain('hospital');

    engine.state.mode = 'explore_pick';
    engine.state.explore = null;
    const areas = engine.getView().areas.map((area) => area.id);
    expect(areas).not.toContain('hospital');
    expect(engine.pickExploreArea('hospital').error).toBe('该区域已不可用');
  });

  it('marks day 10 stay_home special only when a partner branch is active', () => {
    const plain = createEngine();
    plain.state.mode = 'day';
    plain.state.day = 10;
    plain.state.shelter = 'villa';

    const plainChoice = plain.getView().choices.find((choice) => choice.id === 'stay_home');
    expect(plainChoice.special).toBe(false);

    const withBlake = createEngine();
    withBlake.state.mode = 'day';
    withBlake.state.day = 10;
    withBlake.state.shelter = 'villa';
    withBlake.state.partners = ['blake'];

    const blakeChoice = withBlake.getView().choices.find((choice) => choice.id === 'stay_home');
    expect(blakeChoice.special).toBe(true);
  });

  it('triggers lime event only once, then day 25 explore returns to normal exploration', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 20;
    engine.state.partners = ['lime'];
    engine.state.stats.supplies = 999;

    const day20Explore = engine.getView().choices.find((choice) => choice.id === 'explore');
    expect(day20Explore.special).toBe(true);

    const result = engine.pickChoice('explore');
    expect(result.ok).toBe(true);
    expect(engine.state.event?.id).toBe('lime');
    expect(engine.state.flags.limeEventDone).toBe(true);

    engine.state.mode = 'day';
    engine.state.day = 25;
    engine.state.event = null;

    const day25Explore = engine.getView().choices.find((choice) => choice.id === 'explore');
    expect(day25Explore.special).toBe(false);

    const day25Result = engine.pickChoice('explore');
    expect(day25Result.ok).toBe(true);
    expect(engine.state.mode).toBe('explore_pick');
    expect(engine.state.event).toBe(null);
  });

  it('routes lime event branches to handbook node A with full text', () => {
    const engine = createEngine();
    const limeEvent = fixture.events.find((event) => event.id === 'lime');
    const police = limeEvent.nodes.find((node) => node.id === 'start').choices.find((choice) => choice.id === 'police');
    const supermarket = limeEvent.nodes.find((node) => node.id === 'start').choices.find((choice) => choice.id === 'supermarket');
    const nodeA = limeEvent.nodes.find((node) => node.id === 'A');

    expect(police.goto.nodeId).toBe('A');
    expect(supermarket.goto.nodeId).toBe('A');
    expect(nodeA.narrative).toContain('某住宅区燃起了大火');
    expect(nodeA.choices.find((choice) => choice.id === 'save_lime').resultText).toContain('丧尸居然会利用人性布置陷阱');
  });

  it('uses shared handbook nodes for evelyn and applies mall supplies to state', () => {
    const evelynEvent = fixture.events.find((event) => event.id === 'evelyn');
    expect(evelynEvent.nodes.map((node) => node.id)).toEqual([
      'mall', 'rescue_zombies', 'after_rescue', 'invite_talk',
    ]);

    const engine = createEngine();

    // Simulate entering the mall node (which triggers onEnterEffects: +30 supplies)
    engine.state.mode = 'event';
    engine.state.event = { id: 'evelyn', nodeId: 'mall' };
    engine.state.stats.supplies = 30;
    engine.state.stats.ammo = 99;

    // Picking rescue: -10 supplies, setFlag, goto rescue_zombies
    engine.pickChoice('rescue');
    expect(engine.state.stats.supplies).toBe(20);
    expect(engine.state.event.nodeId).toBe('rescue_zombies');
    expect(engine.state.flags.evelyn_rescued).toBe(true);

    // Input 5: cost 5 ammo, gain 10 ammo → net +5
    const ammoBefore = engine.state.stats.ammo;
    engine.pickChoiceWithInput('kill_custom', 5);
    expect(engine.state.stats.ammo).toBe(ammoBefore - 5 + 10);
    expect(engine.state.event.nodeId).toBe('after_rescue');

    engine.pickChoice('invite');
    expect(engine.state.event.nodeId).toBe('invite_talk');

    engine.pickChoice('protect');
    expect(engine.state.partners).toContain('evelyn');
    expect(engine.state.tags).toContain('承诺');
    expect(engine.state.flags.evelyn_rescued).toBeUndefined();
  });

  it('validates numeric input choices before applying dynamic cost/effects', () => {
    const engine = createEngine();
    engine.state.mode = 'event';
    engine.state.event = { id: 'evelyn', nodeId: 'rescue_zombies' };
    engine.state.stats.ammo = 4;

    expect(engine.pickChoiceWithInput('kill_custom', 0).error).toContain('1-10');
    expect(engine.pickChoiceWithInput('kill_custom', 5).error).toBe('资源不足');

    const ok = engine.pickChoiceWithInput('kill_custom', 4);
    expect(ok.ok).toBe(true);
    expect(engine.state.stats.ammo).toBe(8);
    expect(engine.state.lastChoiceOutcome?.text).toContain('最后的 4 只丧尸');
  });

  it('allows evelyn rescue at mall with no ammo and uses retreat_no_ammo at rescue_zombies', () => {
    const engine = createEngine();
    engine.state.mode = 'event';
    engine.state.event = { id: 'evelyn', nodeId: 'mall' };
    engine.state.stats.ammo = 0;
    engine.state.stats.supplies = 50;

    const mallChoices = engine.getView().choices.map((choice) => choice.id);
    expect(mallChoices).toContain('rescue');

    const enter = engine.pickChoice('rescue');
    expect(enter.ok).toBe(true);
    expect(engine.state.event.nodeId).toBe('rescue_zombies');
    expect(engine.state.flags.evelyn_rescued).toBe(true);
    expect(engine.state.stats.supplies).toBe(40);

    const zombieChoices = engine.getView().choices.map((choice) => choice.id);
    expect(zombieChoices).toEqual(['retreat_no_ammo']);

    const ok = engine.pickChoice('retreat_no_ammo');
    expect(ok.ok).toBe(true);
    expect(engine.state.event.nodeId).toBe('after_rescue');
  });

  it('offers retreat at rescue_zombies when ammo is depleted', () => {
    const engine = createEngine();
    engine.state.mode = 'event';
    engine.state.event = { id: 'evelyn', nodeId: 'rescue_zombies' };
    engine.state.stats.ammo = 0;

    const ids = engine.getView().choices.map((choice) => choice.id);
    expect(ids).toEqual(['retreat_no_ammo']);

    const ok = engine.pickChoice('retreat_no_ammo');
    expect(ok.ok).toBe(true);
    expect(engine.state.event.nodeId).toBe('after_rescue');
  });

  it('preserves evelyn ending text when day 38 onEnter harvest runs', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 35;
    engine.state.shelter = 'bunker';
    engine.state.flags = { mushroomPlanted: true, evelynEventDone: true };
    engine.state.stats.supplies = 999;
    engine.state.stats.ammo = 10;
    engine.state.mode = 'event';
    engine.state.event = { id: 'evelyn', nodeId: 'after_rescue' };

    engine.pickChoice('ask_gear');
    expect(engine.state.day).toBe(38);
    expect(engine.state.lastChoiceOutcome?.text).toContain('周末愉快');
    expect(engine.state.lastSceneOutcome?.text).toContain('菌类已经长成');
    expect(engine.state.flags.mushroomHarvested).toBe(true);
  });

  it('does not show ammo cost on evelyn ignore before selection', () => {
    const engine = createEngine();
    engine.state.mode = 'event';
    engine.state.event = { id: 'evelyn', nodeId: 'mall' };
    engine.state.stats.ammo = 10;

    const ignore = engine.getView().choices.find((choice) => choice.id === 'ignore');
    expect(ignore).toBeTruthy();
    expect(ignore.disabled).toBe(false);
    expect(ignore.hint ?? '').not.toMatch(/弹药/);
  });

  it('applies evelyn ignore branch cost and falls back to near-death when ammo is insufficient', () => {
    const enoughAmmo = createEngine();
    enoughAmmo.state.mode = 'event';
    enoughAmmo.state.event = { id: 'evelyn', nodeId: 'mall' };
    enoughAmmo.state.day = 20;
    enoughAmmo.state.stats.ammo = 5;
    enoughAmmo.state.stats.supplies = 100;

    const ok = enoughAmmo.pickChoice('ignore');
    expect(ok.ok).toBe(true);
    expect(enoughAmmo.state.stats.ammo).toBe(0);
    expect(enoughAmmo.state.event.nodeId).toBe('after_rescue');
    expect(enoughAmmo.state.lastCostLog).toBeNull();
    expect(enoughAmmo.state.lastChoiceOutcome?.effects).toContain('弹药 -5');

    const lowAmmo = createEngine();
    lowAmmo.state.mode = 'event';
    lowAmmo.state.event = { id: 'evelyn', nodeId: 'mall' };
    lowAmmo.state.day = 20;
    lowAmmo.state.stats.ammo = 4;
    lowAmmo.state.stats.supplies = 100;

    const failBranch = lowAmmo.pickChoice('ignore');
    expect(failBranch.nearDeath).toBe(true);
    expect(lowAmmo.state.pendingNearDeath).toBe(true);
    expect(lowAmmo.state.stats.ammo).toBe(4);
  });

  it('returns to same-day choices when leaving dawn camp', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 20;
    engine.state.stats.supplies = 100;

    const dawnCamp = engine.getView().choices.find((c) => c.id === 'dawn_camp');
    expect(dawnCamp?.special).toBe(false);

    const enter = engine.pickChoice('dawn_camp');
    expect(enter.ok).toBe(true);
    expect(engine.state.mode).toBe('event');
    expect(engine.state.event?.id).toBe('dawn_camp');

    const leave = engine.pickChoice('home');
    expect(leave.ok).toBe(true);
    expect(engine.state.mode).toBe('day');
    expect(engine.state.day).toBe(20);
    expect(engine.state.event).toBe(null);

    const dayChoices = engine.getView().choices.map((choice) => choice.id);
    expect(dayChoices).toContain('explore');
    expect(dayChoices).toContain('dawn_camp');
  });

  it('allows dawn camp at 0 supplies after day cost (day 45 scenario)', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 45;
    engine.state.stats.supplies = 0;
    engine.state.stats.ammo = 10;

    const enter = engine.pickChoice('dawn_camp');
    expect(enter.ok).toBe(true);
    expect(enter.gameOver).toBeFalsy();
    expect(engine.state.mode).toBe('event');
    expect(engine.state.event?.id).toBe('dawn_camp');

    const trade = engine.pickChoice('ammo_to_supplies');
    expect(trade.ok).toBe(true);
    expect(engine.state.stats.supplies).toBe(10);
    expect(engine.state.stats.ammo).toBe(5);
  });

  it('still game overs when a choice newly depletes supplies to 0', () => {
    const engine = createEngine();
    engine.state.mode = 'event';
    engine.state.event = { id: 'dawn_camp', nodeId: 'hub' };
    engine.state.day = 45;
    engine.state.stats.supplies = 5;

    const choice = engine.getView().choices.find((c) => c.id === 'supplies_to_ammo');
    expect(choice.disabled).toBe(true);
    expect(choice.hint).toContain('资源不足');
  });

  it('hides explore_with_evelyn on day 65 when mall_heartbeat was already completed', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 65;
    engine.state.partners = ['evelyn'];
    engine.state.stats.supplies = 999;
    engine.state.closedExploreAreas.push('mall_heartbeat');

    const ids = engine.getView().choices.map((choice) => choice.id);
    expect(ids).not.toContain('explore_with_evelyn');
    expect(engine.pickChoice('explore_with_evelyn').error).toBeTruthy();
  });

  it('closes hope bar when refusing chris', () => {
    const engine = createEngine();
    engine.state.mode = 'event';
    engine.state.event = { id: 'chris', nodeId: 'start' };
    engine.state.day = 25;
    engine.state.stats.supplies = 100;

    const result = engine.pickChoice('refuse');
    expect(result.ok).toBe(true);
    expect(engine.state.closedExploreAreas).toContain('hope_bar');
  });

  it('entering evelyn event via engine applies mall onEnterEffects (+30 supplies)', () => {
    const engine = createEngine();
    engine.state.stats.supplies = 50;
    engine.state.stats.ammo = 20;
    engine.state.mode = 'day';
    engine.state.day = 1;

    // Directly enter the evelyn event (simulating a goto)
    engine._enterEvent('evelyn', 'mall');
    expect(engine.state.stats.supplies).toBe(80); // 50 + 30
    expect(engine.state.lastSceneOutcome?.effects?.length || engine.state.lastSceneOutcome?.text).toBeTruthy();
  });

  it('extends playable days beyond day 30 and advances to day 35', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 30;
    engine.state.stats.supplies = 999;

    engine._advanceDay();

    expect(engine.state.day).toBe(35);
    expect(engine.getView().title).toBe('惊变三十五天');
  });

  it('triggers the evelyn event only once across days 35, 40, and 45', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 35;
    engine.state.stats.supplies = 999;

    const firstExplore = engine.pickChoice('explore');
    expect(firstExplore.ok).toBe(true);
    expect(engine.state.event?.id).toBe('evelyn');
    expect(engine.state.flags.evelynEventDone).toBe(true);

    engine.state.mode = 'day';
    engine.state.day = 40;
    engine.state.event = null;

    const secondExplore = engine.pickChoice('explore');
    expect(secondExplore.ok).toBe(true);
    expect(engine.state.mode).toBe('explore_pick');
    expect(engine.state.event).toBe(null);
  });

  it('offers airdrop radio content once, then go_airdrop until completed', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 35;
    engine.state.items = ['收音机'];
    engine.state.stats.supplies = 999;
    engine.state.stats.ammo = 0;

    const before = engine.getView().choices.map((choice) => choice.id);
    expect(before).toContain('radio_airdrop');
    expect(before).not.toContain('go_airdrop');

    const heard = engine.pickChoice('radio_airdrop');
    expect(heard.ok).toBe(true);
    expect(engine.state.event?.id).toBe('radio_airdrop_prompt');
    expect(engine.state.flags.airdropBroadcastHeard).toBe(true);

    const declined = engine.pickChoice('no');
    expect(declined.ok).toBe(true);
    expect(engine.state.mode).toBe('day');

    const afterDecline = engine.getView().choices.map((choice) => choice.id);
    expect(afterDecline).not.toContain('radio_airdrop');
    expect(afterDecline).toContain('go_airdrop');

    engine.state.day = 40;
    engine.state.stats.ammo = 15;
    const onDay40 = engine.getView().choices.map((choice) => choice.id);
    expect(onDay40).toContain('go_airdrop');

    engine.pickChoice('go_airdrop');
    expect(engine.state.event?.id).toBe('airdrop');

    const partial = engine.pickChoice('partial');
    expect(partial.ok).toBe(true);
    expect(engine.state.flags.airdropCompleted).toBe(true);

    engine.state.mode = 'day';
    engine.state.day = 45;
    engine.state.event = null;
    const afterComplete = engine.getView().choices.map((choice) => choice.id);
    expect(afterComplete).not.toContain('go_airdrop');
  });

  it('distinguishes the day 35 airdrop broadcast from the old radio message and marks it special', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 35;
    engine.state.items = ['收音机'];
    engine.state.stats.supplies = 999;

    const view = engine.getView();
    const airdropChoice = view.choices.find((choice) => choice.id === 'radio_airdrop');

    expect(view.choices.map((choice) => choice.id)).not.toContain('radio');
    expect(airdropChoice).toBeTruthy();
    expect(airdropChoice.text).toBe('收音机的新内容');
    expect(airdropChoice.special).toBe(true);
    expect(airdropChoice.hint).toContain('仅可触发一次');

    const result = engine.pickChoice('radio_airdrop');
    expect(result.ok).toBe(true);
    expect(engine.state.event?.id).toBe('radio_airdrop_prompt');
    expect(engine.getView().narrative).toContain('192.163');

    const yes = engine.pickChoice('yes');
    expect(yes.ok).toBe(true);
    expect(engine.state.event?.id).toBe('airdrop');
  });

  it('day 38 with luna offers only the mandatory military base choice', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 38;
    engine.state.shelter = 'bunker';
    engine.state.partners = ['luna'];
    engine.state.stats.supplies = 999;

    const view = engine.getView();
    expect(view.choices.map((choice) => choice.id)).toEqual(['luna_day38']);
    expect(view.narrative).toContain('军事基地');
    expect(view.choices[0].special).toBe(true);

    const result = engine.pickChoice('luna_day38');
    expect(result.ok).toBe(true);
    expect(engine.state.event?.id).toBe('luna_day38');
  });

  it('day 38 without luna only allows a peaceful day', () => {
    const bunker = createEngine();
    bunker.state.mode = 'day';
    bunker.state.day = 38;
    bunker.state.shelter = 'bunker';
    bunker.state.stats.supplies = 999;

    const bunkerIds = bunker.getView().choices.map((choice) => choice.id);
    expect(bunkerIds).toEqual(['stay_peaceful_bunker']);
    expect(bunker.getView().narrative).toContain('没有外出');

    const villa = createEngine();
    villa.state.mode = 'day';
    villa.state.day = 38;
    villa.state.shelter = 'villa';
    villa.state.partners = ['luna'];
    villa.state.stats.supplies = 999;

    const villaIds = villa.getView().choices.map((choice) => choice.id);
    expect(villaIds).toEqual(['stay_peaceful_villa']);
  });

  it('entering day 38 costs no supplies even with partners (handbook: 不消耗物资)', () => {
    const rules = new GameRules(fixture.rules, fixture.partners);
    const day38 = fixture.days.find((d) => d.day === 38);

    const withLuna = {
      day: 37,
      stats: { humanity: 50, supplies: 100, ammo: 20 },
      partners: ['luna'],
      items: [],
      suppliesCostModifier: 0,
    };
    expect(rules.calculateDaySuppliesCost(38, withLuna, day38).total).toBe(0);

    const bunkerBlake = { ...withLuna, partners: ['blake'] };
    expect(rules.calculateDaySuppliesCost(38, bunkerBlake, day38).total).toBe(0);

    const villaEvelyn = {
      ...withLuna,
      partners: ['evelyn', 'lime'],
      shelter: 'villa',
    };
    expect(rules.calculateDaySuppliesCost(38, villaEvelyn, day38).total).toBe(0);

    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 37;
    engine.state.shelter = 'bunker';
    engine.state.partners = ['luna'];
    engine.state.stats.supplies = 100;
    engine._advanceDay();
    expect(engine.state.day).toBe(38);
    expect(engine.state.stats.supplies).toBe(100);
  });

  it('starting evelyn from day explore shows mall onEnter supplies in scene outcome', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 35;
    engine.state.shelter = 'bunker';
    engine.state.stats.supplies = 50;
    engine.state.stats.ammo = 20;

    engine.pickChoice('explore');

    expect(engine.state.event?.id).toBe('evelyn');
    expect(engine.state.stats.supplies).toBe(80);
    const view = engine.getView();
    expect(view.sceneOutcome?.effects).toContain('物资 +30');
    expect(view.sceneOutcome?.text).toContain('物资');
  });

  it('applies day 35 handbook onEnter when player already has a radio', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 30;
    engine.state.items = ['收音机'];
    engine.state.stats.supplies = 999;

    engine._advanceDay();

    expect(engine.state.day).toBe(35);
    expect(engine.state.stats.supplies).toBe(999);
    expect(engine.state.lastSceneOutcome?.text).toContain('灰色的雪');
  });

  it('resolves chris lend with handbook rewards when serena is alive', () => {
    const engine = createEngine();
    engine.state.mode = 'event';
    engine.state.event = { id: 'chris', nodeId: 'start' };
    engine.state.stats.supplies = 100;
    engine.state.flags = { serena_alive: true };

    const lend = engine.pickChoice('lend');
    expect(lend.ok).toBe(true);
    expect(engine.state.tags).toContain('约定');
    expect(engine.state.stats.supplies).toBe(140);
    expect(engine.state.stats.ammo).toBe(20);
    expect(engine.state.flags.chrisResolved).toBe(true);
  });

  it('resolves chris lend with guilt path when serena is dead', () => {
    const engine = createEngine();
    engine.state.mode = 'event';
    engine.state.event = { id: 'chris', nodeId: 'start' };
    engine.state.stats.supplies = 100;
    engine.state.flags = { serena_dead: true };

    const lend = engine.pickChoice('lend');
    expect(lend.ok).toBe(true);
    expect(engine.state.event).toEqual({ id: 'chris', nodeId: 'guilt' });

    const silent = engine.pickChoice('silent');
    expect(silent.ok).toBe(true);
    expect(engine.state.tags).toContain('善良的人');
  });

  it('adds heating device once and reduces later day supply cost', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 55;
    engine.state.stats.supplies = 100;
    engine.state.stats.ammo = 20;

    const heating = engine.pickChoice('heating');
    expect(heating.ok).toBe(true);
    expect(engine.state.items).toContain('供暖装置');
    expect(engine.state.stats.ammo).toBe(10);
    expect(engine.state.suppliesCostModifier).toBe(0);

    engine.state.mode = 'day';
    engine.state.day = 60;

    const day60 = fixture.days.find((day) => day.day === 60);
    const preview = engine.rules.calculateDaySuppliesCost(60, engine.state, day60);
    expect(preview.total).toBe(15);
    expect(preview.breakdown.map((b) => b.label)).toEqual([
      '第 60 天基础消耗',
      '物品·供暖装置',
    ]);

    const choices = engine.getView().choices.map((choice) => choice.id);
    expect(choices).not.toContain('heating');
  });

  it('adds hero camp as a special day 70 choice', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 70;
    engine.state.stats.supplies = 999;

    const heroCamp = engine.getView().choices.find((choice) => choice.id === 'hero_camp');
    expect(heroCamp).toBeTruthy();
    expect(heroCamp.special).toBe(true);
  });

  describe('day 80 → ending routes', () => {
    it('shows save / dont_save on day 80 without auto-goto', () => {
      const engine = setupDay80();
      engine.state.day = 75;
      engine._advanceDay();

      expect(engine.state.day).toBe(80);
      expect(engine.state.mode).toBe('day');
      expect(engine.getView().choices.map((c) => c.id)).toEqual(['save', 'dont_save']);
    });

    describe('lone wolf（不救）', () => {
      it('solo dont_save → lone_wolf，+10000 物资，下一里程碑为第 100 天', () => {
        const engine = setupDay80();
        const result = engine.pickChoice('dont_save');

        expect(result.ok).toBe(true);
        expect(engine.state.route).toBe('lone_wolf');
        expect(engine.state.flags.day80Resolved).toBe(true);
        expect(engine.state.stats.supplies).toBe(10999);
        expect(engine._getNextPlayableDay(80)).toBe(100);
        expect(engine._getNextPlayableDay(80)).not.toBe(85);
      });

      it('有伊芙琳时 dont_save → 失去伙伴并获得《自私的胆小鬼》', () => {
        const engine = setupDay80({ partners: ['evelyn'] });
        engine.pickChoice('dont_save');

        expect(engine.state.route).toBe('lone_wolf');
        expect(engine.state.partners).not.toContain('evelyn');
        expect(engine.state.tags).toContain('自私的胆小鬼');
      });

      it('从第 80 天不救一路推进至独狼大结局', () => {
        const engine = setupDay80({ shelter: 'villa' });
        engine.pickChoice('dont_save');

        expect(engine.state.day).toBe(100);
        expect(engine.state.event?.id).toBe('lone_wolf_100');
        expect(engine.getView().narrative).toContain('你已经适应了独自生存');
        expect(engine.getView().narrative).toContain('腌肉和咸菜');

        engine.pickChoice('fortress_tag');
        const end = engine.pickChoice('end');

        expect(end.demoComplete).toBe(true);
        expect(engine.getView().finaleNarrative).toContain('处心积虑的活着');
        expect(engine.getView().finaleNarrative).toContain('到底在扮演什么角色');
        expect(engine.state.tags).toContain('孤独堡垒');
        expect(engine.state.tags).toContain('尼奥之死');
        expect(engine.state.endingScore?.finaleTag?.id).toBe('尼奥之死');
      });
    });

    describe('savior（独行救约翰）', () => {
      it('save solo → 进入 savior_pre', () => {
        const engine = setupDay80();
        engine.pickChoice('save');

        expect(engine.state.stats.ammo).toBe(20);
        expect(engine.state.event?.id).toBe('savior_pre');
        expect(engine.state.event?.nodeId).toBe('solo');
      });

      it('savior_pre 无《穿越者》→ 跳过第 85 天直达第 90 天血清事件', () => {
        const engine = setupDay80();
        const suppliesBefore = engine.state.stats.supplies;
        engine.pickChoice('save');
        engine.pickChoice('bitten');

        expect(engine.state.route).toBe('savior');
        expect(engine.state.day).toBe(90);
        expect(engine.state.stats.supplies).toBe(suppliesBefore);
        expect(engine.state.mode).toBe('event');
        expect(engine.state.event?.id).toBe('savior_day90');
        expect(engine.state.tags).toContain('救世主');
        expect(engine.getView().choices.map((c) => c.id)).toContain('confused');
        expect(engine.getView().narrative).toContain('你迷迷糊糊的睁开眼睛');
        expect(engine.getView().lastResult).toContain('被丧尸咬中了');
        expect(engine.getView().lastResult).not.toContain('结局线');
      });

      it('从第 80 天独行救约翰完成救世主线大结局（高墙之内）', () => {
        const engine = setupDay80({ shelter: 'villa' });
        engine.pickChoice('save');
        engine.pickChoice('bitten');
        engine.pickChoice('confused');

        expect(engine.state.event?.nodeId).toBe('after_answer');
        expect(engine.getView().narrative).toContain('你心中疑惑');
        expect(engine.getView().lastResult).toBeNull();

        engine.pickChoice('to_city');
        expect(engine.getView().narrative).toContain('组建末世下第一个属于「人类」的城市');
        expect(engine.state.stats.supplies).toBeGreaterThan(10000);

        const end = engine.pickChoice('wall_city');

        expect(end.demoComplete).toBe(true);
        expect(engine.getView().finaleNarrative).toContain('高墙之内，丧尸禁行');
        expect(engine.state.tags).toContain('救世主');
        expect(engine.state.tags).toContain('高墙之内');
        expect(engine.state.endingScore?.finaleTag?.id).toBe('高墙之内');
      });
    });

    describe('savior（有伊芙琳·救约翰牺牲伊芙琳）', () => {
      it('save_john → 约翰入队、失去伊芙琳、《伊芙琳》词条，进入 savior_pre', () => {
        const engine = setupDay80({ partners: ['evelyn'] });
        engine.pickChoice('save');
        expect(engine.state.event?.nodeId).toBe('with_evelyn');

        const branchIds = engine.getView().choices.map((c) => c.id);
        expect(branchIds).toContain('save_john');
        expect(branchIds).not.toContain('promise');

        engine.pickChoice('save_john');

        expect(engine.state.route).toBe('savior');
        expect(engine.state.partners).toEqual(['john']);
        expect(engine.state.tags).toContain('伊芙琳');
        expect(engine.state.event?.id).toBe('savior_pre');
        expect(engine.getView().lastResult).toContain('你知道此行的目的');
      });

      it('save_john 后无《穿越者》→ 第 90 天血清线', () => {
        const engine = setupDay80({ partners: ['evelyn'] });
        engine.pickChoice('save');
        engine.pickChoice('save_john');
        engine.pickChoice('bitten');

        expect(engine.state.day).toBe(90);
        expect(engine.state.partners).toContain('john');
        expect(engine.state.event?.id).toBe('savior_day90');
        expect(engine.getView().choices.map((c) => c.id)).toContain('confused');
      });
    });

    describe('savior_zombie（独行救约翰 + 《穿越者》）', () => {
      it('save + 《穿越者》→ 进入尸化因果线 pre_6h', () => {
        const engine = setupDay80({ tags: ['穿越者'] });
        engine.pickChoice('save');
        engine.pickChoice('bitten');

        expect(engine.state.route).toBe('savior_zombie');
        expect(engine.state.event?.id).toBe('savior_zombie_arc');
        expect(engine.state.event?.nodeId).toBe('pre_6h');
        expect(engine.state.tags).toContain('救世主');
        expect(engine.getView().lastResult).not.toContain('结局线');
      });

      it('第 85 天显示手册台词并推进至第 90 天', () => {
        const engine = setupDay80();
        engine.state.day = 85;
        engine.state.route = 'savior_zombie';

        expect(engine.getView().narrative).toContain('救……我……');
        engine.pickChoice('continue_85');

        expect(engine.state.day).toBe(90);
        expect(engine.state.demoComplete).toBeFalsy();
        expect(engine.state.event?.id).toBe('savior_day90');
        expect(engine.getView().choices.map((c) => c.id)).toContain('confused');
      });

      it('尸化线 day60 选项结果在 skipToDay 跨天后清除', () => {
        const engine = setupDay80();
        engine.state.route = 'savior_zombie';
        engine.state.mode = 'event';
        engine.state.event = { id: 'savior_zombie_arc', nodeId: 'day80_zombie' };

        engine.pickChoice('to_shelter');

        expect(engine.state.day).toBe(85);
        expect(engine.getView().lastResult).toBeNull();
      });

      it('从第 80 天经尸化段落到地底之城大结局', () => {
        const engine = setupDay80({ tags: ['穿越者'], shelter: 'bunker' });
        engine.pickChoice('save');
        engine.pickChoice('bitten');
        engine.pickChoice('bite_a');
        engine.pickChoice('bite20_a');
        engine.pickChoice('flee');
        engine.pickChoice('to_shelter');
        engine.pickChoice('continue_85');
        engine.pickChoice('confused');
        engine.pickChoice('to_city');
        const end = engine.pickChoice('underground');

        expect(end.demoComplete).toBe(true);
        expect(engine.state.route).toBe('savior_zombie');
        expect(engine.state.tags).toContain('丧尸尼奥');
        expect(engine.state.tags).toContain('地底之城');
      });
    });

    describe('adam_eve（有伊芙琳·救伊芙琳）', () => {
      it('save_evelyn → 第85天自动进入 adam_eve_85 并显示正文', () => {
        const engine = setupDay80({ partners: ['evelyn'] });
        engine.pickChoice('save');
        engine.pickChoice('save_evelyn');

        expect(engine.state.route).toBe('adam_eve');
        expect(engine.state.day).toBe(85);
        expect(engine.state.mode).toBe('event');
        expect(engine.state.event?.id).toBe('adam_eve_85');
        expect(engine.state.partners).toContain('evelyn');
        expect(engine.getView().narrative).toContain('约翰死了');
        expect(engine.getView().choices.map((c) => c.id)).toEqual(['meal', 'explore_gear']);
        expect(engine.getView().choiceOutcome?.text).toContain('你无法放弃你的伙伴伊芙琳');
        expect(engine.getView().sceneOutcome?.label).toBe('亚当夏娃·八十五天');
        expect(engine.getView().sceneOutcome?.effects).toContain('物资 +10000');
        expect(engine.getView().choiceOutcome?.effects).not.toContain('物资 +10000');
      });

      it('有《承诺》时显示承诺选项并进入 adam_eve', () => {
        const engine = setupDay80({ partners: ['evelyn'], tags: ['承诺'] });
        engine.pickChoice('save');

        const branches = engine.getView().choices.map((c) => ({
          id: c.id,
          disabled: c.disabled,
        }));
        expect(branches).toContainEqual({ id: 'promise', disabled: false });
        expect(branches).toContainEqual({ id: 'save_john', disabled: true });

        engine.pickChoice('promise');

        expect(engine.state.route).toBe('adam_eve');
        expect(engine.state.day).toBe(85);
        expect(engine.state.event?.id).toBe('adam_eve_85');
        expect(engine.state.partners).toContain('evelyn');
        expect(engine.getView().narrative).toContain('约翰死了');
      });

      it('从 save_evelyn 经恋人线完成《真正的救世主》大结局', () => {
        const engine = setupDay80({ partners: ['evelyn'] });
        engine.pickChoice('save');
        engine.pickChoice('save_evelyn');
        engine.pickChoice('explore_gear');
        expect(engine.state.day).toBe(90);
        expect(engine.state.event?.id).toBe('adam_eve_90');
        expect(engine.getView().narrative).toContain('关系应该进一步了');
        engine.pickChoice('accept');
        expect(engine.state.day).toBe(100);
        expect(engine.state.event?.id).toBe('adam_eve_100');
        const end = engine.pickChoice('finale_lover');

        expect(end.demoComplete).toBe(true);
        expect(engine.state.tags).toContain('恋人');
        expect(engine.state.tags).toContain('真正的救世主');
        expect(engine.state.endingScore?.finaleTag?.id).toBe('真正的救世主');
      });

      it('从 save_evelyn 经拒绝线完成《尼奥与尼奥》大结局', () => {
        const engine = setupDay80({ partners: ['evelyn'] });
        engine.pickChoice('save');
        engine.pickChoice('save_evelyn');
        engine.pickChoice('explore_gear');
        engine.pickChoice('refuse');
        expect(engine.state.event?.id).toBe('adam_eve_100');
        const end = engine.pickChoice('finale_rules');

        expect(end.demoComplete).toBe(true);
        expect(engine.state.tags).toContain('末世生存守则');
        expect(engine.state.tags).toContain('尼奥与尼奥');
        expect(engine.state.endingScore?.finaleTag?.id).toBe('尼奥与尼奥');
      });
    });

    describe('ending route milestone matrix', () => {
      it('savior_zombie 第85天保留 opening 且不自动进事件', () => {
        const engine = setupDay80();
        engine.state.route = 'savior_zombie';
        engine.state.day = 85;
        engine.state.mode = 'day';

        expect(engine.getView().narrative).toContain('救……我……');
        expect(engine.state.event).toBeNull();
        expect(engine.getView().choices.map((c) => c.id)).toEqual(['continue_85']);
      });

      it('savior 第100天仅显示已完成提示', () => {
        const engine = setupDay80();
        engine.state.route = 'savior';
        engine.state.day = 100;
        engine.state.mode = 'day';

        expect(engine.state.event).toBeNull();
        expect(engine.getView().choices[0]?.disabled).toBe(true);
      });
    });
  });

  it('computes ending score on game over with 尽头', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 10;
    engine.state.stats = { humanity: 50, supplies: 0, ammo: 0 };
    engine.state.tags = [];

    engine._triggerGameOver('物资耗尽', '尽头');

    expect(engine.state.endingScore.totalScore).toBe(50 * 10 - 300);
    expect(engine.state.endingScore.grade.rank).toBe('C');
    expect(engine.state.tags).toContain('尽头');
  });

  it('previews cost for next playable day, not always day+1', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 80;
    engine.state.route = 'savior';
    engine.state.stats.supplies = 999;

    const preview = engine.getView().nextDayCostPreview;
    expect(preview.nextDay).toBe(90);
    expect(preview.nextDay).not.toBe(81);
  });

  it('records choices in choiceLog', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 15;
    engine.state.items = ['收音机'];
    engine.state.stats.supplies = 999;

    engine.pickChoice('radio');

    expect(engine.state.choiceLog).toHaveLength(1);
    expect(engine.state.choiceLog[0].choiceText).toBeTruthy();
    expect(engine.state.choiceLog[0].context).toBeTruthy();
  });

  it('does not expose special-event labels during outdoor exploration', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 10;
    engine.state.stats.supplies = 100;

    engine.pickExploreArea('fifth_avenue');
    const help = engine.getView().choices.find((c) => c.id === 'help');
    expect(help).toBeTruthy();
    expect(help.special).toBe(false);
  });
});
