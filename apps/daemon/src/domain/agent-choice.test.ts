import { describe, expect, it } from 'vitest';
import { choiceFor, resolveChoice } from './agent-choice.js';

describe('resolveChoice', () => {
  it('takes model and effort each from the first layer that sets it', () => {
    const task = { model: null, effort: 'low' as const };
    const defaults = { model: 'sonnet', effort: 'high' as const };
    const playbook = { model: 'opus' };

    expect(resolveChoice(task, defaults, playbook)).toEqual({ model: 'sonnet', effort: 'low' });
    expect(resolveChoice(undefined, undefined, playbook)).toEqual({ model: 'opus', effort: null });
    expect(resolveChoice()).toEqual({ model: null, effort: null });
  });

  it('falls back to the global default, Opus xhigh unless the human changed it', () => {
    expect(choiceFor({}, 'task.plan')).toEqual({ model: 'opus', effort: 'xhigh' });
    expect(choiceFor({}, 'epic.station-draft', { model: 'haiku', effort: 'low' })).toEqual({ model: 'haiku', effort: 'low' });
    expect(choiceFor({ '*': { model: null, effort: 'high' }, 'task.plan': { model: 'sonnet', effort: null } }, 'task.plan')).toEqual({ model: 'sonnet', effort: 'high' });
    expect(choiceFor({ '*': { model: null, effort: null } }, 'task.plan', undefined, { model: 'haiku', effort: null })).toEqual({ model: 'haiku', effort: null });
  });
});
