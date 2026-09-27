import type { EpicDto, TaskSummaryDto } from '@terminus/contracts';
import { finishedLine } from './exploration';
import { serpentine } from './serpentine';

export const STEP = 80;
export const ROW = 130;
export const THIN_ROW = 50;
export const LEFT = 230;
export const TOP = 110;
export const ROUNDEL_RADIUS = 17;
const ROW_START_MIN_RUN = 40;
const ORIGIN_X = LEFT - ROW_START_MIN_RUN;
const LANE = 36;
const FIRST_STATION_GAP = 60;
const INTERCHANGE_BEND = 30;
const INTERCHANGE_PLATEAU = 10;
const RIGHT_MARGIN = 140;
const BOTTOM_MARGIN = 70;
export const MIN_WIDTH = 1000;
const MIN_HEIGHT = 380;
export const TURN = STEP;
const TURN_CORNER = 20;
const FAN_CLEARANCE = STEP / 2;

export type LabelSide = 'below' | 'above';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface StationPosition {
  readonly task: TaskSummaryDto;
  readonly x: number;
  readonly y: number;
  readonly labelSide: LabelSide;
  readonly interchange: boolean;
}

export interface LinePosition {
  readonly epic: EpicDto;
  readonly y: number;
  readonly startX: number;
  readonly end: Point;
  readonly path: readonly Point[];
  readonly stations: readonly StationPosition[];
}

export interface TransferPosition {
  readonly fromTaskId: string;
  readonly toTaskId: string;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
}

export interface OriginPosition {
  readonly x: number;
  readonly y: number;
  readonly top: number;
  readonly bottom: number;
}

export interface Wrap {
  readonly epicId: string;
  readonly columns: number;
}

export interface NetworkLayout {
  readonly origin: OriginPosition;
  readonly lines: readonly LinePosition[];
  readonly transfers: readonly TransferPosition[];
  readonly width: number;
  readonly height: number;
}

