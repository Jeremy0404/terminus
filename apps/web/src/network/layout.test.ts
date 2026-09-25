import { describe, expect, it } from 'vitest';
import type { EpicDto, TaskSummaryDto } from '@terminus/contracts';
import { layoutNetwork, LEFT, ROW, STEP, TOP, withoutDeliveredLines } from './layout';

const epic = (id: string, position: number): EpicDto => ({ id, appId: 'app', code: id.toUpperCase(), name: id, status: 'active', position, description: '', breakdown: { status: 'idle' } });
const task = (id: string, epicId: string, dependsOn: string[] = []): TaskSummaryDto => ({
  id,
  epicId,
  title: id,
  description: '',
  autonomy: 'up-to-pr',
  track: 'standard',
  agent: { model: null, effort: null },
  phases: ['spec', 'merge'],
  phasesInTrack: ['spec', 'merge'],
  skippablePhases: [],
  phaseIndex: 0,
  status: { kind: 'todo' },
  dependsOn,
});

describe('layoutNetwork', () => {
  it('puts each epic on its own row, ordered by position, stations in creation order', () => {
    const layout = layoutNetwork([epic('b', 2), epic('a', 1)], [task('a1', 'a'), task('a2', 'a'), task('b1', 'b')]);

    expect(layout.lines.map((line) => [line.epic.id, line.y])).toEqual([
      ['a', TOP],
      ['b', TOP + ROW],
    ]);
    expect(layout.lines[0]?.stations.map((station) => station.x)).toEqual([LEFT, LEFT + STEP]);
  });

  it('places a task to the right of everything it waits on, across lines', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2)], [task('a1', 'a'), task('a2', 'a'), task('a3', 'a'), task('b1', 'b', ['a3'])]);

    const b1 = layout.lines[1]?.stations[0];
    expect(b1?.x).toBe(LEFT + 3 * STEP);
    expect(layout.transfers).toEqual([
      { fromTaskId: 'a3', toTaskId: 'b1', from: { x: LEFT + 2 * STEP, y: TOP }, to: { x: LEFT + 3 * STEP, y: TOP + ROW } },
    ]);
  });

  it('draws no transfer for a dependency inside the same line', () => {
    expect(layoutNetwork([epic('a', 1)], [task('a1', 'a'), task('a2', 'a', ['a1'])]).transfers).toEqual([]);
  });

  it('gives an empty epic a short stub line', () => {
    const [line] = layoutNetwork([epic('a', 1)], []).lines;
    expect(line?.stations).toEqual([]);
    expect(line?.endX).toBeGreaterThan(line?.startX ?? 0);
  });

  it('sizes the drawing to its content, never below a readable minimum', () => {
    const small = layoutNetwork([epic('a', 1)], [task('a1', 'a')]);
    expect([small.width, small.height]).toEqual([1000, 380]);

    const wide = layoutNetwork([epic('a', 1)], Array.from({ length: 9 }, (_, index) => task(`a${index}`, 'a')));
    expect(wide.width).toBeGreaterThan(LEFT + 8 * STEP);
  });

  it('keeps stations of a line close together', () => {
    const layout = layoutNetwork([epic('a', 1)], [task('a1', 'a'), task('a2', 'a'), task('a3', 'a')]);
    expect(layout.lines[0]?.stations.map((station) => station.x)).toEqual([230, 310, 390]);
  });

  it('alternates station labels below and above within each line', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2)], [task('a1', 'a'), task('a2', 'a'), task('a3', 'a'), task('b1', 'b'), task('b2', 'b')]);
    expect(layout.lines.map((line) => line.stations.map((station) => station.labelSide))).toEqual([
      ['below', 'above', 'below'],
      ['below', 'above'],
    ]);
  });
});

describe('withoutDeliveredLines', () => {
  const delivered = (id: string, position: number): EpicDto => ({ ...epic(id, position), status: 'delivered' });
  const epics = [delivered('a', 1), epic('b', 2)];
  const tasks = [task('a1', 'a'), task('a2', 'a'), task('b1', 'b', ['a2'])];

  it('frees the row of a delivered line', () => {
    const visible = withoutDeliveredLines(epics, tasks, null);
    const layout = layoutNetwork(visible.epics, visible.tasks);
    expect(layout.lines.map((line) => [line.epic.id, line.y])).toEqual([['b', TOP]]);
  });

  it('moves a line that waited on a delivered line back to the left, without a transfer', () => {
    const visible = withoutDeliveredLines(epics, tasks, null);
    const layout = layoutNetwork(visible.epics, visible.tasks);
    expect(layout.lines[0]?.stations.map((station) => station.x)).toEqual([LEFT]);
    expect(layout.transfers).toEqual([]);
  });

  it('keeps the open line even when it is delivered', () => {
    const visible = withoutDeliveredLines(epics, tasks, 'a');
    expect(visible.epics.map((candidate) => candidate.id)).toEqual(['a', 'b']);
    expect(visible.tasks.map((candidate) => candidate.id)).toEqual(['a1', 'a2', 'b1']);
  });
});
