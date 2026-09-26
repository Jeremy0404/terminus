import { describe, expect, it } from 'vitest';
import type { EpicDto, TaskSummaryDto } from '@terminus/contracts';
import { task } from '../test/fixtures';
import { compactNetwork, summarizeFinished } from './compact';
import { layoutNetwork, STEP } from './layout';

const epic = (id: string, position: number, status: EpicDto['status'] = 'active'): EpicDto => ({ id, appId: 'app-1', code: id.toUpperCase(), name: id, status, position, description: '', breakdown: { status: 'idle' } });
const DONE: TaskSummaryDto['status'] = { kind: 'done' };
const TODO: TaskSummaryDto['status'] = { kind: 'todo' };
const lineOf = (epicId: string, statuses: readonly TaskSummaryDto['status'][]): TaskSummaryDto[] =>
  statuses.map((status, index) => task(`${epicId}${index + 1}`, epicId, `${epicId} ${index + 1}`, status));
const ids = (tasks: readonly TaskSummaryDto[]): string[] => tasks.map((candidate) => candidate.id);
const countsAbove1 = (counts: ReadonlyMap<string, number>): [string, number][] => [...counts].filter(([, count]) => count > 1);

describe('summarizeFinished', () => {
  it('replaces a run of finished stations by its last one, carrying the count', () => {
    const { tasks, counts } = summarizeFinished(lineOf('a', [TODO, DONE, DONE, DONE, DONE, TODO]));

    expect(ids(tasks)).toEqual(['a1', 'a5', 'a6']);
    expect(counts.get('a5')).toBe(4);
    expect(countsAbove1(counts)).toEqual([['a5', 4]]);
  });

  it('leaves a run of two finished stations alone', () => {
    const line = lineOf('a', [DONE, DONE, TODO, DONE]);
    const { tasks, counts } = summarizeFinished(line);

    expect(tasks).toEqual(line);
    expect(countsAbove1(counts)).toEqual([]);
  });

  it('counts closed stations as finished', () => {
    const closed: TaskSummaryDto['status'] = { kind: 'closed', reason: 'already-done', evidence: '' };
    const { tasks, counts } = summarizeFinished(lineOf('a', [closed, DONE, closed, TODO]));

    expect(ids(tasks)).toEqual(['a3', 'a4']);
    expect(counts.get('a3')).toBe(3);
  });

  it('never folds an interchange endpoint, and only summarizes the long side of the cut', () => {
    const line = lineOf('a', [DONE, DONE, DONE, DONE, DONE, DONE, TODO]);
    const waiting = task('b1', 'b', 'b 1', TODO, { dependsOn: ['a4'] });
    const { tasks, counts } = summarizeFinished([...line, waiting]);

    expect(ids(tasks)).toEqual(['a3', 'a4', 'a5', 'a6', 'a7', 'b1']);
    expect(countsAbove1(counts)).toEqual([['a3', 3]]);
  });

  it('keeps the order of the tasks across lines', () => {
    const a = lineOf('a', [DONE, DONE, DONE, TODO]);
    const b = lineOf('b', [TODO, TODO]);
    const mixed = [a[0], b[0], a[1], a[2], b[1], a[3]].filter((candidate): candidate is TaskSummaryDto => candidate !== undefined);

    expect(ids(summarizeFinished(mixed).tasks)).toEqual(['b1', 'a3', 'b2', 'a4']);
  });

  it('shortens the line by one step per folded station', () => {
    const line = lineOf('a', Array.from({ length: 20 }, (_, index) => (index < 10 ? DONE : TODO)));
    const full = layoutNetwork([epic('a', 1)], line);
    const summarized = layoutNetwork([epic('a', 1)], summarizeFinished(line).tasks);

    expect(full.width - summarized.width).toBe((10 - 1) * STEP);
  });
});

describe('compactNetwork', () => {
  const epics = [epic('shipped', 1, 'delivered'), epic('done', 2), epic('empty', 3), epic('open', 4)];
  const tasks = [
    ...lineOf('shipped', [DONE, TODO]),
    ...lineOf('done', [DONE, DONE, DONE, DONE]),
    ...lineOf('open', [DONE, DONE, DONE, TODO]),
  ];

  it('thins finished lines, with their count of finished stations', () => {
    const { thin } = compactNetwork(epics, tasks);
    expect([...thin]).toEqual([['shipped', 1], ['done', 4]]);
  });

  it('keeps only the interchange stations of a thin line, and summarizes the others', () => {
    const waiting = task('open5', 'open', 'open 5', TODO, { dependsOn: ['done2'] });
    const compact = compactNetwork(epics, [...tasks, waiting]);

    expect(ids(compact.tasks)).toEqual(['done2', 'open3', 'open4', 'open5']);
    expect(compact.counts.get('open3')).toBe(3);
    expect(compact.epics).toEqual(epics);
  });
});
