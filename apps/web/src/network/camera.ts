import { LEFT, MIN_WIDTH, ROUNDEL_RADIUS, ROW, STEP, TURN, type LinePosition, type NetworkLayout } from './layout';

export type ViewBox = readonly [x: number, y: number, width: number, height: number];

export interface Frame {
  readonly width: number;
  readonly height: number;
}

export interface Canvas {
  readonly viewBox: ViewBox;
  readonly width: number;
  readonly height: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

export const MIN_SCALE = 0.72;
export const MIN_LINE_VIEW = 750;
const LINE_START_MARGIN = LEFT + 10;
const LINE_END_MARGIN = 80;
const LANDING_LEAD = 2 * STEP;
export const WRAP_SCALE = 0.85;
const LINE_MARGIN = 20;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function networkScale(layout: NetworkLayout, frame: Frame): number {
  return Math.min(frame.width / layout.width, frame.height / layout.height);
}

export function lineScale(frameWidth: number): number {
  return Math.max(frameWidth / MIN_WIDTH, MIN_SCALE);
}

export function mapHeight(layout: NetworkLayout, frameWidth: number): number {
  return Math.max((layout.height * frameWidth) / layout.width, frameWidth / 2);
}

export function networkView(layout: NetworkLayout, frame: Frame): ViewBox {
  const scale = networkScale(layout, frame);
  const width = frame.width / scale;
  const height = frame.height / scale;
  const centred = (content: number, visible: number): number => (content < visible ? (content - visible) / 2 : 0);
  return [centred(layout.width, width), centred(layout.height, height), width, height];
}

export function lineView(layout: NetworkLayout, epicId: string, frame: Frame): ViewBox {
  const line = layout.lines.find((candidate) => candidate.epic.id === epicId);
  if (!line) return networkView(layout, frame);
  const start = line.startX - LINE_START_MARGIN;
  const end = line.end.x + LINE_END_MARGIN;
  const width = Math.min(Math.max(end - start, MIN_LINE_VIEW), frame.width / lineScale(frame.width));
  const height = (width * frame.height) / frame.width;
  const landing = line.stations.find((station) => station.task.status.kind !== 'done');
  const fits = !landing || landing.x + STEP <= start + width;
  const x = fits ? start : Math.max(start, Math.min(landing.x - LANDING_LEAD, end - width));
  return [x, line.y - height / 2, width, height];
}

export function wrapColumns(frameWidth: number): number {
  return Math.max(1, Math.floor((frameWidth / WRAP_SCALE - 2 * TURN - 2 * LINE_MARGIN) / STEP) + 1);
}

function lineBox(line: LinePosition): Box {
  const xs = line.stations.flatMap((station) => [station.x - TURN, station.x + TURN]);
  const ys = line.stations.map((station) => station.y);
  const left = Math.min(...xs, line.startX - ROUNDEL_RADIUS, line.end.x) - LINE_MARGIN;
  const right = Math.max(...xs, line.end.x) + LINE_MARGIN;
  const top = Math.min(...ys, line.y) - ROW / 2 - LINE_MARGIN;
  const bottom = Math.max(...ys, line.end.y) + ROW / 2 + LINE_MARGIN;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function fittedLineView(layout: NetworkLayout, epicId: string, frame: Frame): ViewBox {
  const line = layout.lines.find((candidate) => candidate.epic.id === epicId);
  if (!line) return networkView(layout, frame);
  const box = lineBox(line);
  const scale = Math.min(frame.width / box.width, frame.height / box.height, Math.max(frame.width / MIN_LINE_VIEW, WRAP_SCALE));
  const width = frame.width / scale;
  const height = frame.height / scale;
  return [box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height];
}

export function fittedLineHeight(layout: NetworkLayout, epicId: string): number {
  const line = layout.lines.find((candidate) => candidate.epic.id === epicId);
  return line ? Math.ceil(lineBox(line).height * WRAP_SCALE) : 0;
}

export function fittedCanvas(view: ViewBox, frame: Frame): Canvas {
  return { viewBox: view, width: frame.width, height: frame.height, scrollLeft: 0, scrollTop: 0 };
}

export function reveal(view: ViewBox, point: { readonly x: number; readonly y: number }, margin: number): ViewBox {
  const [x, y, width, height] = view;
  const shift = (from: number, size: number, at: number): number =>
    at < from + margin ? at - margin : at > from + size - margin ? at + margin - size : from;
  return [shift(x, width, point.x), shift(y, height, point.y), width, height];
}

export function canvasFor(view: ViewBox, layout: NetworkLayout, frame: Frame): Canvas {
  const [x, y, width, height] = view;
  const left = Math.min(0, x);
  const top = Math.min(0, y);
  const right = Math.max(layout.width, x + width);
  const bottom = Math.max(layout.height, y + height);
  const scale = frame.width / width;
  return {
    viewBox: [left, top, right - left, bottom - top],
    width: (right - left) * scale,
    height: (bottom - top) * scale,
    scrollLeft: (x - left) * scale,
    scrollTop: (y - top) * scale,
  };
}

export function viewOf(canvas: Canvas, scroll: { readonly left: number; readonly top: number }, frame: Frame): ViewBox {
  const scale = canvas.width / canvas.viewBox[2];
  return [canvas.viewBox[0] + scroll.left / scale, canvas.viewBox[1] + scroll.top / scale, frame.width / scale, frame.height / scale];
}

export function pinnedLines(layout: NetworkLayout, view: ViewBox): readonly LinePosition[] {
  return layout.lines.filter((line) => line.startX - ROUNDEL_RADIUS < view[0]);
}
