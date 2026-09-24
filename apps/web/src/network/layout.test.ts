import { describe, expect, it } from 'vitest';
import type { EpicDto, TaskSummaryDto } from '@terminus/contracts';
import { layoutNetwork, LEFT, lineViewBox, ROW, STEP, TOP } from './layout';

const epic = (id: string, position: number): EpicDto => ({ id, appId: 'app', code: id.toUpperCase(), name: id, status: 'active', position, description: '', breakdown: { status: 'idle' } });
const task = (id: string, epicId: string, dependsOn: string[] = []): TaskSummaryDto => ({
  id,
  epicId,
  title: id,
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

  it('zooms onto a line without cutting its name or blowing up a short line', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2)], [task('a1', 'a'), task('a2', 'a'), task('a3', 'a'), task('a4', 'a'), task('a5', 'a'), task('a6', 'a'), task('b1', 'b')]);
    const [x, , width] = lineViewBox(layout, 'b', 2);
    expect(x).toBeLessThan(LEFT - STEP);
    expect(width).toBeGreaterThanOrEqual(layout.width * 0.55);
  });
});
