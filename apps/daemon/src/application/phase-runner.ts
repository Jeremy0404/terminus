import { choiceFor, choiceKey, type AgentChoice } from '../domain/agent-choice.js';
import type { Decision } from '../domain/decision.js';
import { DomainError } from '../domain/errors.js';
import { isLooping, type Failure, type FailurePolicy } from '../domain/failure.js';
import type { App } from '../domain/app.js';
import { phaseAt, type PhaseDefinition } from '../domain/lifecycle.js';
import type { Run, RunStatus, RunUsage } from '../domain/run.js';
import { completePhase, failRun, holdForProposal, passChecks, rejectByChecks, requestDecision, startRun, type Task, type TaskStatus } from '../domain/task.js';
import { DECISIONS_OUTPUT_SCHEMA, readProposedDecisions } from './decision-output.js';
import type { ContextSource } from './context-pack.js';
import { MEMORY_OUTPUT_SCHEMA, readMemoryOutput } from './memory-output.js';
import { buildPhasePrompt } from './phase-prompt.js';
import { REVIEW_OUTPUT_SCHEMA } from './review-output.js';
import { readVerdict, VERDICT_OUTPUT_SCHEMA } from './verdict-output.js';
import type { CheckProgress, CheckRunner } from './ports/check-runner.js';
import type { CodeHost } from './ports/code-host.js';
import { pullRequestBody, pullRequestTitle } from './pull-request-text.js';
import type { AgentDefaultsStore } from './ports/agent-defaults-store.js';
import type { AgentEvent, AgentRunner } from './ports/agent-runner.js';
import type { MemoryRepository } from './ports/memory-repository.js';
import type { AppRepository, DecisionRepository, EpicRepository, RunRepository, TaskRepository } from './ports/repositories.js';
import type { Clock, IdGenerator, RunEventBus } from './ports/system.js';
import type { TranscriptStore } from './ports/transcript-store.js';
import type { RepositoryInstructions } from './ports/repository-instructions.js';
import type { TaskNotes } from './ports/task-notes.js';
import type { SyncResult, TaskWorkspace, Workspace } from './ports/workspace.js';

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
  readonly instructions: RepositoryInstructions;
  readonly agent: AgentRunner;
  readonly agentDefaults: AgentDefaultsStore;
  readonly context: ContextSource;
  readonly memory: MemoryRepository;
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

interface AgentRunOptions {
  readonly runId: string;
  readonly sessionId: string;
  readonly resume: boolean;
  readonly outputSchema: object | null;
  readonly promptSuffix?: string;
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
    const { runs, workspace, clock, ids } = this.deps;
    const ready = this.load(taskId);
    if (ready.status.kind !== 'ready') throw new DomainError(`Task ${taskId} is ${ready.status.kind}, expected ready`);
    const app = this.appOf(ready);
    const phase = phaseAt(ready.lifecycle, ready.phaseIndex);
    const taskWorkspace = workspace.prepare(app.repoPath, app.id, ready.id, this.deps.baseRef);
    const executor = phase.executor ?? 'agent';
    if (executor === 'checks') return this.runChecks(ready, app, phase, taskWorkspace);
    if (executor === 'sync') return this.runSync(ready, app, phase, taskWorkspace);
    if (executor === 'code-host') return this.publish(ready, phase, taskWorkspace);
    const previousRun = runs.listByTask(ready.id).filter((run) => run.phaseIndex === ready.phaseIndex).at(-1);
    const resume = ready.status.mode === 'resume' && previousRun !== undefined;
    const sessionId = resume ? previousRun.sessionId : ids.uuid();

    const runId = ids.next('run');
    let task = this.save(startRun(ready, runId));
    let run: Run = { id: runId, taskId, phaseIndex: task.phaseIndex, sessionId, status: 'running', startedAt: clock.now(), endedAt: null, usage: null, output: null, agent: this.choiceFor(ready, phase) };
    runs.save(run);
    const observation = await this.runAgent(ready, app, phase, taskWorkspace, { runId, sessionId, resume, outputSchema: outputSchemaFor(phase) });

