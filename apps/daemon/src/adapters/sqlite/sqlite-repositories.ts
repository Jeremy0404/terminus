import { asc, eq, inArray, sql } from 'drizzle-orm';
import type {
  AppRepository,
  DecisionRepository,
  EpicRepository,
  RunRepository,
  TaskRepository,
} from '../../application/ports/repositories.js';
import type { AgentDefaultsStore } from '../../application/ports/agent-defaults-store.js';
import type { MemoryRepository } from '../../application/ports/memory-repository.js';
import type { QuotaStore } from '../../application/ports/quota-store.js';
import type { AgentDefaults } from '../../domain/agent-choice.js';
import type { App } from '../../domain/app.js';
import type { Decision } from '../../domain/decision.js';
import type { Epic } from '../../domain/epic.js';
import type { Lesson, Term } from '../../domain/memory.js';
import type { Quota } from '../../domain/quota.js';
import type { Run } from '../../domain/run.js';
import type { Task } from '../../domain/task.js';
import type { TerminusDatabase } from './database.js';
import { agentDefaults, apps, checkpoints, decisions, epics, lessons, playbookVersions, quota, runs, taskDependencies, tasks, terms } from './schema.js';

export class SqliteAppRepository implements AppRepository {
  constructor(private readonly db: TerminusDatabase) {}

  save(app: App): void {
    const row = { ...app, verification: [...app.verification] };
    this.db.insert(apps).values(row).onConflictDoUpdate({ target: apps.id, set: row }).run();
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
      description: task.description,
      lifecycleId: task.lifecycle.id,
      lifecycleVersion: task.lifecycle.version,
      autonomy: task.autonomy,
      track: task.track,
      phaseIndex: task.phaseIndex,
      status: task.status,
      failuresInPhase: [...task.failuresInPhase],
      checkFailures: [...task.checkFailures],
      model: task.agent.model,
      effort: task.agent.effort,
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
    return this.db.select().from(tasks).where(eq(tasks.epicId, epicId)).orderBy(sql`rowid`).all().map((row) => this.hydrate(row));
  }

  listByApp(appId: string): Task[] {
    const epicIds = this.db.select({ id: epics.id }).from(epics).where(eq(epics.appId, appId)).all().map((epic) => epic.id);
    if (epicIds.length === 0) return [];
    return this.db.select().from(tasks).where(inArray(tasks.epicId, epicIds)).orderBy(sql`rowid`).all().map((row) => this.hydrate(row));
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
      description: row.description,
      lifecycle: { id: lifecycle.lifecycleId, version: lifecycle.version, phases: lifecycle.phases },
      autonomy: row.autonomy,
      track: row.track,
      agent: { model: row.model, effort: row.effort },
      dependsOn,
      phaseIndex: row.phaseIndex,
      status: row.status,
      failuresInPhase: row.failuresInPhase,
      checkFailures: row.checkFailures,
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
      output: run.output ?? null,
      model: run.agent?.model ?? null,
      effort: run.agent?.effort ?? null,
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
  const { inputTokens, outputTokens, output, model, effort, ...rest } = row;
  const run = { ...rest, output: output ?? null, usage: inputTokens === null || outputTokens === null ? null : { inputTokens, outputTokens } };
  return model === null && effort === null ? run : { ...run, agent: { model, effort } };
}

export class SqliteDecisionRepository implements DecisionRepository {
  constructor(private readonly db: TerminusDatabase) {}

  save(decision: Decision): void {
    const row = { ...decision, options: [...decision.options], proposal: decision.proposal ?? null };
    this.db.insert(decisions).values(row).onConflictDoUpdate({ target: decisions.id, set: row }).run();
  }

  get(id: string): Decision | null {
    const row = this.db.select().from(decisions).where(eq(decisions.id, id)).get();
    return row ? toDecision(row) : null;
  }

  listByTask(taskId: string): Decision[] {
    return this.db.select().from(decisions).where(eq(decisions.taskId, taskId)).orderBy(asc(decisions.createdAt)).all().map(toDecision);
  }
}

function toDecision(row: typeof decisions.$inferSelect): Decision {
  const { proposal, ...rest } = row;
  return proposal ? { ...rest, proposal } : rest;
}


const AGENT_QUOTA = 'agent';

export class SqliteQuotaStore implements QuotaStore {
  constructor(private readonly db: TerminusDatabase) {}

  save(latest: Quota): void {
    const row = { id: AGENT_QUOTA, ...latest, windows: [...latest.windows] };
    this.db.insert(quota).values(row).onConflictDoUpdate({ target: quota.id, set: row }).run();
  }

  latest(): Quota | null {
    const row = this.db.select().from(quota).where(eq(quota.id, AGENT_QUOTA)).get();
    return row ? { limited: row.limited, windows: row.windows, observedAt: row.observedAt } : null;
  }
}

export class SqliteAgentDefaultsStore implements AgentDefaultsStore {
  constructor(private readonly db: TerminusDatabase) {}

  all(): AgentDefaults {
    return Object.fromEntries(this.db.select().from(agentDefaults).all().map(({ phaseId, model, effort }) => [phaseId, { model, effort }]));
  }

  replace(defaults: AgentDefaults): void {
    this.db.transaction((tx) => {
      tx.delete(agentDefaults).run();
      const rows = Object.entries(defaults).map(([phaseId, choice]) => ({ phaseId, ...choice }));
      if (rows.length > 0) tx.insert(agentDefaults).values(rows).run();
    });
  }
}

export class SqliteMemoryRepository implements MemoryRepository {
  constructor(private readonly db: TerminusDatabase) {}

  lessons(appId: string): Lesson[] {
    return this.db.select().from(lessons).where(eq(lessons.appId, appId)).orderBy(asc(lessons.createdAt), sql`rowid`).all();
  }

  saveLesson(lesson: Lesson): void {
    this.db.insert(lessons).values(lesson).onConflictDoUpdate({ target: lessons.id, set: lesson }).run();
  }

  removeLesson(id: string): boolean {
    return this.db.delete(lessons).where(eq(lessons.id, id)).run().changes > 0;
  }

  terms(appId: string): Term[] {
    return this.db.select().from(terms).where(eq(terms.appId, appId)).orderBy(sql`${terms.term} collate nocase`).all();
  }

  saveTerm(term: Term): void {
    this.db.insert(terms).values(term).onConflictDoUpdate({ target: terms.id, set: term }).run();
  }

  removeTerm(id: string): boolean {
    return this.db.delete(terms).where(eq(terms.id, id)).run().changes > 0;
  }
}
