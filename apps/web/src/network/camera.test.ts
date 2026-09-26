import { describe, expect, it } from 'vitest';
import type { EpicDto, TaskSummaryDto } from '@terminus/contracts';
import { canvasFor, lineScale, lineView, mapHeight, MIN_SCALE, networkScale, networkView, pinnedLines, reveal, viewOf, type Frame, type ViewBox } from './camera';
import { layoutNetwork, LEFT, MIN_WIDTH, ROUNDEL_RADIUS, STEP } from './layout';

const epic = (id: string, position: number): EpicDto => ({ id, appId: 'app', code: id.toUpperCase(), name: id, status: 'active', position, description: '', breakdown: { status: 'idle' } });
const task = (id: string, epicId: string, status: TaskSummaryDto['status'] = { kind: 'todo' }): TaskSummaryDto => ({
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
  status,
  dependsOn: [],
});

const FRAME: Frame = { width: 970, height: 485 };
const FIT_TOLERANCE = 1e-6;
const epics = (count: number): EpicDto[] => Array.from({ length: count }, (_, index) => epic(`e${index}`, index + 1));
const oneTaskPerEpic = (list: EpicDto[]): TaskSummaryDto[] => list.map((line) => task(`${line.id}-1`, line.id));
const longLine = (count: number, done = 0): TaskSummaryDto[] =>
  Array.from({ length: count }, (_, index) => task(`a${index + 1}`, 'a', index < done ? { kind: 'done' } : { kind: 'todo' }));
const contains = ([x, y, width, height]: ViewBox, point: { x: number; y: number }): boolean =>
  point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;

describe('network view', () => {
  it('fits a tall network and a single line in the box, without scroll', () => {
    for (const count of [20, 1]) {
      const list = epics(count);
      const layout = layoutNetwork(list, oneTaskPerEpic(list));
      const canvas = canvasFor(networkView(layout, FRAME), layout, FRAME);

      expect(canvas.width).toBeLessThanOrEqual(FRAME.width + FIT_TOLERANCE);
      expect(canvas.height).toBeLessThanOrEqual(FRAME.height + FIT_TOLERANCE);
      expect([canvas.scrollLeft, canvas.scrollTop]).toEqual([0, 0]);
    }
  });

  it('draws a small network exactly in the box, centred vertically, without scroll', () => {
    const few = epics(1);
    const layout = layoutNetwork(few, oneTaskPerEpic(few));
    const canvas = canvasFor(networkView(layout, FRAME), layout, FRAME);

    expect([canvas.width, canvas.height]).toEqual([970, 485]);
    expect([canvas.scrollLeft, canvas.scrollTop]).toEqual([0, 0]);
    expect(canvas.viewBox[1]).toBeLessThan(0);
  });

  it('shrinks below the legible line scale when that is what it takes to fit', () => {
    const many = epics(20);
    const tall = layoutNetwork(many, oneTaskPerEpic(many));
    const tallCanvas = canvasFor(networkView(tall, FRAME), tall, FRAME);
    expect(networkScale(tall, FRAME)).toBeLessThan(MIN_SCALE);
    expect(tallCanvas.height).toBeCloseTo(FRAME.height);
    expect(tallCanvas.width).toBeLessThanOrEqual(FRAME.width + FIT_TOLERANCE);

    const narrow: Frame = { width: 500, height: 250 };
    const few = epics(1);
    const wide = layoutNetwork(few, oneTaskPerEpic(few));
    const wideCanvas = canvasFor(networkView(wide, narrow), wide, narrow);
    expect(networkScale(wide, narrow)).toBeLessThan(MIN_SCALE);
    expect(wideCanvas.width).toBeCloseTo(narrow.width);
    expect(wideCanvas.height).toBeLessThanOrEqual(narrow.height + FIT_TOLERANCE);
  });

  it('never zooms a line out below a legible scale in a narrow box', () => {
    expect(lineScale(500)).toBe(0.72);
    expect(lineScale(970)).toBe(970 / MIN_WIDTH);
  });

  it('fits the frame height to the network drawn at full width, never below half the box width', () => {
    const many = epics(20);
    const layout = layoutNetwork(many, oneTaskPerEpic(many));
    expect(mapHeight(layout, 970)).toBeCloseTo((layout.height * 970) / layout.width);

    const few = epics(1);
    expect(mapHeight(layoutNetwork(few, oneTaskPerEpic(few)), 970)).toBe(485);
  });
});

