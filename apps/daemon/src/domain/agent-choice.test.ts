import { describe, expect, it } from 'vitest';
import { resolveChoice } from './agent-choice.js';

describe('resolveChoice', () => {
  it('takes model and effort each from the first layer that sets it', () => {
    const task = { model: null, effort: 'low' as const };
    const defaults = { model: 'sonnet', effort: 'high' as const };
    const playbook = { model: 'opus' };

    expect(resolveChoice(task, defaults, playbook)).toEqual({ model: 'sonnet', effort: 'low' });
    expect(resolveChoice(undefined, undefined, playbook)).toEqual({ model: 'opus', effort: null });
    expect(resolveChoice()).toEqual({ model: null, effort: null });
  });
});
