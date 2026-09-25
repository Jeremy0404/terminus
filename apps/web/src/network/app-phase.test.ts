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
});
