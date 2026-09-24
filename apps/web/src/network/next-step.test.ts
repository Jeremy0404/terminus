import { describe, expect, it } from 'vitest';
import type { NetworkDto } from '@terminus/contracts';
import { NETWORK, task } from '../test/fixtures';
import { nextStep } from './next-step';

const epic = (id: string, position: number, name = id) => ({ id, appId: 'app', code: id.toUpperCase().slice(0, 3), name, status: 'active' as const, position, description: '', breakdown: { status: 'idle' as const } });
const network = (epics: NetworkDto['epics'], tasks: NetworkDto['tasks']): NetworkDto => ({ ...NETWORK, epics, tasks, inbox: [] });

describe('nextStep', () => {
  it('asks for a first line on an empty network', () => {
    expect(nextStep(network([], []))).toEqual({ kind: 'create-line' });
  });

  it('opens the first station whose dependencies are merged or closed as covered, line by line', () => {
    const tasks = [
      task('waiting', 'a', 'Waiting', { kind: 'todo' }, { dependsOn: ['running'] }),
      task('running', 'a', 'Running', { kind: 'running', runId: 'r' }),
      task('free', 'b', 'Free', { kind: 'todo' }, { dependsOn: ['covered'] }),
      task('covered', 'b', 'Covered', { kind: 'closed', reason: 'already-done', evidence: '' }),
    ];

    expect(nextStep(network([epic('b', 2), epic('a', 1)], tasks))).toEqual({ kind: 'open-station', epicId: 'b', taskId: 'free', title: 'Free' });
    expect(nextStep(network([epic('a', 1), epic('b', 2)], tasks), 'a')).toBeNull();
  });

  it('suggests breaking down an empty line when nothing can be opened', () => {
    const tasks = [task('done', 'a', 'Done', { kind: 'done' })];

    expect(nextStep(network([epic('a', 1), epic('b', 2, 'Adoption')], tasks))).toEqual({ kind: 'break-down', epicId: 'b', name: 'Adoption' });
    expect(nextStep(network([epic('a', 1), epic('b', 2)], tasks), 'a')).toBeNull();
  });
});
