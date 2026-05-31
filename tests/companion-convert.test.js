import { describe, expect, it } from 'vitest';

import {
  buildCompanionConvertView,
  getEligibleConvertPartners,
  resolveCompanionConvertChoice,
} from '../demo/js/companion-convert.js';
import { loadFixtureData } from './helpers/load-data.js';

const fixture = await loadFixtureData();

describe('companion convert helpers', () => {
  it('filters ineligible partners by tags and config', () => {
    const state = {
      partners: ['lime', 'luna', 'john'],
      tags: ['伙伴'],
    };

    const eligible = getEligibleConvertPartners(state, fixture.companionConvert);

    expect(eligible).toEqual(['luna']);
  });

  it('builds partner selection view when multiple targets exist', () => {
    const state = {
      day: 4,
      event: {
        id: 'companion_convert_night',
        meta: { targetDay: 5, eligible: ['luna', 'blake'] },
      },
    };

    const view = buildCompanionConvertView(state, fixture.companionConvert);

    expect(view.title).toContain('饥不择食的前夜');
    expect(view.choices.map((c) => c.id)).toEqual(['pick_luna', 'pick_blake']);
    expect(view.choices[0].specialLabel).toBe('前夜');
  });

  it('selects a partner before resolving convert/endure actions', () => {
    const state = {
      event: {
        id: 'companion_convert_night',
        meta: { eligible: ['luna'] },
      },
    };

    const selected = resolveCompanionConvertChoice('pick_luna', state, fixture.companionConvert);
    const converted = resolveCompanionConvertChoice(
      'convert_luna',
      state,
      fixture.companionConvert
    );

    expect(selected.phase).toBe('selected');
    expect(state.event.meta.selectedPartner).toBe('luna');
    expect(converted.ok).toBe(true);
    expect(converted.after).toBe('gameOver');
    expect(converted.resultText).toContain('字条');
    expect(converted.effects.removePartner).toBe('luna');
  });
});
