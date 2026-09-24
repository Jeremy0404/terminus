import type { Decision } from '../domain/decision.js';
import { DomainError } from '../domain/errors.js';
import { isLooping, type Failure, type FailurePolicy } from '../domain/failure.js';
import type { App } from '../domain/app.js';
import { phaseAt, type PhaseDefinition } from '../domain/lifecycle.js';
import type { Run, RunStatus, RunUsage } from '../domain/run.js';
import { completePhase, failRun, passChecks, rejectByChecks, requestDecision, startRun, type Task } from '../domain/task.js';
import { DECISIONS_OUTPUT_SCHEMA, readProposedDecisions } from './decision-output.js';
import { buildPhasePrompt } from './phase-prompt.js';
import { REVIEW_OUTPUT_SCHEMA } from './review-output.js';
import type { CheckRunner } from './ports/check-runner.js';
import type { CodeHost } from './ports/code-host.js';
import { pullRequestBody, pullRequestTitle } from './pull-request-text.js';
import type { AgentEvent, AgentRunner } from './ports/agent-runner.js';
import type { AppRepository, DecisionRepository, EpicRepository, RunRepository, TaskRepository } from './ports/repositories.js';
import type { Clock, IdGenerator, RunEventBus } from './ports/system.js';
import type { TranscriptStore } from './ports/transcript-store.js';
import type { TaskNotes } from './ports/task-notes.js';
import type { TaskWorkspace, Workspace } from './ports/workspace.js';

export interface RunBudget {
  readonly maxTokens: number;
  readonly maxTurns: number;
}

export interface PhaseRunnerDeps {
  readonly apps: AppRepository;
  readonly epics: EpicRepository;
  readonly tasks: TaskRepository;
  readonly runs: RunRepository;
  readonly decisions: DecisionRepository;
  readonly transcripts: TranscriptStore;
  readonly workspace: Workspace;
  readonly notes: TaskNotes;
  readonly agent: AgentRunner;
  readonly checks: CheckRunner;
  readonly codeHost: CodeHost;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly bus: RunEventBus;
  readonly budget: RunBudget;
  readonly failurePolicy: FailurePolicy;
  readonly baseRef: string;
  readonly systemPromptAppend: string;
}

interface RunObservation {
  usage: RunUsage | null;
  finished: Extract<AgentEvent, { type: 'finished' }> | null;
  stopped: Failure | null;
}

export class PhaseRunner {
  private readonly active = new Map<string, { readonly interrupt: () => void; byUser: boolean }>();

  constructor(private readonly deps: PhaseRunnerDeps) {}

  interrupt(taskId: string): boolean {
    const run = this.active.get(taskId);
    if (!run) return false;
    run.byUser = true;
    run.interrupt();
    return true;
  }

