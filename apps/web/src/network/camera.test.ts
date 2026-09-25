import { describe, expect, it } from 'vitest';
import type { EpicDto, TaskSummaryDto } from '@terminus/contracts';
import { canvasFor, lineView, mapHeight, networkScale, networkView, pinnedLines, reveal, viewOf, type Frame, type ViewBox } from './camera';
import { layoutNetwork, LEFT, MIN_WIDTH, STEP } from './layout';

const epic = (id: string, position: number): EpicDto => ({ id, appId: 'app', code: id.toUpperCase(), name: id, status: 'active', position, description: '', breakdown: { status: 'idle' } });
const task = (id: string, epicId: string, status: TaskSummaryDto['status'] = { kind: 'todo' }): TaskSummaryDto => ({
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
  status,
  dependsOn: [],
});

const FRAME: Frame = { width: 970, height: 485 };
const epics = (count: number): EpicDto[] => Array.from({ length: count }, (_, index) => epic(`e${index}`, index + 1));
const oneTaskPerEpic = (list: EpicDto[]): TaskSummaryDto[] => list.map((line) => task(`${line.id}-1`, line.id));
const longLine = (count: number, done = 0): TaskSummaryDto[] =>
  Array.from({ length: count }, (_, index) => task(`a${index + 1}`, 'a', index < done ? { kind: 'done' } : { kind: 'todo' }));
const contains = ([x, y, width, height]: ViewBox, point: { x: number; y: number }): boolean =>
  point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;

describe('network view', () => {
  it('draws many epics at the same scale as one, from the top-left, and scrolls the rest', () => {
    const few = epics(1);
    const many = epics(20);
    const small = networkView(layoutNetwork(few, oneTaskPerEpic(few)), FRAME);
    const layout = layoutNetwork(many, oneTaskPerEpic(many));
    const large = networkView(layout, FRAME);

    expect(large[2]).toBe(small[2]);
    expect([large[0], large[1]]).toEqual([0, 0]);
    expect(canvasFor(large, layout, FRAME).height).toBeGreaterThan(FRAME.height);
  });

  it('draws a small network exactly in the box, centred vertically, without scroll', () => {
    const few = epics(1);
    const layout = layoutNetwork(few, oneTaskPerEpic(few));
    const canvas = canvasFor(networkView(layout, FRAME), layout, FRAME);

    expect([canvas.width, canvas.height]).toEqual([970, 485]);
    expect([canvas.scrollLeft, canvas.scrollTop]).toEqual([0, 0]);
    expect(canvas.viewBox[1]).toBeLessThan(0);
  });

  it('never shrinks below a legible scale in a narrow box', () => {
    expect(networkScale(500)).toBe(0.72);
    expect(networkScale(970)).toBe(970 / MIN_WIDTH);
  });

  it('grows the map with its lines, never below half the box width', () => {
    const many = epics(20);
    const layout = layoutNetwork(many, oneTaskPerEpic(many));
    expect(mapHeight(layout, 970)).toBe(layout.height * 0.97);

    const few = epics(1);
    expect(mapHeight(layoutNetwork(few, oneTaskPerEpic(few)), 970)).toBe(485);
  });
});

describe('line view', () => {
  it('never zooms out past the network scale on a long line, and the rest stays reachable', () => {
    const layout = layoutNetwork([epic('a', 1)], longLine(30));
    const view = lineView(layout, 'a', FRAME);
    const canvas = canvasFor(view, layout, FRAME);
    const last = layout.lines[0]?.stations.at(-1);

    expect(view[2]).toBe(networkView(layout, FRAME)[2]);
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
  const dependent = { ...task('b1', 'b'), dependsOn: ['a3'] };
  const layout = layoutNetwork([epic('a', 1), epic('b', 2)], [...longLine(10), dependent]);
  const pinned = (x: number): string[] => pinnedLines(layout, [x, 0, 1000, 500]).map((line) => line.epic.id);

  it('pins nothing while the line starts are in view', () => {
    expect(pinned(-10)).toEqual([]);
  });

  it('pins a line once its roundel has scrolled out on the left', () => {
    expect(pinned(300)).toEqual(['a']);
  });

  it('pins a line that starts further right only once its own start has scrolled out', () => {
    expect(layout.lines[1]?.startX).toBe(LEFT + 3 * STEP);
    expect(pinned(500)).toEqual(['a', 'b']);
  });
});
