import type { App } from '../../domain/app.js';
import type { Decision } from '../../domain/decision.js';
import type { Epic } from '../../domain/epic.js';
import type { Run } from '../../domain/run.js';
import type { Task } from '../../domain/task.js';

export interface AppRepository {
  save(app: App): void;
  get(id: string): App | null;
  list(): App[];
}

export interface EpicRepository {
  save(epic: Epic): void;
  get(id: string): Epic | null;
  listByApp(appId: string): Epic[];
}

export interface TaskRepository {
  save(task: Task): void;
  get(id: string): Task | null;
  listByEpic(epicId: string): Task[];
  listByApp(appId: string): Task[];
}

export interface RunRepository {
  save(run: Run): void;
  get(id: string): Run | null;
  listByTask(taskId: string): Run[];
}

export interface DecisionRepository {
  save(decision: Decision): void;
  get(id: string): Decision | null;
  listByTask(taskId: string): Decision[];
}