  async run(taskId: string): Promise<Task> {
    const { runs, workspace, agent, clock, ids, budget } = this.deps;
    const ready = this.load(taskId);
    if (ready.status.kind !== 'ready') throw new DomainError(`Task ${taskId} is ${ready.status.kind}, expected ready`);
    const app = this.appOf(ready);
    const phase = phaseAt(ready.lifecycle, ready.phaseIndex);
    const taskWorkspace = workspace.prepare(app.repoPath, app.id, ready.id, this.deps.baseRef);
    const executor = phase.executor ?? 'agent';
    if (executor === 'checks') return this.runChecks(ready, app, phase, taskWorkspace);
    if (executor === 'code-host') return this.publish(ready, phase, taskWorkspace);
    const previousRun = runs.listByTask(ready.id).filter((run) => run.phaseIndex === ready.phaseIndex).at(-1);
    const resume = ready.status.mode === 'resume' && previousRun !== undefined;
    const sessionId = resume ? previousRun.sessionId : ids.uuid();
    const notesDir = this.deps.notes.directoryFor(ready.id);
    const prompt = buildPhasePrompt(ready, phase, this.deps.decisions.listByTask(ready.id).filter((decision) => decision.answer), {
      notesDir,
      baseRef: this.deps.baseRef,
      verification: app.verification,
    });

    const runId = ids.next('run');
    let task = this.save(startRun(ready, runId));
    let run: Run = { id: runId, taskId, phaseIndex: task.phaseIndex, sessionId, status: 'running', startedAt: clock.now(), endedAt: null, usage: null, output: null };
    runs.save(run);

    const handle = agent.start({
      runId,
      sessionId,
      resume,
      cwd: taskWorkspace.path,
      notesDir,
      prompt,
      systemPromptAppend: this.deps.systemPromptAppend,
      skill: phase.skill ?? null,
      model: phase.model ?? null,
      maxTurns: budget.maxTurns,
      outputSchema: outputSchemaFor(phase),
    });
    const control = { interrupt: () => handle.interrupt(), byUser: false };
    this.active.set(taskId, control);
    const observation = await this.observe(taskId, runId, handle.events, () => handle.interrupt()).finally(() => this.active.delete(taskId));
    if (control.byUser && !observation.stopped) observation.stopped = this.failure('interrupted', 'user', 'Interrupted from Terminus');

    const finishedOk = !observation.stopped && observation.finished?.outcome === 'success';
    let status: RunStatus = 'succeeded';
    if (finishedOk) {
      const proposed = phase.output === 'decisions' ? readProposedDecisions(observation.finished?.structuredOutput) : [];
      if (proposed.length > 0) {
        const saved = proposed.map((decision): Decision => ({
          id: ids.next('decision'),
          taskId,
          phaseIndex: task.phaseIndex,
          question: decision.question,
          options: decision.options,
          answer: null,
          createdAt: clock.now(),
          answeredAt: null,
        }));
        saved.forEach((decision) => this.deps.decisions.save(decision));
        task = requestDecision(task, (saved[0] as Decision).id);
      } else {
        const sequence = task.checkpoints.length + 1;
        const ref = workspace.checkpoint(taskWorkspace, sequence, phase.id);
        task = completePhase(task, { sequence, phaseIndex: task.phaseIndex, ref, sessionId, takenAt: clock.now() });
      }
    } else {
      const failure = observation.stopped ?? this.failureFrom(observation.finished);
      status = observation.stopped || observation.finished?.outcome === 'interrupted' ? 'interrupted' : 'failed';
      task = failRun(task, failure, this.deps.failurePolicy);
    }

    run = { ...run, status, endedAt: clock.now(), usage: observation.usage, output: observation.finished?.structuredOutput ?? null };
    runs.save(run);
    return this.save(task);
  }

  private async runChecks(ready: Task, app: App, phase: PhaseDefinition, taskWorkspace: TaskWorkspace): Promise<Task> {
    const { runs, clock, ids } = this.deps;
    const runId = ids.next('run');
    let task = this.save(startRun(ready, runId));
    const run: Run = { id: runId, taskId: task.id, phaseIndex: task.phaseIndex, sessionId: 'checks', status: 'running', startedAt: clock.now(), endedAt: null, usage: null, output: null };
    runs.save(run);

    const results = await this.deps.checks.run(taskWorkspace.path, app.verification);
    for (const result of results) {
      this.deps.transcripts.append(runId, result);
      this.deps.bus.publish({ kind: 'check-result', runId, taskId: task.id, result });
    }

    const failed = results.find((result) => !result.ok);
    if (failed) {
      const failure = this.failure('check-failed', `check:${failed.name}`, `${failed.name} failed (\`${failed.command}\`, exit ${String(failed.exitCode)}):\n${failed.outputTail}`);
      const fixPhase = phase.retryFrom ?? phaseAt(task.lifecycle, task.phaseIndex - 1).id;
      task = rejectByChecks(task, failure, fixPhase, this.deps.failurePolicy);
    } else {
      const sequence = task.checkpoints.length + 1;
      const ref = this.deps.workspace.checkpoint(taskWorkspace, sequence, phase.id);
      task = passChecks(task, { sequence, phaseIndex: task.phaseIndex, ref, sessionId: null, takenAt: clock.now() });
    }
    runs.save({ ...run, status: failed ? 'failed' : 'succeeded', endedAt: clock.now(), output: results });
    return this.save(task);
  }

