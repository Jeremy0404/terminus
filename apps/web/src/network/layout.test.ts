import { describe, expect, it } from 'vitest';
import type { EpicDto, TaskSummaryDto } from '@terminus/contracts';
import { layoutNetwork, ROUNDEL_RADIUS, ROW, STEP, TOP, withoutDeliveredLines, type NetworkLayout, type Point } from './layout';

const epic = (id: string, position: number, status: EpicDto['status'] = 'active'): EpicDto => ({ id, appId: 'app', code: id.toUpperCase(), name: id, status, position, description: '', breakdown: { status: 'idle' } });
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

const onPath = (path: readonly Point[], point: Point): boolean =>
  path.slice(1).some((to, index) => {
    const from = path[index] ?? to;
    const cross = (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
    const within = point.x >= Math.min(from.x, to.x) && point.x <= Math.max(from.x, to.x) && point.y >= Math.min(from.y, to.y) && point.y <= Math.max(from.y, to.y);
    return Math.abs(cross) < 1e-9 && within;
  });

function expectOctolinearPaths(layout: NetworkLayout): void {
  for (const line of layout.lines) {
    const segments = line.path.slice(1).map((point, index) => [line.path[index], point] as const);
    for (const [from, to] of segments) {
      const dx = (to?.x ?? 0) - (from?.x ?? 0);
      const dy = Math.abs((to?.y ?? 0) - (from?.y ?? 0));
      expect(dx).toBeGreaterThanOrEqual(0);
      expect(dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-9).toBe(true);
    }
    expect(line.path.at(-1)).toEqual({ x: line.endX, y: line.y });
    for (const station of line.stations) expect(onPath(line.path, station)).toBe(true);
  }
}

const threeLines = () => layoutNetwork([epic('a', 1), epic('b', 2), epic('c', 3)], [task('a1', 'a'), task('b1', 'b'), task('c1', 'c')]);

describe('layoutNetwork', () => {
  it('draws every line left to right with horizontal, vertical or 45° segments, ending on its row', () => {
    expectOctolinearPaths(layoutNetwork([epic('a', 1), epic('b', 2), epic('c', 3)], [task('a1', 'a'), task('a2', 'a'), task('b1', 'b', ['a2']), task('c1', 'c', ['a1'])]));
  });

  it('puts the origin at the vertical middle of the rows', () => {
    expect(layoutNetwork([epic('a', 1), epic('b', 2)], []).origin.y).toBe(TOP + ROW / 2);
    expect(threeLines().origin.y).toBe(TOP + ROW);
  });

  it('starts every line at the origin on its own lane, in epic order', () => {
    const layout = threeLines();
    const lanes = layout.lines.map((line) => line.path[0]);

    for (const lane of lanes) {
      expect(lane?.x).toBe(layout.origin.x);
      expect(lane?.y).toBeGreaterThanOrEqual(layout.origin.top);
      expect(lane?.y).toBeLessThanOrEqual(layout.origin.bottom);
    }
    const ys = lanes.map((lane) => lane?.y ?? 0);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(new Set(ys).size).toBe(ys.length);
  });

  it('reaches each row through one 45° segment from the lane, the middle line leaving flat', () => {
    const bends = (layout: NetworkLayout) =>
      layout.lines.map((line) => {
        const [lane, corner] = line.path;
        expect(corner?.y).toBe(line.y);
        expect((corner?.x ?? 0) - (lane?.x ?? 0)).toBe(Math.abs(line.y - (lane?.y ?? 0)));
        return lane?.y !== line.y;
      });

    expect(bends(threeLines())).toEqual([true, false, true]);
    expect(bends(layoutNetwork([epic('a', 1), epic('b', 2)], []))).toEqual([true, true]);
  });

  it('starts a planned epic at the origin too', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2, 'planned')], []);
    expect(layout.lines[1]?.path[0]?.x).toBe(layout.origin.x);
  });

  it('puts the roundel on the row start, never under a station', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2), epic('c', 3), epic('d', 4), epic('e', 5)], [task('a1', 'a'), task('b1', 'b'), task('c1', 'c'), task('e1', 'e')]);
    const firstColumn = Math.min(...layout.lines.flatMap((line) => line.stations.map((station) => station.x)));

    for (const line of layout.lines) {
      expect(onPath(line.path, { x: line.startX, y: line.y })).toBe(true);
      expect(line.startX + ROUNDEL_RADIUS).toBeLessThanOrEqual(firstColumn - ROUNDEL_RADIUS);
    }
  });

  it('puts each epic on its own row, ordered by position, stations in creation order', () => {
    const layout = layoutNetwork([epic('b', 2), epic('a', 1)], [task('a1', 'a'), task('a2', 'a'), task('b1', 'b')]);

    expect(layout.lines.map((line) => [line.epic.id, line.y])).toEqual([
      ['a', TOP],
      ['b', TOP + ROW],
    ]);
    const [a1, a2] = layout.lines[0]?.stations ?? [];
    expect(a1?.task.id).toBe('a1');
    expect((a2?.x ?? 0) - (a1?.x ?? 0)).toBe(STEP);
  });

  it('places a task to the right of everything it waits on, across lines', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2)], [task('a1', 'a'), task('a2', 'a'), task('a3', 'a'), task('b1', 'b', ['a3'])]);

    const a1 = layout.lines[0]?.stations[0];
    const a3 = layout.lines[0]?.stations[2];
    const b1 = layout.lines[1]?.stations[0];
    expect((b1?.x ?? 0) - (a1?.x ?? 0)).toBe(3 * STEP);
    expect(layout.transfers).toEqual([{ fromTaskId: 'a3', toTaskId: 'b1', from: { x: a3?.x, y: a3?.y }, to: { x: b1?.x, y: b1?.y } }]);
  });

  it('draws no transfer for a dependency inside the same line, and keeps its station on the row', () => {
    const layout = layoutNetwork([epic('a', 1)], [task('a1', 'a'), task('a2', 'a', ['a1'])]);
    expect(layout.transfers).toEqual([]);
    expect(layout.lines[0]?.stations[1]?.y).toBe(layout.lines[0]?.y);
  });

  it('gives an empty epic a short stub line', () => {
    const [line] = layoutNetwork([epic('a', 1)], []).lines;
    expect(line?.stations).toEqual([]);
    expect(line?.endX).toBeGreaterThan(line?.startX ?? 0);
    expect(line?.path.at(-1)).toEqual({ x: line?.endX, y: line?.y });
  });

  it('sizes the drawing to its content, never below a readable minimum', () => {
    const small = layoutNetwork([epic('a', 1)], [task('a1', 'a')]);
    expect([small.width, small.height]).toEqual([1000, 380]);

    const wide = layoutNetwork([epic('a', 1)], Array.from({ length: 9 }, (_, index) => task(`a${index}`, 'a')));
    expect(wide.width).toBeGreaterThan((wide.lines[0]?.stations[0]?.x ?? 0) + 8 * STEP);
  });

  it('keeps stations of a line close together', () => {
    const layout = layoutNetwork([epic('a', 1)], [task('a1', 'a'), task('a2', 'a'), task('a3', 'a')]);
    const [first = 0, ...rest] = layout.lines[0]?.stations.map((station) => station.x) ?? [];
    expect(rest).toEqual([first + STEP, first + 2 * STEP]);
  });

  it('alternates station labels below and above within each line', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2)], [task('a1', 'a'), task('a2', 'a'), task('a3', 'a'), task('b1', 'b'), task('b2', 'b')]);
    expect(layout.lines.map((line) => line.stations.map((station) => station.labelSide))).toEqual([
      ['below', 'above', 'below'],
      ['below', 'above'],
    ]);
  });

  describe('interchanges', () => {
    const station = (layout: NetworkLayout, taskId: string) => layout.lines.flatMap((line) => line.stations).find((candidate) => candidate.task.id === taskId);
    const nextLine = () => layoutNetwork([epic('a', 1), epic('b', 2)], [task('a1', 'a'), task('a2', 'a'), task('b1', 'b'), task('b2', 'b', ['a2']), task('b3', 'b')]);

    it('draws a station that waits on the next line toward it, at most half a row away', () => {
      const layout = nextLine();
      const [a2, b2] = [station(layout, 'a2'), station(layout, 'b2')];
      const row = layout.lines[1]?.y ?? 0;

      expect(b2?.y).toBeLessThan(row);
      expect(row - (b2?.y ?? 0)).toBeLessThanOrEqual(ROW / 2);
      expect(layout.transfers).toEqual([{ fromTaskId: 'a2', toTaskId: 'b2', from: { x: a2?.x, y: a2?.y }, to: { x: b2?.x, y: b2?.y } }]);
    });

    it('brings the waiting line back to its row before its next station', () => {
      const layout = nextLine();
      const line = layout.lines[1];
      const [b2, b3] = [station(layout, 'b2'), station(layout, 'b3')];

      expect(b3?.y).toBe(line?.y);
      expect(onPath(line?.path ?? [], { x: ((b2?.x ?? 0) + (b3?.x ?? 0)) / 2, y: line?.y ?? 0 })).toBe(true);
    });

    it('bends toward a line two rows away without reaching the row in between', () => {
      const layout = layoutNetwork([epic('a', 1), epic('b', 2), epic('c', 3)], [task('a1', 'a'), task('c1', 'c'), task('c2', 'c', ['a1'])]);
      const c2 = station(layout, 'c2');

      expect(c2?.y).toBeLessThan(layout.lines[2]?.y ?? 0);
      expect(c2?.y).toBeGreaterThan(layout.lines[1]?.y ?? 0);
    });

    it('bends toward the first waited-on line in epic order', () => {
      const layout = layoutNetwork([epic('a', 1), epic('b', 2), epic('c', 3)], [task('a1', 'a'), task('c1', 'c'), task('b1', 'b'), task('b2', 'b', ['c1', 'a1'])]);
      const b2 = station(layout, 'b2');

      expect(b2?.y).toBeLessThan(layout.lines[1]?.y ?? 0);
      const toB2 = layout.transfers.filter((transfer) => transfer.toTaskId === 'b2');
      expect(toB2.map((transfer) => transfer.fromTaskId)).toEqual(['c1', 'a1']);
      for (const transfer of toB2) expect(transfer.to).toEqual({ x: b2?.x, y: b2?.y });
    });

    it('starts a line from the origin even when its first station waits on another line', () => {
      const layout = layoutNetwork([epic('a', 1), epic('b', 2)], [task('a1', 'a'), task('a2', 'a'), task('a3', 'a'), task('b1', 'b', ['a3'])]);
      const line = layout.lines[1];
      const b1 = station(layout, 'b1');

      expect(line?.path[0]?.x).toBe(layout.origin.x);
      expect(onPath(line?.path ?? [], { x: line?.startX ?? 0, y: line?.y ?? 0 })).toBe(true);
      expect(onPath(line?.path ?? [], { x: (b1?.x ?? 0) - STEP, y: line?.y ?? 0 })).toBe(true);
      expect(b1?.y).not.toBe(line?.y);
    });

    it('flags both ends of a transfer as interchanges, and nothing else', () => {
      const layout = nextLine();
      const flagged = layout.lines.flatMap((line) => line.stations.filter((candidate) => candidate.interchange).map((candidate) => candidate.task.id));
      expect(flagged).toEqual(['a2', 'b2']);
    });

    it('keeps paths octolinear through opposite consecutive bends and a bent last station', () => {
      expectOctolinearPaths(layoutNetwork([epic('a', 1), epic('b', 2), epic('c', 3)], [task('a1', 'a'), task('c1', 'c'), task('b1', 'b', ['a1']), task('b2', 'b', ['c1'])]));
      expectOctolinearPaths(layoutNetwork([epic('a', 1), epic('b', 2)], [task('a1', 'a'), task('b1', 'b', ['a1'])]));
    });
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
    const alone = layoutNetwork([epic('b', 2)], [task('b1', 'b')]);
    expect(layout.lines[0]?.stations.map((station) => [station.x, station.y, station.interchange])).toEqual([[alone.lines[0]?.stations[0]?.x, TOP, false]]);
    expect(layout.transfers).toEqual([]);
  });

  it('keeps the open line even when it is delivered', () => {
    const visible = withoutDeliveredLines(epics, tasks, 'a');
    expect(visible.epics.map((candidate) => candidate.id)).toEqual(['a', 'b']);
    expect(visible.tasks.map((candidate) => candidate.id)).toEqual(['a1', 'a2', 'b1']);
  });
});
