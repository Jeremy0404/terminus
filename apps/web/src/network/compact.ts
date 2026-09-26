import type { EpicDto, TaskSummaryDto } from '@terminus/contracts';
import { finished, finishedLine } from './exploration';
import { interchangeIds } from './layout';

const MIN_RUN = 3;

export interface Summarized {
  readonly tasks: readonly TaskSummaryDto[];
  readonly counts: ReadonlyMap<string, number>;
}

export interface CompactNetwork extends Summarized {
  readonly epics: readonly EpicDto[];
  readonly thin: ReadonlyMap<string, number>;
}

export function compactNetwork(epics: readonly EpicDto[], tasks: readonly TaskSummaryDto[]): CompactNetwork {
  const thin = new Map(
    epics.filter((epic) => finishedLine(epic, tasks)).map((epic) => [epic.id, tasks.filter((task) => task.epicId === epic.id && finished(task)).length]),
  );
  const interchanges = interchangeIds(tasks);
  const kept = tasks.filter((task) => !thin.has(task.epicId) || interchanges.has(task.id));
  return { epics, thin, ...summarizeFinished(kept) };
}

export function summarizeFinished(tasks: readonly TaskSummaryDto[], threshold = MIN_RUN): Summarized {
  const interchanges = interchangeIds(tasks);
  const foldable = (task: TaskSummaryDto): boolean => finished(task) && !interchanges.has(task.id);
  const runs = new Map<string, TaskSummaryDto[]>();
  const folded = new Set<string>();
  const counts = new Map<string, number>();
  const close = (run: readonly TaskSummaryDto[]): void => {
    const last = run.at(-1);
    if (!last || run.length < threshold) return;
    run.slice(0, -1).forEach((task) => folded.add(task.id));
    counts.set(last.id, run.length);
  };
  for (const task of tasks) {
    const run = runs.get(task.epicId) ?? [];
    if (foldable(task)) {
      runs.set(task.epicId, [...run, task]);
    } else {
      close(run);
      runs.set(task.epicId, []);
    }
  }
  runs.forEach(close);
  return { tasks: tasks.filter((task) => !folded.has(task.id)), counts };
}