  private publish(ready: Task, phase: PhaseDefinition, taskWorkspace: TaskWorkspace): Task {
    const { runs, clock, ids } = this.deps;
    const runId = ids.next('run');
    let task = this.save(startRun(ready, runId));
    const run: Run = { id: runId, taskId: task.id, phaseIndex: task.phaseIndex, sessionId: 'code-host', status: 'running', startedAt: clock.now(), endedAt: null, usage: null, output: null };
    runs.save(run);
    try {
      const sequence = task.checkpoints.length + 1;
      const ref = this.deps.workspace.checkpoint(taskWorkspace, sequence, phase.id);
      const pullRequest = this.deps.codeHost.publish(taskWorkspace, this.deps.baseRef, pullRequestTitle(task), pullRequestBody(task, runs.listByTask(task.id)));
      task = completePhase(task, { sequence, phaseIndex: task.phaseIndex, ref, sessionId: null, takenAt: clock.now() });
      runs.save({ ...run, status: 'succeeded', endedAt: clock.now(), output: { pullRequest } });
    } catch (error) {
      task = failRun(task, this.failure('publish-failed', 'publish', errorMessage(error)), this.deps.failurePolicy);
      runs.save({ ...run, status: 'failed', endedAt: clock.now() });
    }
    return this.save(task);
  }

  private async observe(taskId: string, runId: string, events: AsyncIterable<AgentEvent>, interrupt: () => void): Promise<RunObservation> {
    const observation: RunObservation = { usage: null, finished: null, stopped: null };
    const signatures: string[] = [];
    const stop = (failure: Failure): void => {
      if (observation.stopped) return;
      observation.stopped = failure;
      interrupt();
    };
    for await (const event of events) {
      this.deps.transcripts.append(runId, event);
      this.deps.bus.publish({ kind: 'run-event', runId, taskId, event });
      if (event.type === 'usage') {
        observation.usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens };
        if (event.inputTokens + event.outputTokens > this.deps.budget.maxTokens) {
          stop(this.failure('budget-exceeded', 'token-budget', `Token budget of ${this.deps.budget.maxTokens} exceeded`));
        }
      }
      if (event.type === 'tool-failure') {
        signatures.push(event.signature);
        if (isLooping(signatures, this.deps.failurePolicy.loopThreshold)) {
          stop(this.failure('loop-detected', event.signature, `Same failure ${this.deps.failurePolicy.loopThreshold} times in a row: ${event.summary}`));
        }
      }
      if (event.type === 'finished') observation.finished = event;
    }
    return observation;
  }

  private failureFrom(finished: RunObservation['finished']): Failure {
    if (!finished) return this.failure('agent-crashed', 'no-result', 'The agent stopped without a result');
    if (finished.outcome === 'quota-exhausted') return this.failure('quota-exhausted', 'quota', finished.summary);
    if (finished.outcome === 'max-turns') return this.failure('budget-exceeded', 'max-turns', finished.summary);
    return this.failure('agent-crashed', `outcome:${finished.outcome}`, finished.summary);
  }

  private failure(kind: Failure['kind'], signature: string, message: string): Failure {
    return { kind, signature, message, at: this.deps.clock.now() };
  }

  private load(taskId: string): Task {
    const task = this.deps.tasks.get(taskId);
    if (!task) throw new DomainError(`Unknown task ${taskId}`);
    return task;
  }

  private appOf(task: Task) {
    const epic = this.deps.epics.get(task.epicId);
    const app = epic && this.deps.apps.get(epic.appId);
    if (!app) throw new DomainError(`Task ${task.id} has no app`);
    return app;
  }

  private save(task: Task): Task {
    this.deps.tasks.save(task);
    this.deps.bus.publish({ kind: 'task-changed', task });
    return task;
  }
}

function outputSchemaFor(phase: PhaseDefinition): object | null {
  if (phase.output === 'decisions') return DECISIONS_OUTPUT_SCHEMA;
  if (phase.output === 'review') return REVIEW_OUTPUT_SCHEMA;
  return null;
}

function errorMessage(error: unknown): string {
  const stderr = (error as { stderr?: unknown }).stderr;
  if (typeof stderr === 'string' && stderr.trim()) return stderr.trim();
  return error instanceof Error ? error.message : String(error);
}
