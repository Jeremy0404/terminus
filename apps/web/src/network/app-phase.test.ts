import { describe, expect, it } from 'vitest';
import { NETWORK, task } from '../test/fixtures';
import { appPhaseOf } from './app-phase';

describe('appPhaseOf', () => {
  it('has no phase for an adopted app without a foundation line', () => {
    expect(appPhaseOf(NETWORK)).toBeNull();
  });

  it('follows the first foundation station still open, then says build', () => {
    const framing = task('f1', 'engine', 'Cadrer', { kind: 'awaiting-decision', decisionId: 'd' }, { lifecycleId: 'app-framing' });
    expect(appPhaseOf({ ...NETWORK, tasks: [framing] })).toBe('framing');
    expect(appPhaseOf({ ...NETWORK, tasks: [{ ...framing, status: { kind: 'done' } }] })).toBe('build');
  });

  it('says production while the production station is open, then build', () => {
    const done = { kind: 'done' } as const;
    const foundations = [
      task('f1', 'engine', 'Cadrer', done, { lifecycleId: 'app-framing' }),
      task('f2', 'engine', 'Choisir la stack', done, { lifecycleId: 'app-stack' }),
      task('f3', 'engine', 'Poser le socle', done, { lifecycleId: 'app-scaffold' }),
    ];
    const production = task('f4', 'engine', 'Mettre en production', { kind: 'awaiting-gate', gate: 'plan-approval' }, { lifecycleId: 'app-deploy' });

    expect(appPhaseOf({ ...NETWORK, tasks: [...foundations, production] })).toBe('production');
    expect(appPhaseOf({ ...NETWORK, tasks: [...foundations, { ...production, status: done }] })).toBe('build');
    expect(appPhaseOf({ ...NETWORK, tasks: [...foundations, { ...production, status: { kind: 'closed', reason: 'obsolete', evidence: 'local' } }] })).toBe('build');
    expect(appPhaseOf({ ...NETWORK, tasks: foundations })).toBe('build');
  });
});