export function layoutNetwork(epics: readonly EpicDto[], tasks: readonly TaskSummaryDto[], thin: ReadonlySet<string> = new Set(), wrap?: Wrap): NetworkLayout {
  const orderedEpics = [...epics].sort((a, b) => a.position - b.position);
  const ranks = rankTasks(tasks);
  const middle = Math.max(orderedEpics.length - 1, 0) / 2;
  const slots = wrap ? serpentine(tasks.filter((task) => task.epicId === wrap.epicId).length, wrap.columns) : [];
  const rowCounts = orderedEpics.map((epic) => (epic.id === wrap?.epicId ? (slots.at(-1)?.row ?? 0) + 1 : 1));
  const allRows = rowPositions(orderedEpics.flatMap((epic, index) => Array.from({ length: rowCounts[index] ?? 1 }, () => (thin.has(epic.id) ? THIN_ROW : ROW))));
  const epicRows = rowCounts.map((count, index) => {
    const first = rowCounts.slice(0, index).reduce((sum, previous) => sum + previous, 0);
    return allRows.slice(first, first + count);
  });
  const rowYs = epicRows.map((rows) => rows[0] ?? TOP);
  const lastRow = allRows.at(-1) ?? TOP;
  const originY = (TOP + lastRow) / 2;
  const origin: OriginPosition = { x: ORIGIN_X, y: originY, top: originY - middle * LANE, bottom: originY + middle * LANE };
  const laneOf = (index: number): number => originY + (index - middle) * LANE;
  const fanOf = (index: number): number => Math.abs((rowYs[index] ?? TOP) - laneOf(index));
  const firstX = ORIGIN_X + Math.max(...orderedEpics.map((_, index) => fanOf(index)), ROW_START_MIN_RUN) + FIRST_STATION_GAP;
  const rows = new Map(orderedEpics.map((epic, index) => [epic.id, rowYs[index] ?? TOP]));
  const lineIndex = new Map(orderedEpics.map((epic, index) => [epic.id, index]));
  const xOf = (taskId: string): number => firstX + (ranks.get(taskId) ?? 0) * STEP;
  const epicOf = new Map(tasks.map((task) => [task.id, task.epicId]));
  const crossDependencies = (task: TaskSummaryDto): string[] => crossLineDependencies(task, epicOf);
  const interchanges = interchangeIds(tasks);
  const bendOf = (task: TaskSummaryDto, index: number): number => {
    if (thin.has(task.epicId)) return 0;
    const waitedOn = crossDependencies(task).flatMap((dependency) => lineIndex.get(epicOf.get(dependency) ?? '') ?? []);
    return waitedOn.length === 0 ? 0 : Math.sign(Math.min(...waitedOn) - index) * INTERCHANGE_BEND;
  };

  const wrappedLine = (epic: EpicDto, index: number): LinePosition => {
    const rowsOfLine = epicRows[index] ?? [TOP];
    const y = rowsOfLine[0] ?? TOP;
    const lastY = rowsOfLine.at(-1) ?? y;
    const fan = fanOf(index);
    const nextLane = index + 1 < orderedEpics.length ? laneOf(index + 1) : lastY;
    const clearOfNextFan = nextLane < lastY ? ORIGIN_X + (lastY - nextLane) + FAN_CLEARANCE + TURN - FIRST_STATION_GAP : 0;
    const startX = Math.max(ORIGIN_X + Math.max(fan, ROW_START_MIN_RUN), clearOfNextFan);
    const columnX = (column: number): number => startX + FIRST_STATION_GAP + column * STEP;
    const stations = tasks
      .filter((task) => task.epicId === epic.id)
      .map((task, position): StationPosition => {
        const slot = slots[position] ?? { row: 0, column: position };
        return {
          task,
          x: columnX(slot.column),
          y: (rowsOfLine[slot.row] ?? y) + bendOf(task, index),
          labelSide: position % 2 === 0 ? 'below' : 'above',
          interchange: interchanges.has(task.id),
        };
      });
    const directionOf = (row: number): number => (row % 2 === 0 ? 1 : -1);
    const end: Point = { x: (stations.at(-1)?.x ?? columnX(0)) + (directionOf(rowsOfLine.length - 1) * STEP) / 2, y: lastY };
    const path: Point[] = [{ x: ORIGIN_X, y: laneOf(index) }];
    let rowStart: Point = { x: ORIGIN_X + fan, y };
    for (const [row, rowY] of rowsOfLine.entries()) {
      const direction = directionOf(row);
      const onRow = stations.filter((_, position) => slots[position]?.row === row);
      const turnX = (onRow.at(-1)?.x ?? columnX(0)) + direction * TURN;
      const nextY = rowsOfLine[row + 1];
      path.push(...trackToward(direction, rowStart, [...onRow, nextY === undefined ? end : { x: turnX - direction * TURN_CORNER, y: rowY }]));
      if (nextY === undefined) continue;
      path.push({ x: turnX, y: rowY + TURN_CORNER }, { x: turnX, y: nextY - TURN_CORNER });
      rowStart = { x: turnX - direction * TURN_CORNER, y: nextY };
    }
    return { epic, y, startX, end, path, stations };
  };

  const lines = orderedEpics.map((epic, index): LinePosition => {
    if (epic.id === wrap?.epicId) return wrappedLine(epic, index);
    const y = rows.get(epic.id) ?? TOP;
    const lane: Point = { x: ORIGIN_X, y: laneOf(index) };
    const fan = fanOf(index);
    const stations = tasks
      .filter((task) => task.epicId === epic.id)
      .map((task, position): StationPosition => ({
        task,
        x: xOf(task.id),
        y: y + bendOf(task, index),
        labelSide: position % 2 === 0 ? 'below' : 'above',
        interchange: interchanges.has(task.id),
      }));
    const xs = stations.map((station) => station.x);
    const startX = ORIGIN_X + Math.max(fan, ROW_START_MIN_RUN);
    const end: Point = { x: xs.length > 0 ? Math.max(...xs) + STEP / 2 : firstX + STEP / 2, y };
    const path = [lane, ...trackPath({ x: ORIGIN_X + fan, y }, [...stations, end])];
    return { epic, y, startX, end, path, stations };
  });

  const drawn = new Map(lines.flatMap((line) => line.stations.map((station): [string, Point] => [station.task.id, { x: station.x, y: station.y }])));
  const positionOf = (taskId: string): Point => drawn.get(taskId) ?? { x: xOf(taskId), y: rows.get(epicOf.get(taskId) ?? '') ?? TOP };
  const transfers = tasks.flatMap((task) =>
    crossDependencies(task).map(
      (dependency): TransferPosition => ({ fromTaskId: dependency, toTaskId: task.id, from: positionOf(dependency), to: positionOf(task.id) }),
    ),
  );

  const maxX = Math.max(firstX + STEP, ...lines.flatMap((line) => line.path.map((point) => point.x)));
  return {
    origin,
    lines,
    transfers,
    width: Math.max(maxX + RIGHT_MARGIN, MIN_WIDTH),
    height: Math.max(lastRow + BOTTOM_MARGIN, MIN_HEIGHT),
  };
}

