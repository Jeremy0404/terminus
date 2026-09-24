import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { ZodError, type ZodType } from 'zod';
import {
  AcceptBreakdownBody,
  AnswerBody,
  BreakdownBody,
  CloseBody,
  CreateAppBody,
  CutOverBody,
  HealthCheckBody,
  RepoPathBody,
  CreateEpicBody,
  CreateTaskBody,
  RecoverBody,
  SendBackBody,
  TrackBody,
  type ChecksResponseDto,
  type HealthResponse,
} from '@terminus/contracts';
import type { Adoption } from '../../application/adoption.js';
import type { Catalog } from '../../application/catalog.js';
import type { EpicPlanner } from '../../application/epic-planner.js';
import type { RunUpdate } from '../../application/ports/system.js';
import { NotFound, type Queries } from '../../application/queries.js';
import type { TaskActions } from '../../application/task-actions.js';
import { DomainError } from '../../domain/errors.js';
import { toAppDto, toEpicDto, toNetworkDto, toQuotaDto, toServerEventDto, toTaskDetailDto, toTaskSummaryDto } from './dto.js';

const KEEPALIVE_MS = 15_000;

export interface HttpDeps {
  readonly version: string;
  readonly queries: Queries;
  readonly catalog: Catalog;
  readonly adoption: Adoption;
  readonly planner: EpicPlanner;
  readonly actions: TaskActions;
  readonly runs: { interrupt(taskId: string): boolean };
  readonly scheduler: { tick(): unknown; release(taskId: string): void };
  readonly events: { subscribe(listener: (update: RunUpdate) => void): () => void };
}

