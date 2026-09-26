import type { TaskSummaryDto } from '@terminus/contracts';
import { finished } from './exploration';
import { interchangeIds } from './layout';

const MIN_RUN = 3;

export interface Summarized {
  readonly tasks: readonly TaskSummaryDto[];
  readonly counts: ReadonlyMap<string, number>;
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