export function interchangeIds(tasks: readonly TaskSummaryDto[]): ReadonlySet<string> {
  const epicOf = new Map(tasks.map((task) => [task.id, task.epicId]));
  return new Set(tasks.flatMap((task) => {
    const dependencies = crossLineDependencies(task, epicOf);
    return dependencies.length > 0 ? [task.id, ...dependencies] : [];
  }));
}

export function withoutDeliveredLines(
  epics: readonly EpicDto[],
  tasks: readonly TaskSummaryDto[],
  keepEpicId: string | null,
): { readonly epics: readonly EpicDto[]; readonly tasks: readonly TaskSummaryDto[] } {
  const visible = epics.filter((epic) => epic.id === keepEpicId || !finishedLine(epic, tasks));
  const ids = new Set(visible.map((epic) => epic.id));
  return { epics: visible, tasks: tasks.filter((task) => ids.has(task.epicId)) };
}

function rowPositions(pitches: readonly number[]): number[] {
  return pitches.reduce<number[]>((ys, pitch, index) => {
    const previous = ys.at(-1);
    const gap = (pitch + (pitches[index - 1] ?? pitch)) / 2;
    return [...ys, previous === undefined ? TOP : previous + gap];
  }, []);
}

function crossLineDependencies(task: TaskSummaryDto, epicOf: ReadonlyMap<string, string>): string[] {
  return task.dependsOn.filter((dependency) => epicOf.has(dependency) && epicOf.get(dependency) !== task.epicId);
}

function trackPath(rowStart: Point, stops: readonly Point[]): Point[] {
  const row = rowStart.y;
  const points: Point[] = [rowStart];
  let previous = rowStart;
  for (const stop of stops) {
    const rise = Math.abs(stop.y - previous.y);
    if (rise > 0) {
      const leaveX = previous.y !== row ? previous.x + INTERCHANGE_PLATEAU : stop.x - INTERCHANGE_PLATEAU - rise;
      points.push({ x: leaveX, y: previous.y }, { x: leaveX + rise, y: stop.y });
    }
    points.push({ x: stop.x, y: stop.y });
    previous = stop;
  }
  return points;
}

function trackToward(direction: number, rowStart: Point, stops: readonly Point[]): Point[] {
  const mirror = (point: Point): Point => ({ x: direction * point.x, y: point.y });
  return trackPath(mirror(rowStart), stops.map(mirror)).map(mirror);
}

function rankTasks(tasks: readonly TaskSummaryDto[]): Map<string, number> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const previousInLine = new Map<string, string>();
  const lastOfEpic = new Map<string, string>();
  for (const task of tasks) {
    const last = lastOfEpic.get(task.epicId);
    if (last) previousInLine.set(task.id, last);
    lastOfEpic.set(task.epicId, task.id);
  }
  const ranks = new Map<string, number>();
  const rank = (taskId: string, visiting: Set<string>): number => {
    const known = ranks.get(taskId);
    if (known !== undefined) return known;
    if (visiting.has(taskId)) return 0;
    visiting.add(taskId);
    const task = byId.get(taskId);
    const before = [...(task?.dependsOn ?? []), ...(previousInLine.has(taskId) ? [previousInLine.get(taskId) as string] : [])].filter((id) => byId.has(id));
    const value = before.length === 0 ? 0 : Math.max(...before.map((id) => rank(id, visiting) + 1));
    ranks.set(taskId, value);
    return value;
  };
  for (const task of tasks) rank(task.id, new Set());
  return ranks;
}