export function createHttpApp(deps: HttpDeps): Hono {
  const app = new Hono();
  const { queries, catalog, actions } = deps;

  app.onError((error, c) => {
    if (error instanceof ZodError) return c.json({ error: 'Invalid request', issues: error.issues }, 400);
    if (error instanceof NotFound) return c.json({ error: error.message }, 404);
    if (error instanceof DomainError) return c.json({ error: error.message }, 409);
    console.error(error);
    return c.json({ error: 'Internal error' }, 500);
  });

  const act = (taskId: string, change: () => unknown): unknown => {
    const result = change();
    deps.scheduler.release(taskId);
    deps.scheduler.tick();
    return result;
  };

  app.get('/api/health', (c) => c.json<HealthResponse>({ status: 'ok', version: deps.version }));

  app.get('/api/apps', (c) => c.json(queries.apps().map(toAppDto)));
  app.get('/api/quota', (c) => {
    const quota = queries.quota();
    return c.json(quota ? toQuotaDto(quota) : null);
  });
  app.post('/api/apps', async (c) => c.json(toAppDto(catalog.createApp(await body(c, CreateAppBody))), 201));
  app.get('/api/apps/:appId/network', (c) => c.json(toNetworkDto(queries.network(c.req.param('appId')))));
  app.post('/api/apps/:appId/epics', async (c) => c.json(toEpicDto(catalog.createEpic(c.req.param('appId'), await body(c, CreateEpicBody))), 201));
  app.post('/api/epics/:epicId/breakdown', async (c) => {
    const { brief } = await body(c, BreakdownBody);
    return c.json(toEpicDto(deps.planner.start(c.req.param('epicId'), brief)), 202);
  });
  app.post('/api/epics/:epicId/breakdown/accept', async (c) => {
    const created = deps.planner.accept(c.req.param('epicId'), await body(c, AcceptBreakdownBody));
    deps.scheduler.tick();
    return c.json(created.map(toTaskSummaryDto), 201);
  });
  app.post('/api/epics/:epicId/breakdown/dismiss', (c) => c.json(toEpicDto(deps.planner.dismiss(c.req.param('epicId')))));
  app.post('/api/epics/:epicId/tasks', async (c) => {
    const task = catalog.createTask(c.req.param('epicId'), await body(c, CreateTaskBody));
    return c.json(toTaskSummaryDto(task), 201);
  });

  app.get('/api/tasks/:taskId', (c) => c.json(toTaskDetailDto(queries.task(c.req.param('taskId')))));
  app.get('/api/tasks/:taskId/checks', (c) => c.json<ChecksResponseDto>({ state: actions.checks(c.req.param('taskId')) }));
  app.get('/api/runs/:runId/transcript', (c) => c.json(queries.transcript(c.req.param('runId'))));

  const simple = {
    open: (id: string) => actions.open(id),
    approve: (id: string) => actions.approve(id),
    merge: (id: string) => actions.merge(id),
    'resume-from-manual': (id: string) => actions.resumeFromManual(id),
  } as const;
  for (const [name, run] of Object.entries(simple)) {
    app.post(`/api/tasks/:taskId/${name}`, (c) => {
      const taskId = c.req.param('taskId');
      return c.json(toTaskSummaryDto(act(taskId, () => run(taskId)) as ReturnType<typeof run>));
    });
  }
  app.post('/api/tasks/:taskId/send-back', async (c) => {
    const taskId = c.req.param('taskId');
    const { toPhaseId } = await body(c, SendBackBody);
    return c.json(toTaskSummaryDto(act(taskId, () => actions.sendBack(taskId, toPhaseId)) as ReturnType<TaskActions['sendBack']>));
  });
  app.post('/api/tasks/:taskId/recover', async (c) => {
    const taskId = c.req.param('taskId');
    const { option, rewindTo } = await body(c, RecoverBody);
    return c.json(toTaskSummaryDto(act(taskId, () => actions.recover(taskId, option, rewindTo)) as ReturnType<TaskActions['recover']>));
  });
  app.post('/api/tasks/:taskId/close', async (c) => {
    const taskId = c.req.param('taskId');
    const { reason, evidence } = await body(c, CloseBody);
    const { task, warnings } = actions.close(taskId, reason, evidence);
    act(taskId, () => task);
    return c.json({ task: toTaskSummaryDto(task), warnings });
  });
  app.post('/api/tasks/:taskId/skip', (c) => {
    const taskId = c.req.param('taskId');
    return c.json(toTaskSummaryDto(act(taskId, () => actions.skip(taskId)) as ReturnType<TaskActions['skip']>));
  });
  app.post('/api/tasks/:taskId/track', async (c) => {
    const taskId = c.req.param('taskId');
    const { track } = await body(c, TrackBody);
    return c.json(toTaskSummaryDto(act(taskId, () => actions.changeTrack(taskId, track)) as ReturnType<TaskActions['changeTrack']>));
  });
  app.post('/api/tasks/:taskId/take-over', (c) => {
    const { task, command } = actions.takeOver(c.req.param('taskId'));
    return c.json({ task: toTaskSummaryDto(task), command });
  });
  app.post('/api/tasks/:taskId/interrupt', (c) => {
    if (!deps.runs.interrupt(c.req.param('taskId'))) throw new DomainError('No run is in progress for this task');
    return c.body(null, 202);
  });
  app.post('/api/decisions/:decisionId/answer', async (c) => {
    const task = actions.answer(c.req.param('decisionId'), await body(c, AnswerBody));
    act(task.id, () => task);
    return c.json(toTaskSummaryDto(task));
  });

  app.post('/api/adoption/scan', async (c) => c.json(deps.adoption.scan((await body(c, RepoPathBody)).repoPath)));
  app.post('/api/adoption/health', async (c) => {
    const { repoPath, commands } = await body(c, HealthCheckBody);
    return c.json(await deps.adoption.health(repoPath, commands));
  });
  app.post('/api/adoption/proposals', async (c) => c.json(deps.adoption.proposals((await body(c, RepoPathBody)).repoPath)));
  app.post('/api/adoption/cut-over', async (c) => {
    const result = deps.adoption.cutOver(await body(c, CutOverBody));
    return c.json({ ...result, app: toAppDto(result.app) }, 201);
  });

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = deps.events.subscribe((update) => {
        void stream.writeSSE({ event: 'update', data: JSON.stringify(toServerEventDto(update)) });
      });
      stream.onAbort(unsubscribe);
      while (!stream.aborted) {
        await stream.writeSSE({ event: 'ping', data: '' });
        await stream.sleep(KEEPALIVE_MS);
      }
      unsubscribe();
    }),
  );

  return app;
}

async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const raw: unknown = await c.req.json().catch(() => {
    throw new ZodError([{ code: 'custom', path: [], message: 'Body must be JSON', input: undefined }]);
  });
  return schema.parse(raw);
}
