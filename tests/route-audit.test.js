import { describe, expect, it } from 'vitest';

import { loadFixtureData } from './helpers/load-data.js';
import { formatAuditReport, runRouteAudit, SCENARIOS } from './helpers/route-audit.js';

const fixture = await loadFixtureData();

describe('route audit', () => {
  it('prints audit report (run: npx vitest run tests/route-audit.test.js)', () => {
    const audit = runRouteAudit(fixture);
    // eslint-disable-next-line no-console
    console.log('\n' + formatAuditReport(audit));
    expect(audit.hiddenContexts.length).toBeGreaterThanOrEqual(0);
  });

  it('has no dead-end states under generous resources (BFS smoke)', () => {
    const audit = runRouteAudit(fixture, { scenarios: SCENARIOS });
    const allDead = audit.results.flatMap((r) =>
      r.deadEnds.map((d) => `[${r.name}] ${d.location}`)
    );

    expect(
      allDead,
      `发现死路点:\n${allDead.join('\n')}\n\n详见 vitest 输出中的完整报告`
    ).toEqual([]);
  });
});
