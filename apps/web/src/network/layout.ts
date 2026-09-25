import type { EpicDto, TaskSummaryDto } from '@terminus/contracts';

export const STEP = 80;
export const ROW = 130;
export const LEFT = 230;
export const TOP = 110;
export const ROUNDEL_OFFSET = 44;
export const ROUNDEL_RADIUS = 17;
const RIGHT_MARGIN = 140;
const BOTTOM_MARGIN = 70;
const MIN_ZOOM_SHARE = 0.55;
const MIN_LINE_VIEW = 750;
const MIN_WIDTH = 1000;
const MIN_HEIGHT = 380;

export type LabelSide = 'below' | 'above';

export interface StationPosition {
  readonly task: TaskSummaryDto;
  readonly x: number;
  readonly y: number;
  readonly labelSide: LabelSide;
}

export interface LinePosition {
  readonly epic: EpicDto;
  readonly y: number;
  readonly startX: number;
  readonly endX: number;
  readonly stations: readonly StationPosition[];
}

export interface TransferPosition {
  readonly fromTaskId: string;
  readonly toTaskId: string;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
}

export interface NetworkLayout {
  readonly lines: readonly LinePosition[];
  readonly transfers: readonly TransferPosition[];
  readonly width: number;
  readonly height: number;
}

export function layoutNetwork(epics: readonly EpicDto[], tasks: readonly TaskSummaryDto[]): NetworkLayout {
  const orderedEpics = [...epics].sort((a, b) => a.position - b.position);
  const ranks = rankTasks(tasks);
  const rows = new Map(orderedEpics.map((epic, index) => [epic.id, TOP + index * ROW]));
  const xOf = (taskId: string): number => LEFT + (ranks.get(taskId) ?? 0) * STEP;

  const lines = orderedEpics.map((epic): LinePosition => {
    const y = rows.get(epic.id) ?? TOP;
    const stations = tasks
      .filter((task) => task.epicId === epic.id)
      .map((task, index): StationPosition => ({ task, x: xOf(task.id), y, labelSide: index % 2 === 0 ? 'below' : 'above' }));
    const xs = stations.map((station) => station.x);
    const startX = xs.length > 0 ? Math.min(...xs) : LEFT;
    const endX = xs.length > 0 ? Math.max(...xs) + STEP / 2 : LEFT + STEP;
    return { epic, y, startX, endX, stations };
  });

  const epicOf = new Map(tasks.map((task) => [task.id, task.epicId]));
  const transfers = tasks.flatMap((task) =>
    task.dependsOn
      .filter((dependency) => epicOf.has(dependency) && epicOf.get(dependency) !== task.epicId)
      .map(
        (dependency): TransferPosition => ({
          fromTaskId: dependency,
          toTaskId: task.id,
          from: { x: xOf(dependency), y: rows.get(epicOf.get(dependency) ?? '') ?? TOP },
          to: { x: xOf(task.id), y: rows.get(task.epicId) ?? TOP },
        }),
      ),
  );

  const maxX = Math.max(LEFT + STEP, ...lines.map((line) => line.endX));
  return {
    lines,
    transfers,
    width: Math.max(maxX + RIGHT_MARGIN, MIN_WIDTH),
    height: Math.max(TOP + Math.max(orderedEpics.length - 1, 0) * ROW + BOTTOM_MARGIN, MIN_HEIGHT),
  };
}

export function withoutDeliveredLines(
  epics: readonly EpicDto[],
  tasks: readonly TaskSummaryDto[],
  keepEpicId: string | null,
): { readonly epics: readonly EpicDto[]; readonly tasks: readonly TaskSummaryDto[] } {
  const visible = epics.filter((epic) => epic.status !== 'delivered' || epic.id === keepEpicId);
  const ids = new Set(visible.map((epic) => epic.id));
  return { epics: visible, tasks: tasks.filter((task) => ids.has(task.epicId)) };
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

export function lineViewBox(layout: NetworkLayout, epicId: string, aspect: number): [number, number, number, number] {
  const line = layout.lines.find((candidate) => candidate.epic.id === epicId);
  if (!line) return fullViewBox(layout);
  const x = line.startX - LEFT - 10;
  const width = Math.max(line.endX - x + 80, MIN_LINE_VIEW, layout.width * MIN_ZOOM_SHARE);
  const height = width / aspect;
  return [x, line.y - height / 2, width, height];
}

export function fullViewBox(layout: NetworkLayout): [number, number, number, number] {
  return [0, 0, layout.width, layout.height];
}
