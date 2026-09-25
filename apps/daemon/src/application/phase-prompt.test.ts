import { describe, expect, it } from 'vitest';
import { createTask } from '../domain/task.js';
import { TASK_LIFECYCLE } from '../domain/test-fixtures.js';
import { buildPhasePrompt } from './phase-prompt.js';

const CONTEXT = { notesDir: '/notes/t1', baseRef: 'main', verification: [] };

const promptLines = (description = ''): string[] => {
  const task = createTask({ id: 't1', epicId: 'e1', title: 'Zoom to platform', description, lifecycle: TASK_LIFECYCLE });
  return buildPhasePrompt(task, { id: 'spec', skill: 'spec' }, [], CONTEXT).split('\n');
};

describe('buildPhasePrompt', () => {
  it('gives the task description as a brief right after the title', () => {
    expect(promptLines('Click a station to zoom on its platform.').slice(0, 3)).toEqual([
      'Task: Zoom to platform',
      'Brief: Click a station to zoom on its platform.',
      'Phase: spec (1 of 7)',
    ]);
  });

  it('adds no brief when the description is empty or blank', () => {
    expect(promptLines().some((line) => line.startsWith('Brief:'))).toBe(false);
    expect(promptLines(' \n ').some((line) => line.startsWith('Brief:'))).toBe(false);
  });
});