    const finishedOk = !observation.stopped && observation.finished?.outcome === 'success';
    let status: RunStatus = 'succeeded';
    if (finishedOk) {
      const proposed = phase.output === 'decisions' ? readProposedDecisions(observation.finished?.structuredOutput) : [];
      if (proposed.length > 0) {
        const saved = proposed.map((decision): Decision => ({
          id: ids.next('decision'),
          kind: 'question',
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
        if (phase.output === 'memory') this.proposeMemory(task, app, observation.finished?.structuredOutput);
        const verdict = phase.output === 'verdict' ? readVerdict(observation.finished?.structuredOutput) : null;
        if (verdict?.proposal && task.status.kind === 'ready') {
          const proposal: Decision = {
            id: ids.next('decision'),
            kind: 'proposal',
            taskId,
            phaseIndex: task.phaseIndex,
            question: verdict.reason,
            options: [
              { label: 'Accept the proposal', description: verdict.reason, recommended: true },
              { label: 'Continue as planned', description: 'Keep the current task and track', recommended: false },
            ],
            answer: null,
            createdAt: clock.now(),
            answeredAt: null,
            proposal: verdict.proposal,
          };
          this.deps.decisions.save(proposal);
          task = holdForProposal(task, proposal.id);
        }
      }
    } else {
      const failure = observation.stopped ?? this.failureFrom(observation.finished);
      status = observation.stopped || observation.finished?.outcome === 'interrupted' ? 'interrupted' : 'failed';
      task = failRun(task, failure, this.deps.failurePolicy);
    }

    run = { ...run, status, endedAt: clock.now(), usage: observation.usage, output: observation.finished?.structuredOutput ?? null };
    runs.save(run);
    if (task.status.kind === 'done') workspace.remove(app.repoPath, taskWorkspace);
    return this.save(task);
  }

  private openStations(task: Task, app: App): { id: string; line: string; title: string }[] {
    const lines = new Map(this.deps.epics.listByApp(app.id).map((epic) => [epic.id, epic.code]));
    return this.deps.tasks
      .listByApp(app.id)
      .filter((candidate) => candidate.id !== task.id && OPEN_STATUSES.includes(candidate.status.kind))
      .map((candidate) => ({ id: candidate.id, line: lines.get(candidate.epicId) ?? '?', title: candidate.title }));
  }

  private proposeMemory(task: Task, app: App, output: unknown): void {
    const { memory, ids, clock, bus } = this.deps;
    const entries = readMemoryOutput(output, new Set(this.openStations(task, app).map((station) => station.id)));
    for (const entry of entries) {
      memory.saveProposal({ id: ids.next('proposal'), appId: app.id, sourceTaskId: task.id, proposed: entry.proposed, why: entry.why, status: 'pending', createdAt: clock.now() });
    }
    if (entries.length > 0) bus.publish({ kind: 'memory-changed', appId: app.id });
  }

  private async runAgent(ready: Task, app: App, phase: PhaseDefinition, taskWorkspace: TaskWorkspace, options: AgentRunOptions): Promise<RunObservation> {
    const notesDir = this.deps.notes.directoryFor(ready.id);
    const prompt = buildPhasePrompt(ready, phase, this.deps.decisions.listByTask(ready.id).filter((decision) => decision.answer), {
      notesDir,
      baseRef: this.deps.baseRef,
      verification: app.verification,
      ...(phase.output === 'memory' ? { openStations: this.openStations(ready, app) } : {}),
    });
    const choice = this.choiceFor(ready, phase);
    const handle = this.deps.agent.start({
      runId: options.runId,
      sessionId: options.sessionId,
      resume: options.resume,
      cwd: taskWorkspace.path,
      notesDir,
      prompt: options.promptSuffix ? `${prompt}\n\n${options.promptSuffix}` : prompt,
      systemPromptAppend: [this.deps.systemPromptAppend, this.deps.context.forApp(app), this.deps.instructions.localOnly(app.repoPath, taskWorkspace.path)].filter(Boolean).join('\n\n'),
      skill: phase.skill ?? null,
      model: choice.model,
      effort: choice.effort,
      maxTurns: this.deps.budget.maxTurns,
      outputSchema: options.outputSchema,
    });
    const control = { interrupt: () => handle.interrupt(), byUser: false };
    this.active.set(ready.id, control);
    const observation = await this.observe(ready.id, options.runId, handle.events, () => handle.interrupt()).finally(() => this.active.delete(ready.id));
    if (control.byUser && !observation.stopped) observation.stopped = this.failure('interrupted', 'user', 'Interrupted from Terminus');
    return observation;
  }

  private choiceFor(task: Task, phase: PhaseDefinition): AgentChoice {
    return choiceFor(this.deps.agentDefaults.all(), choiceKey(task.lifecycle.id, phase.id), phase, task.agent);
  }

  private async runSync(ready: Task, app: App, phase: PhaseDefinition, taskWorkspace: TaskWorkspace): Promise<Task> {
    const { runs, clock, ids, workspace } = this.deps;
    const runId = ids.next('run');
    const sessionId = ids.uuid();
    let task = this.save(startRun(ready, runId));
    let run: Run = { id: runId, taskId: task.id, phaseIndex: task.phaseIndex, sessionId, status: 'running', startedAt: clock.now(), endedAt: null, usage: null, output: null };
    runs.save(run);
    const finish = (next: Task, status: RunStatus, output: unknown = null): Task => {
      runs.save({ ...run, status, endedAt: clock.now(), output });
      return this.save(next);
    };

    let sync: SyncResult;
    try {
      sync = workspace.syncWithBase(taskWorkspace, this.deps.baseRef);
    } catch (error) {
      return finish(failRun(task, this.failure('sync-failed', 'sync', errorMessage(error)), this.deps.failurePolicy), 'failed');
    }
    this.note(runId, task.id, syncSummary(sync));

    if (sync.state === 'conflicts') {
      const observation = await this.runAgent(ready, app, phase, taskWorkspace, {
        runId,
        sessionId,
        resume: false,
        outputSchema: null,
        promptSuffix: `Merging ${sync.base} into this branch stopped on conflicts in:\n${sync.conflicts.map((file) => `- ${file}`).join('\n')}`,
      });
      run = { ...run, usage: observation.usage };
      if (observation.stopped || observation.finished?.outcome !== 'success') {
        const status: RunStatus = observation.stopped || observation.finished?.outcome === 'interrupted' ? 'interrupted' : 'failed';
        return finish(failRun(task, observation.stopped ?? this.failureFrom(observation.finished), this.deps.failurePolicy), status);
      }
      try {
        sync = workspace.syncWithBase(taskWorkspace, this.deps.baseRef);
      } catch (error) {
        return finish(failRun(task, this.failure('sync-failed', 'sync', errorMessage(error)), this.deps.failurePolicy), 'failed');
      }
      if (sync.state === 'conflicts') {
        const failure = this.failure('merge-conflict', `conflict:${sync.conflicts.join(',')}`, `Conflicts are still unresolved in: ${sync.conflicts.join(', ')}`);
        return finish(failRun(task, failure, this.deps.failurePolicy), 'failed');
      }
      this.note(runId, task.id, syncSummary(sync));
    }

    const results = await this.deps.checks.run(taskWorkspace.path, app.verification, (progress) => this.reportCheckProgress(runId, task.id, progress));
    const failed = results.find((result) => !result.ok);
    if (failed) {
      const failure = this.failure('check-failed', `check:${failed.name}`, `After syncing with ${sync.base}, ${failed.name} failed (\`${failed.command}\`, exit ${String(failed.exitCode)}):\n${failed.outputTail}`);
      task = rejectByChecks(task, failure, phase.retryFrom ?? phaseAt(task.lifecycle, task.phaseIndex - 1).id, this.deps.failurePolicy);
      return finish(task, 'failed', results);
    }
    const sequence = task.checkpoints.length + 1;
    const ref = workspace.checkpoint(taskWorkspace, sequence, phase.id);
    return finish(passChecks(task, { sequence, phaseIndex: task.phaseIndex, ref, sessionId: null, takenAt: clock.now() }), 'succeeded', results);
  }

  private note(runId: string, taskId: string, text: string): void {
    const event: AgentEvent = { type: 'text', text };
    this.deps.transcripts.append(runId, event);
    this.deps.bus.publish({ kind: 'run-event', runId, taskId, event });
  }

  private async runChecks(ready: Task, app: App, phase: PhaseDefinition, taskWorkspace: TaskWorkspace): Promise<Task> {
    const { runs, clock, ids } = this.deps;
    const runId = ids.next('run');
    let task = this.save(startRun(ready, runId));
    const taskId = task.id;
    const run: Run = { id: runId, taskId, phaseIndex: task.phaseIndex, sessionId: 'checks', status: 'running', startedAt: clock.now(), endedAt: null, usage: null, output: null };
    runs.save(run);

    const results = await this.deps.checks.run(taskWorkspace.path, app.verification, (progress) => this.reportCheckProgress(runId, taskId, progress));

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

  private reportCheckProgress(runId: string, taskId: string, progress: CheckProgress): void {
    if (progress.kind === 'started') {
      this.deps.transcripts.append(runId, { type: 'check-started', name: progress.name, command: progress.command });
      this.deps.bus.publish({ kind: 'check-started', runId, taskId, name: progress.name, command: progress.command });
    } else if (progress.kind === 'output') {
      this.deps.transcripts.append(runId, { type: 'check-output', name: progress.name, command: progress.command, outputTail: progress.outputTail });
      this.deps.bus.publish({ kind: 'check-output', runId, taskId, name: progress.name, command: progress.command, outputTail: progress.outputTail });
    } else {
      this.deps.transcripts.append(runId, progress.result);
      this.deps.bus.publish({ kind: 'check-result', runId, taskId, result: progress.result });
    }
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
    if (finished.outcome === 'isolation-breach') return this.failure('isolation-breach', 'isolation', finished.summary);
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

const OPEN_STATUSES: readonly TaskStatus['kind'][] = ['todo', 'ready', 'awaiting-decision', 'awaiting-gate', 'blocked', 'manual'];

function outputSchemaFor(phase: PhaseDefinition): object | null {
  if (phase.output === 'decisions') return DECISIONS_OUTPUT_SCHEMA;
  if (phase.output === 'review') return REVIEW_OUTPUT_SCHEMA;
  if (phase.output === 'verdict') return VERDICT_OUTPUT_SCHEMA;
  if (phase.output === 'memory') return MEMORY_OUTPUT_SCHEMA;
  return null;
}

function syncSummary(sync: SyncResult): string {
  if (sync.state === 'up-to-date') return `Branch already contains ${sync.base}.`;
  if (sync.state === 'merged') return `Merged ${sync.base} into the branch.`;
  return `Merging ${sync.base} stopped on conflicts in: ${sync.conflicts.join(', ')}`;
}

function errorMessage(error: unknown): string {
  const stderr = (error as { stderr?: unknown }).stderr;
  if (typeof stderr === 'string' && stderr.trim()) return stderr.trim();
  return error instanceof Error ? error.message : String(error);
}
