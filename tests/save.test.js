import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { GameEngine } from '../demo/js/engine.js';
import {
  SAVE_SLOT_COUNT,
  SAVE_SLOT_KEY_PREFIX,
  applySavedGame,
  buildSaveSummary,
  deserializePlainState,
  hasAnySaveSlot,
  listSaveSlots,
  loadGameFromSlot,
  saveGameToSlot,
  serializeGame,
  serializePlainState,
} from '../demo/js/save.js';
import { loadFixtureData } from './helpers/load-data.js';

const fixture = await loadFixtureData();

function createEngine() {
  return new GameEngine(fixture);
}

describe('save / load', () => {
  const storage = new Map();

  beforeEach(() => {
    storage.clear();
    globalThis.localStorage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    };
  });

  afterEach(() => {
    delete globalThis.localStorage;
  });

  it('serializes onceUsed Set as array and restores it', () => {
    const engine = createEngine();
    engine.startGame();
    engine.state.onceUsed.add('radio_airdrop:day:35');

    const payload = serializeGame(engine);
    expect(payload.state.onceUsed).toEqual(['radio_airdrop:day:35']);

    const restored = createEngine();
    const result = applySavedGame(restored, payload);
    expect(result.ok).toBe(true);
    expect(restored.state.onceUsed.has('radio_airdrop:day:35')).toBe(true);
    expect(restored.state.mode).toBe('pre');
  });

  it('stores summary with shelter, day, and partners in each slot', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 35;
    engine.state.shelter = 'villa';
    engine.state.partners = ['evelyn', 'lime'];

    saveGameToSlot(engine, 1);
    const raw = JSON.parse(storage.get(`${SAVE_SLOT_KEY_PREFIX}1`));

    expect(raw.summary).toEqual({
      day: 35,
      dayLabel: '第 35 天',
      shelter: 'villa',
      shelterName: '山中别墅',
      partners: ['伊芙琳', '莱姆'],
      partnersLabel: '伊芙琳、莱姆',
    });

    const slots = listSaveSlots();
    expect(slots).toHaveLength(SAVE_SLOT_COUNT);
    expect(slots[0].empty).toBe(true);
    expect(slots[1].summary.partnersLabel).toBe('伊芙琳、莱姆');
    expect(hasAnySaveSlot()).toBe(true);
  });

  it('overwrites the chosen slot without affecting others', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 10;
    engine.state.shelter = 'bunker';
    saveGameToSlot(engine, 0);

    engine.state.day = 50;
    engine.state.shelter = 'villa';
    saveGameToSlot(engine, 0);

    expect(loadGameFromSlot(0).summary.day).toBe(50);
    expect(loadGameFromSlot(1)).toBeNull();
  });

  it('persists day checkpoint metadata through save/load', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 20;
    engine.state.stats.supplies = 500;
    engine._captureDayCheckpoint();
    engine.state.stats.supplies = 100;

    saveGameToSlot(engine, 2);
    const raw = loadGameFromSlot(2);
    expect(raw.dayCheckpoint).toBeTruthy();
    expect(raw.dayCheckpointKey).toBe('day:20');

    const loaded = createEngine();
    applySavedGame(loaded, raw);
    expect(loaded.state.stats.supplies).toBe(100);
    expect(loaded.canRestartCurrentDay()).toBe(true);
  });

  it('rejects intro state and invalid slot index', () => {
    const engine = createEngine();
    expect(saveGameToSlot(engine, 0).error).toBeTruthy();
    expect(saveGameToSlot(createEngine(), 99).error).toContain('槽位');
  });

  it('buildSaveSummary shows 爆发前 when day is 0', () => {
    const engine = createEngine();
    engine.startGame();
    engine.state.shelter = 'bunker';
    expect(buildSaveSummary(engine).dayLabel).toBe('爆发前');
  });
});

describe('restart current day', () => {
  it('restores day opening state once per day', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 10;
    engine.state.stats.supplies = 200;
    engine.state.stats.humanity = 50;
    engine._enterDay(10);

    const openingSupplies = engine.state.stats.supplies;
    engine.state.stats.humanity = 30;
    engine.state.lastChoiceOutcome = { text: '误触了选项', effects: null };

    const ok = engine.restartCurrentDay();
    expect(ok.ok).toBe(true);
    expect(engine.state.stats.humanity).toBe(50);
    expect(engine.state.lastChoiceOutcome).toBeNull();
    expect(engine.state.stats.supplies).toBe(openingSupplies);
    expect(engine.canRestartCurrentDay()).toBe(false);

    const again = engine.restartCurrentDay();
    expect(again.error).toContain('重新开启');
  });

  it('resets restart availability on the next day', () => {
    const engine = createEngine();
    engine.state.mode = 'day';
    engine.state.day = 10;
    engine.state.stats.supplies = 999;
    engine._enterDay(10);
    engine.restartCurrentDay();

    engine.state.mode = 'day';
    engine.state.day = 15;
    engine._enterDay(15);

    expect(engine.canRestartCurrentDay()).toBe(true);
  });

  it('round-trips checkpoint via serializePlainState', () => {
    const state = createEngine().state;
    state.onceUsed.add('a');
    state.tags = ['救世主'];
    const copy = deserializePlainState(serializePlainState(state));
    expect(copy.tags).toEqual(['救世主']);
    expect(copy.onceUsed.has('a')).toBe(true);
  });
});
