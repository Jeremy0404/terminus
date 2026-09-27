import { describe, expect, it } from 'vitest';
import type { EpicDto, TaskSummaryDto } from '@terminus/contracts';
import { interchangeIds, layoutNetwork, ROUNDEL_RADIUS, ROW, STEP, THIN_ROW, TOP, withoutDeliveredLines, type NetworkLayout, type Point } from './layout';

const epic = (id: string, position: number, status: EpicDto['status'] = 'active'): EpicDto => ({ id, appId: 'app', code: id.toUpperCase(), name: id, status, position, description: '', breakdown: { status: 'idle' } });
const task = (id: string, epicId: string, dependsOn: string[] = []): TaskSummaryDto => ({
  id,
  epicId,
  title: id,
  description: '',
  autonomy: 'up-to-pr',
  track: 'standard',
  lifecycleId: 'task',
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
    expect(line.path.at(-1)).toEqual(line.end);
    expect(line.end.y).toBe(line.y);
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
    expect(line?.end.x).toBeGreaterThan(line?.startX ?? 0);
    expect(line?.path.at(-1)).toEqual(line?.end);
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

describe('thin rows', () => {
  const sixLines = [1, 2, 3, 4, 5, 6].map((position) => epic(`l${position}`, position));
  const sixTasks = sixLines.map((line) => task(`${line.id}-1`, line.id));
  const allThin = new Set(sixLines.map((line) => line.id));

  it('packs finished lines closer together', () => {
    const full = layoutNetwork(sixLines, sixTasks);
    const thin = layoutNetwork(sixLines, sixTasks, allThin);

    expect(full.height - thin.height).toBe(5 * (ROW - THIN_ROW));
  });

  it('shortens the network by one pitch difference for a thin line between full ones, keeping epic order', () => {
    const lines = [epic('c', 3), epic('a', 1), epic('e', 5), epic('b', 2), epic('d', 4)];
    const tasks = lines.map((line) => task(`${line.id}1`, line.id));
    const full = layoutNetwork(lines, tasks);
    const thin = layoutNetwork(lines, tasks, new Set(['c']));

    expect(full.height - thin.height).toBe(ROW - THIN_ROW);
    expect(thin.lines.map((line) => line.epic.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    const ys = thin.lines.map((line) => line.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it('keeps thin rows octolinear, fanned out from ordered lanes through one 45° segment', () => {
    const lines = [...sixLines, epic('l7', 7)];
    const tasks = [...sixTasks, task('l7-1', 'l7'), task('l7-2', 'l7', ['l2-1']), task('l4-2', 'l4', ['l7-1'])];
    const layout = layoutNetwork(lines, tasks, new Set(['l1', 'l2', 'l5']));

    expectOctolinearPaths(layout);
    const lanes = layout.lines.map((line) => line.path[0]?.y ?? NaN);
    expect(lanes).toEqual([...lanes].sort((a, b) => a - b));
    for (const [index, line] of layout.lines.entries()) {
      const [lane, corner] = line.path;
      expect(lane?.y).toBeGreaterThanOrEqual(layout.origin.top);
      expect(lane?.y).toBeLessThanOrEqual(layout.origin.bottom);
      expect(corner?.y).toBe(line.y);
      expect((corner?.x ?? 0) - (lane?.x ?? 0)).toBeCloseTo(Math.abs(line.y - (lane?.y ?? 0)));
      expect(line.startX + ROUNDEL_RADIUS).toBeLessThanOrEqual(Math.min(...layout.lines.flatMap((other) => other.stations.map((station) => station.x))) - ROUNDEL_RADIUS);
      expect(index === 0 || line.y > (layout.lines[index - 1]?.y ?? 0)).toBe(true);
    }
  });

  it('keeps the interchange stations of a thin line on its row', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2)], [task('a1', 'a'), task('b1', 'b', ['a1'])], new Set(['b']));
    const b1 = layout.lines[1]?.stations[0];

    expect(b1?.y).toBe(layout.lines[1]?.y);
    expect(b1?.interchange).toBe(true);
  });
});

describe('wrapped line', () => {
  const tasksOf = (epicId: string, count: number): TaskSummaryDto[] => Array.from({ length: count }, (_, index) => task(`${epicId}${index + 1}`, epicId));
  const lineOf = (layout: NetworkLayout, epicId: string) => layout.lines.find((line) => line.epic.id === epicId);
  const rowsOf = (layout: NetworkLayout, epicId: string): number[] => [...new Set(lineOf(layout, epicId)?.stations.map((station) => station.y))];
  const along = (path: readonly Point[], point: Point): number => {
    let travelled = 0;
    for (const [index, to] of path.slice(1).entries()) {
      const from = path[index] ?? to;
      if (onPath([from, to], point)) return travelled + Math.hypot(point.x - from.x, point.y - from.y);
      travelled += Math.hypot(to.x - from.x, to.y - from.y);
    }
    return NaN;
  };
  const expectOctolinear = (path: readonly Point[]): void => {
    for (const [index, to] of path.slice(1).entries()) {
      const from = path[index] ?? to;
      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);
      expect(dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-9).toBe(true);
    }
  };
  const distanceToSegment = (point: Point, from: Point, to: Point): number => {
    const length = (to.x - from.x) ** 2 + (to.y - from.y) ** 2;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * (to.x - from.x) + (point.y - from.y) * (to.y - from.y)) / length));
    return Math.hypot(point.x - from.x - t * (to.x - from.x), point.y - from.y - t * (to.y - from.y));
  };
  const crosses = (a: Point, b: Point, c: Point, d: Point): boolean => {
    const side = (p: Point, q: Point, r: Point): number => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
  };
  const segmentDistance = (a: Point, b: Point, c: Point, d: Point): number =>
    crosses(a, b, c, d) ? 0 : Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));

  it('keeps a line that fits on one straight row, re-spaced from its roundel', () => {
    const epics = [epic('a', 1), epic('b', 2), epic('c', 3)];
    const tasks = [...tasksOf('a', 1), ...tasksOf('b', 4), ...tasksOf('c', 1)];
    const network = layoutNetwork(epics, tasks);
    const layout = layoutNetwork(epics, tasks, new Set(), { epicId: 'b', columns: 4 });
    const line = lineOf(layout, 'b');
    const xs = line?.stations.map((station) => station.x) ?? [];
    const startX = line?.startX ?? NaN;

    expect(rowsOf(layout, 'b')).toEqual([line?.y]);
    expect(xs).toEqual([startX + 60, startX + 60 + STEP, startX + 60 + 2 * STEP, startX + 60 + 3 * STEP]);
    expect(xs[0]).toBeLessThan(lineOf(network, 'b')?.stations[0]?.x ?? NaN);
  });

  it('wraps a longer line onto the fewest rows, one row apart, spread evenly', () => {
    const layout = layoutNetwork([epic('a', 1)], tasksOf('a', 13), new Set(), { epicId: 'a', columns: 4 });
    const line = lineOf(layout, 'a');
    const rows = rowsOf(layout, 'a');

    expect(rows).toEqual([TOP, TOP + ROW, TOP + 2 * ROW, TOP + 3 * ROW]);
    expect(rows.map((y) => line?.stations.filter((station) => station.y === y).length)).toEqual([4, 3, 3, 3]);
  });

  it('snakes from row to row along one octolinear path that ends past the last station', () => {
    const layout = layoutNetwork([epic('a', 1)], tasksOf('a', 13), new Set(), { epicId: 'a', columns: 4 });
    const line = lineOf(layout, 'a');
    const stations = line?.stations ?? [];
    const path = line?.path ?? [];

    for (const [index, station] of stations.entries()) {
      const previous = stations[index - 1];
      if (!previous) continue;
      if (previous.y === station.y) expect(station.x - previous.x).toBe(((station.y - TOP) / ROW) % 2 === 0 ? STEP : -STEP);
      else expect([station.x, station.y - previous.y]).toEqual([previous.x, ROW]);
      expect(along(path, station)).toBeGreaterThan(along(path, previous));
    }
    expectOctolinear(path);
    const last = stations.at(-1);
    expect(path.at(-1)).toEqual(line?.end);
    expect(line?.end).toEqual({ x: (last?.x ?? NaN) - STEP / 2, y: last?.y });
  });

  it('moves the lines below down by the added rows and fans every line out from the recentred origin', () => {
    const epics = [epic('a', 1), epic('b', 2), epic('c', 3)];
    const tasks = [...tasksOf('a', 2), ...tasksOf('b', 9), ...tasksOf('c', 2)];
    const network = layoutNetwork(epics, tasks);
    const layout = layoutNetwork(epics, tasks, new Set(), { epicId: 'b', columns: 4 });

    expect(lineOf(layout, 'a')?.y).toBe(lineOf(network, 'a')?.y);
    expect(lineOf(layout, 'b')?.y).toBe(lineOf(network, 'b')?.y);
    expect(lineOf(layout, 'c')?.y).toBe((lineOf(network, 'c')?.y ?? NaN) + 2 * ROW);
    expect(layout.origin.y).toBe((TOP + (lineOf(layout, 'c')?.y ?? NaN)) / 2);
    expect(layout.height).toBe(network.height + 2 * ROW);
    for (const line of layout.lines) {
      const [lane, corner] = line.path;
      expect(lane?.x).toBe(layout.origin.x);
      expect(lane?.y).toBeGreaterThanOrEqual(layout.origin.top);
      expect(lane?.y).toBeLessThanOrEqual(layout.origin.bottom);
      expect(corner?.y).toBe(line.y);
      expect((corner?.x ?? 0) - (lane?.x ?? 0)).toBe(Math.abs(line.y - (lane?.y ?? 0)));
    }
  });

  it('keeps the other lines on the network grid, shifted as one', () => {
    const epics = [epic('a', 1), epic('b', 2), epic('c', 3)];
    const tasks = [...tasksOf('a', 3), ...tasksOf('b', 9), ...tasksOf('c', 2)];
    const network = layoutNetwork(epics, tasks);
    const layout = layoutNetwork(epics, tasks, new Set(), { epicId: 'b', columns: 4 });
    const others = (from: NetworkLayout) => from.lines.filter((line) => line.epic.id !== 'b').flatMap((line) => line.stations.map((station) => station.x));
    const shift = (others(layout)[0] ?? NaN) - (others(network)[0] ?? NaN);

    expect(others(layout)).toEqual(others(network).map((x) => x + shift));
  });

  it('keeps the wrapped rows clear of the fans of the lines below', () => {
    const epics = [epic('a', 1), epic('b', 2), epic('c', 3), epic('d', 4)];
    const layout = layoutNetwork(epics, [...tasksOf('a', 2), ...tasksOf('b', 2), ...tasksOf('c', 12), ...tasksOf('d', 2)], new Set(), { epicId: 'c', columns: 4 });
    const line = lineOf(layout, 'c');
    const afterRoundel = [{ x: line?.startX ?? NaN, y: line?.y ?? NaN }, ...(line?.path.slice(2) ?? [])];
    const [lane, corner] = lineOf(layout, 'd')?.path ?? [];

    expect(rowsOf(layout, 'c')).toHaveLength(3);
    for (const [index, to] of afterRoundel.slice(1).entries()) {
      const from = afterRoundel[index] ?? to;
      expect(segmentDistance(from, to, lane ?? from, corner ?? from)).toBeGreaterThanOrEqual(20);
    }
  });

  it('keeps the roundel at the end of its fan when no fan comes near', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2), epic('c', 3)], [...tasksOf('a', 12), ...tasksOf('b', 2), ...tasksOf('c', 2)], new Set(), { epicId: 'a', columns: 4 });
    const line = lineOf(layout, 'a');

    expect(line?.startX).toBe(line?.path[1]?.x);
  });

  it('starts a transfer from the re-spaced station on its wrapped row', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2)], [...tasksOf('a', 9), task('b1', 'b', ['a7'])], new Set(), { epicId: 'a', columns: 4 });
    const a7 = lineOf(layout, 'a')?.stations[6];

    expect(a7?.y).toBeGreaterThan(lineOf(layout, 'a')?.y ?? NaN);
    expect(layout.transfers[0]?.from).toEqual({ x: a7?.x, y: a7?.y });
  });

  it('bends an interchange on a right-to-left row toward the line it waits on', () => {
    const tasks = [...tasksOf('a', 5), task('a6', 'a', ['b1']), ...tasksOf('a', 12).slice(6), task('b1', 'b')];
    const layout = layoutNetwork([epic('a', 1), epic('b', 2)], tasks, new Set(), { epicId: 'a', columns: 4 });
    const line = lineOf(layout, 'a');
    const a6 = line?.stations[5];
    const neighbours = [line?.stations[4], line?.stations[6]];

    expect(neighbours.map((station) => station?.y)).toEqual([TOP + ROW, TOP + ROW]);
    expect(a6?.y).toBe(TOP + ROW + 30);
    expect((neighbours[0]?.x ?? NaN) - (a6?.x ?? NaN)).toBe(STEP);
    expect(onPath(line?.path ?? [], a6 ?? { x: NaN, y: NaN })).toBe(true);
    expectOctolinear(line?.path ?? []);
  });

  it('gives an empty opened line a one-row stub from its roundel', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2)], tasksOf('b', 3), new Set(), { epicId: 'a', columns: 4 });
    const line = lineOf(layout, 'a');

    expect(line?.end.y).toBe(line?.y);
    expect(line?.end.x).toBeGreaterThan(line?.startX ?? NaN);
    expect(line?.path.at(-1)).toEqual(line?.end);
    expect(lineOf(layout, 'b')?.y).toBe(TOP + ROW);
  });
});

describe('interchangeIds', () => {
  it('flags both ends of a cross-line dependency, and nothing else', () => {
    const tasks = [task('a1', 'a'), task('a2', 'a'), task('b1', 'b', ['a1']), task('b2', 'b', ['b1']), task('b3', 'b', ['gone'])];
    expect([...interchangeIds(tasks)].sort()).toEqual(['a1', 'b1']);
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
