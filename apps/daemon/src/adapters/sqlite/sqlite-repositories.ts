import { asc, eq, inArray } from 'drizzle-orm';
import type {
  AppRepository,
  DecisionRepository,
  EpicRepository,
  RunRepository,
  TaskRepository,
} from '../../application/ports/repositories.js';
import type { App } from '../../domain/app.js';
import type { Decision } from '../../domain/decision.js';
import type { Epic } from '../../domain/epic.js';
import type { Run } from '../../domain/run.js';
import type { Task } from '../../domain/task.js';
import type { TerminusDatabase } from './database.js';
import { apps, checkpoints, decisions, epics, playbookVersions, runs, taskDependencies, tasks } from './schema.js';

export class SqliteAppRepository implements AppRepository {
  constructor(private readonly db: TerminusDatabase) {}

  save(app: App): void {
    this.db.insert(apps).values(app).onConflictDoUpdate({ target: apps.id, set: app }).run();
  }

  get(id: string): App | null {
    return this.db.select().from(apps).where(eq(apps.id, id)).get() ?? null;
  }

  list(): App[] {
    return this.db.select().from(apps).orderBy(asc(apps.name)).all();
  }
}

export class SqliteEpicRepository implements EpicRepository {
  constructor(private readonly db: TerminusDatabase) {}

  save(epic: Epic): void {
    this.db.insert(epics).values(epic).onConflictDoUpdate({ target: epics.id, set: epic }).run();
  }

  get(id: string): Epic | null {
    return this.db.select().from(epics).where(eq(epics.id, id)).get() ?? null;
  }

  listByApp(appId: string): Epic[] {
    return this.db.select().from(epics).where(eq(epics.appId, appId)).orderBy(asc(epics.position)).all();
  }
}

export class SqliteTaskRepository implements TaskRepository {
  constructor(private readonly db: TerminusDatabase) {}

  save(task: Task): void {
    const row = {
      id: task.id,
      epicId: task.epicId,
      title: task.title,
      lifecycleId: task.lifecycle.id,
      lifecycleVersion: task.lifecycle.version,
      autonomy: task.autonomy,
      phaseIndex: task.phaseIndex,
      status: task.status,
      failuresInPhase: [...task.failuresInPhase],
    };
    this.db.transaction((tx) => {
      tx.insert(playbookVersions)
        .values({ lifecycleId: task.lifecycle.id, version: task.lifecycle.version, phases: [...task.lifecycle.phases] })
        .onConflictDoNothing()
        .run();
      tx.insert(tasks).values(row).onConflictDoUpdate({ target: tasks.id, set: row }).run();
      tx.delete(taskDependencies).where(eq(taskDependencies.taskId, task.id)).run();
      if (task.dependsOn.length > 0) {
        tx.insert(taskDependencies).values(task.dependsOn.map((dependsOn) => ({ taskId: task.id, dependsOn }))).run();
      }
      tx.delete(checkpoints).where(eq(checkpoints.taskId, task.id)).run();
      if (task.checkpoints.length > 0) {
        tx.insert(checkpoints).values(task.checkpoints.map((checkpoint) => ({ taskId: task.id, ...checkpoint }))).run();
      }
    });
  }

  get(id: string): Task | null {
    const row = this.db.select().from(tasks).where(eq(tasks.id, id)).get();
    return row ? this.hydrate(row) : null;
  }

  listByEpic(epicId: string): Task[] {
    return this.db.select().from(tasks).where(eq(tasks.epicId, epicId)).orderBy(asc(tasks.id)).all().map((row) => this.hydrate(row));
  }

  listByApp(appId: string): Task[] {
    const epicIds = this.db.select({ id: epics.id }).from(epics).where(eq(epics.appId, appId)).all().map((epic) => epic.id);
    if (epicIds.length === 0) return [];
    return this.db.select().from(tasks).where(inArray(tasks.epicId, epicIds)).orderBy(asc(tasks.id)).all().map((row) => this.hydrate(row));
  }

  private hydrate(row: typeof tasks.$inferSelect): Task {
    const lifecycle = this.db
      .select()
      .from(playbookVersions)
      .where(eq(playbookVersions.lifecycleId, row.lifecycleId))
      .all()
      .find((version) => version.version === row.lifecycleVersion);
    if (!lifecycle) throw new Error(`Task ${row.id} references unknown playbook ${row.lifecycleId}@${row.lifecycleVersion}`);
    const dependsOn = this.db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, row.id))
      .orderBy(asc(taskDependencies.dependsOn))
      .all()
      .map((dependency) => dependency.dependsOn);
    const taskCheckpoints = this.db
      .select()
      .from(checkpoints)
      .where(eq(checkpoints.taskId, row.id))
      .orderBy(asc(checkpoints.sequence))
      .all()
      .map(({ taskId: _taskId, ...checkpoint }) => checkpoint);
    return {
      id: row.id,
      epicId: row.epicId,
      title: row.title,
      lifecycle: { id: lifecycle.lifecycleId, version: lifecycle.version, phases: lifecycle.phases },
      autonomy: row.autonomy,
      dependsOn,
      phaseIndex: row.phaseIndex,
      status: row.status,
      failuresInPhase: row.failuresInPhase,
      checkpoints: taskCheckpoints,
    };
  }
}

export class SqliteRunRepository implements RunRepository {
  constructor(private readonly db: TerminusDatabase) {}

  save(run: Run): void {
    const row = {
      id: run.id,
      taskId: run.taskId,
      phaseIndex: run.phaseIndex,
      sessionId: run.sessionId,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      inputTokens: run.usage?.inputTokens ?? null,
      outputTokens: run.usage?.outputTokens ?? null,
    };
    this.db.insert(runs).values(row).onConflictDoUpdate({ target: runs.id, set: row }).run();
  }

  get(id: string): Run | null {
    const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
    return row ? toRun(row) : null;
  }

  listByTask(taskId: string): Run[] {
    return this.db.select().from(runs).where(eq(runs.taskId, taskId)).orderBy(asc(runs.startedAt)).all().map(toRun);
  }
}

function toRun(row: typeof runs.$inferSelect): Run {
  const { inputTokens, outputTokens, ...rest } = row;
  return { ...rest, usage: inputTokens === null || outputTokens === null ? null : { inputTokens, outputTokens } };
}

export class SqliteDecisionRepository implements DecisionRepository {
  constructor(private readonly db: TerminusDatabase) {}

  save(decision: Decision): void {
    const row = { ...decision, options: [...decision.options] };
    this.db.insert(decisions).values(row).onConflictDoUpdate({ target: decisions.id, set: row }).run();
  }

  get(id: string): Decision | null {
    return this.db.select().from(decisions).where(eq(decisions.id, id)).get() ?? null;
  }

  listByTask(taskId: string): Decision[] {
    return this.db.select().from(decisions).where(eq(decisions.taskId, taskId)).orderBy(asc(decisions.createdAt)).all();
  }
}