describe('line view', () => {
  it('never zooms out past the legible scale on a long line, and the rest stays reachable', () => {
    const layout = layoutNetwork([epic('a', 1)], longLine(30));
    const view = lineView(layout, 'a', FRAME);
    const canvas = canvasFor(view, layout, FRAME);
    const last = layout.lines[0]?.stations.at(-1);

    expect(view[2]).toBe(FRAME.width / lineScale(FRAME.width));
    expect(last && last.x > view[0] + view[2]).toBe(true);
    expect(last && contains(canvas.viewBox, last)).toBe(true);
  });

  it('zooms onto a short line without cutting its name', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2)], [...longLine(6), task('b1', 'b')]);
    const [x, , width] = lineView(layout, 'b', FRAME);

    expect(width).toBe(750);
    expect(x).toBeLessThan(LEFT - STEP);
    expect(width).toBeGreaterThanOrEqual(layout.width * 0.55);
  });

  it('keeps the line start in view when the first unfinished station fits on the first screen', () => {
    const layout = layoutNetwork([epic('a', 1)], longLine(30, 3));
    const line = layout.lines[0];
    const fourth = line?.stations[3];
    const view = lineView(layout, 'a', FRAME);

    expect(view[0]).toBe((line?.startX ?? 0) - LEFT - 10);
    expect(fourth && contains(view, fourth)).toBe(true);
  });

  it('lands on the first unfinished station further down a long line', () => {
    const layout = layoutNetwork([epic('a', 1)], longLine(30, 20));
    const station21 = layout.lines[0]?.stations[20];
    const view = lineView(layout, 'a', FRAME);

    expect(station21 && contains(view, station21)).toBe(true);
  });

  it('centres the top line and grows the canvas above and left of it', () => {
    const layout = layoutNetwork([epic('a', 1), epic('b', 2)], [task('a1', 'a'), task('b1', 'b')]);
    const view = lineView(layout, 'a', FRAME);
    const canvas = canvasFor(view, layout, FRAME);

    expect(view[1] + view[3] / 2).toBe(layout.lines[0]?.y);
    expect(view[1]).toBeLessThan(0);
    expect([canvas.viewBox[0], canvas.viewBox[1]]).toEqual([view[0], view[1]]);
    expect([canvas.scrollLeft, canvas.scrollTop]).toEqual([0, 0]);
  });
});

describe('reveal', () => {
  const view: ViewBox = [0, 0, 1000, 500];

  it('leaves the view alone when the point is already well inside', () => {
    expect(reveal(view, { x: 500, y: 250 }, 80)).toEqual(view);
  });

  it('moves the view just enough to bring a point on the right into view', () => {
    expect(reveal(view, { x: 1500, y: 250 }, 80)).toEqual([580, 0, 1000, 500]);
  });

  it('moves the view just enough to bring a point on the left into view', () => {
    expect(reveal([1000, 0, 1000, 500], { x: 900, y: 250 }, 80)).toEqual([820, 0, 1000, 500]);
  });
});

describe('scroll round trip', () => {
  it('reads back the view it scrolled to', () => {
    const layout = layoutNetwork([epic('a', 1)], longLine(30));
    const view: ViewBox = [400, 20, 750, 375];
    const canvas = canvasFor(view, layout, FRAME);

    const back = viewOf(canvas, { left: canvas.scrollLeft, top: canvas.scrollTop }, FRAME);
    back.forEach((value, index) => expect(value).toBeCloseTo(view[index] ?? NaN));
  });
});

describe('pinned lines', () => {
  const layout = layoutNetwork([epic('a', 1), epic('b', 2), epic('c', 3)], [...longLine(10), task('b1', 'b'), task('c1', 'c')]);
  const pinned = (x: number): string[] => pinnedLines(layout, [x, 0, 1000, 500]).map((line) => line.epic.id);
  const roundelEdge = (index: number): number => (layout.lines[index]?.startX ?? 0) - ROUNDEL_RADIUS;

  it('pins nothing while the line starts are in view', () => {
    expect(pinned(-10)).toEqual([]);
  });

  it('pins a line once its own roundel has scrolled out on the left', () => {
    expect(roundelEdge(1)).toBeLessThan(roundelEdge(0));
    expect(pinned((roundelEdge(1) + roundelEdge(0)) / 2)).toEqual(['b']);
    expect(pinned(roundelEdge(0) + 1)).toEqual(['a', 'b', 'c']);
  });
});
