import type { AgentChoice } from '../domain/agent-choice.js';
import type { DecisionAnswer, Proposal } from '../domain/decision.js';
import { DomainError } from '../domain/errors.js';
import {
  answerDecision,
  chooseAgent,
  closeTask,
  createTask,
  releaseProposal,
  approveGate,
  openTask,
  recover,
  resumeFromManual,
  sendBack,
  setTrack,
  skipPhase,
  type CloseReason,
  type RecoveryOption,
  type Task,
} from '../domain/task.js';
import type { AppRepository, DecisionRepository, EpicRepository, RunRepository, TaskRepository } from './ports/repositories.js';
import type { Clock, IdGenerator, RunEventBus } from './ports/system.js';
import { phaseAt, type Track } from '../domain/lifecycle.js';
import type { ChecksState, CodeHost, PullRequest } from './ports/code-host.js';
import type { Workspace } from './ports/workspace.js';
import { readBrief } from './brief-output.js';
import { readStack } from './stack-output.js';
import type { ExportHooks } from './vault-export.js';

export interface TaskActionsDeps {
  readonly apps: AppRepository;
  readonly epics: EpicRepository;
  readonly tasks: TaskRepository;
  readonly runs: RunRepository;
  readonly decisions: DecisionRepository;
  readonly workspace: Workspace;
  readonly codeHost: CodeHost;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly bus: RunEventBus;
  readonly baseRef: string;
  readonly exporter: ExportHooks;
}

export interface Closed {
  readonly task: Task;
  readonly warnings: readonly string[];
}

export interface TakeOver {
  readonly task: Task;
  readonly command: string;
}

export class TaskActions {
  constructor(private readonly deps: TaskActionsDeps) {}

  open(taskId: string): Task {
    const task = this.load(taskId);
    const dependencies = task.dependsOn.map((id) => this.load(id));
    return this.save(openTask(task, dependencies));
  }

  answer(decisionId: string, answer: DecisionAnswer): Task {
    const decision = this.deps.decisions.get(decisionId);
    if (!decision) throw new DomainError(`Unknown decision ${decisionId}`);
    const task = this.load(decision.taskId);
    if (task.status.kind !== 'awaiting-decision' || task.status.decisionId !== decisionId) {
      throw new DomainError(`Task ${task.id} is not waiting on decision ${decisionId}`);
    }
    if (answer.kind === 'option' && !decision.options[answer.index]) throw new DomainError(`Decision ${decisionId} has no option ${answer.index}`);
    this.deps.decisions.save({ ...decision, answer, answeredAt: this.deps.clock.now() });
    if (decision.proposal) {
      const accepted = answer.kind === 'option' && answer.index === 0;
      return accepted ? this.applyProposal(task, decision.proposal) : this.save(releaseProposal(task));
    }
    const next = this.deps.decisions
      .listByTask(task.id)
      .find((candidate) => candidate.phaseIndex === task.phaseIndex && candidate.answer === null && candidate.id !== decisionId);
    return this.save(answerDecision(task, next?.id ?? null));
  }

  private applyProposal(task: Task, proposal: Proposal): Task {
    switch (proposal.kind) {
      case 'close':
        return this.close(task.id, proposal.reason, proposal.evidence).task;
      case 'lighten':
        return this.changeTrack(task.id, 'light');
      case 'split': {
        const created = proposal.stations.map((station) =>
          createTask({ id: this.deps.ids.next('task'), epicId: task.epicId, title: station.title, description: station.why, lifecycle: task.lifecycle, autonomy: task.autonomy, track: task.track }),
        );
        for (const station of created) this.save(station);
        const epic = this.deps.epics.get(task.epicId);
        const siblings = epic ? this.deps.tasks.listByApp(epic.appId) : [];
        for (const dependant of siblings.filter((candidate) => candidate.dependsOn.includes(task.id))) {
          this.save({ ...dependant, dependsOn: [...dependant.dependsOn.filter((id) => id !== task.id), ...created.map((station) => station.id)] });
        }
        return this.close(task.id, 'obsolete', `Split into: ${created.map((station) => station.title).join(' · ')}`).task;
      }
    }
  }

  approve(taskId: string): Task {
    const task = this.load(taskId);
    if (task.status.kind === 'awaiting-gate' && task.status.gate === 'merge') throw new DomainError(`Task ${taskId} is merged with merge, not approve`);
    const approved = approveGate(task);
    const phase = phaseAt(task.lifecycle, task.phaseIndex);
    if (phase.output === 'brief') this.adoptBrief(task);
    if (phase.output === 'stack') this.adoptStack(task);
    if (phase.id === 'plan' && phase.gate === 'plan-approval') this.deps.exporter.planApproved(this.appOf(task), task);
    const saved = this.save(approved);
    if (saved.status.kind === 'done') this.deps.workspace.remove(this.appOf(task).repoPath, this.workspaceOf(task));
    return saved;
  }

  private adoptBrief(task: Task): void {
    const brief = readBrief(this.lastOutput(task));
    if (!brief) throw new DomainError(`Task ${task.id} has no brief to approve`);
    const app = { ...this.appOf(task), brief };
    this.deps.apps.save(app);
    this.deps.exporter.briefApproved(app, brief);
  }

  private adoptStack(task: Task): void {
    const chosen = readStack(this.lastOutput(task));
    if (!chosen) throw new DomainError(`Task ${task.id} has no stack to approve`);
    const current = this.appOf(task);
    const app = { ...current, stack: chosen.stack, verification: chosen.verification.length > 0 ? chosen.verification : current.verification };
    this.deps.apps.save(app);
    this.deps.exporter.stackApproved(app, chosen.records, task);
  }

  private lastOutput(task: Task): unknown {
    return this.deps.runs
      .listByTask(task.id)
      .filter((candidate) => candidate.phaseIndex === task.phaseIndex && candidate.status === 'succeeded')
      .at(-1)?.output;
  }

  merge(taskId: string): Task {
    const task = this.load(taskId);
    if (task.status.kind !== 'awaiting-gate' || task.status.gate !== 'merge') throw new DomainError(`Task ${taskId} is not waiting at the merge gate`);
    const pullRequest = this.pullRequestOf(task);
    const app = this.appOf(task);
    const syncPhase = task.lifecycle.phases.find((phase) => phase.executor === 'sync');
    if (syncPhase && this.deps.workspace.isBehindBase(this.workspaceOf(task), this.deps.baseRef)) return this.save(sendBack(task, syncPhase.id));
    const checks = this.deps.codeHost.checks(app.repoPath, pullRequest.number);
    if (checks === 'pending' || checks === 'failure') throw new DomainError(`CI on pull request #${pullRequest.number} is ${checks}`);
    try {
      this.deps.codeHost.merge(app.repoPath, pullRequest.number);
    } catch (error) {
      const stderr = (error as { stderr?: unknown }).stderr;
      throw new DomainError(`GitHub refused to merge pull request #${pullRequest.number}: ${typeof stderr === 'string' && stderr.trim() ? stderr.trim() : String(error)}`);
    }
    const merged = this.save(approveGate(task));
    this.deps.exporter.taskMerged(app, task);
    if (merged.status.kind === 'done') this.deps.workspace.remove(app.repoPath, this.workspaceOf(task));
    return merged;
  }

  checks(taskId: string): ChecksState {
    const task = this.load(taskId);
    const pullRequest = this.pullRequestOf(task);
    const app = this.appOf(task);
    return this.deps.codeHost.checks(app.repoPath, pullRequest.number);
  }

  sendBack(taskId: string, toPhaseId: string, comment = ''): Task {
    const task = this.load(taskId);
    const sent = this.save(sendBack(task, toPhaseId));
    this.recordDeviation(sent, `Sent back from the ${phaseAt(task.lifecycle, task.phaseIndex).id} phase to ${toPhaseId}`, comment.trim());
    return sent;
  }

  recover(taskId: string, option: Exclude<RecoveryOption, 'take-over'>, rewindTo?: number): Task {
    const task = this.load(taskId);
    const recovered = recover(task, option, rewindTo);
    if (option !== 'resume-session') {
      const target = option === 'rewind' ? recovered.checkpoints.at(-1) : task.checkpoints.at(-1);
      const workspace = this.workspaceOf(task);
      this.deps.workspace.rewind(workspace, target?.ref ?? 'HEAD');
    }
    return this.save(recovered);
  }

  takeOver(taskId: string): TakeOver {
    const task = this.load(taskId);
    const taken = this.save(recover(task, 'take-over'));
    const workspace = this.workspaceOf(task);
    const session = this.deps.runs.listByTask(taskId).at(-1)?.sessionId;
    const command = session ? `cd ${workspace.path} && claude --resume ${session}` : `cd ${workspace.path}`;
    return { task: taken, command };
  }

  close(taskId: string, reason: CloseReason, evidence: string): Closed {
    const task = this.load(taskId);
    const closed = this.save(closeTask(task, reason, evidence));
    const app = this.appOf(task);
    const warnings: string[] = [];
    try {
      this.deps.workspace.remove(app.repoPath, this.deps.workspace.locate(app.id, task.id));
    } catch (error) {
      warnings.push(`The worktree could not be removed: ${String(error)}`);
    }
    const pullRequest = this.publishedPullRequest(task);
    if (pullRequest) {
      try {
        this.deps.codeHost.close(app.repoPath, pullRequest.number, `Closed from Terminus (${reason})${evidence ? `: ${evidence}` : '.'}`);
      } catch (error) {
        warnings.push(`Pull request #${pullRequest.number} could not be closed: ${String(error)}`);
      }
    }
    return { task: closed, warnings };
  }

  changeTrack(taskId: string, track: Track): Task {
    const task = this.load(taskId);
    if (task.track === track) return task;
    const changed = this.save(setTrack(task, track));
    this.recordDeviation(changed, `Track changed from ${task.track} to ${track}`);
    return changed;
  }

  chooseAgent(taskId: string, agent: AgentChoice): Task {
    return this.save(chooseAgent(this.load(taskId), agent));
  }

  skip(taskId: string): Task {
    const task = this.load(taskId);
    const skipped = this.save(skipPhase(task));
    this.recordDeviation(skipped, `Phase ${phaseAt(task.lifecycle, task.phaseIndex).id} skipped`);
    if (skipped.status.kind === 'done') this.deps.workspace.remove(this.appOf(task).repoPath, this.workspaceOf(task));
    return skipped;
  }

  resumeFromManual(taskId: string): Task {
    return this.save(resumeFromManual(this.load(taskId)));
  }

  private recordDeviation(task: Task, what: string, comment = ''): void {
    const now = this.deps.clock.now();
    this.deps.decisions.save({
      id: this.deps.ids.next('decision'),
      kind: 'deviation',
      taskId: task.id,
      phaseIndex: task.phaseIndex,
      question: what,
      options: [],
      answer: { kind: 'other', text: comment || 'Decided by the human' },
      createdAt: now,
      answeredAt: now,
    });
  }

  private workspaceOf(task: Task) {
    const app = this.appOf(task);
    return this.deps.workspace.prepare(app.repoPath, app.id, task.id, this.deps.baseRef);
  }

  private appOf(task: Task) {
    const epic = this.deps.epics.get(task.epicId);
    const app = epic && this.deps.apps.get(epic.appId);
    if (!app) throw new DomainError(`Task ${task.id} has no app`);
    return app;
  }

  private pullRequestOf(task: Task): PullRequest {
    const published = this.publishedPullRequest(task);
    if (!published) throw new DomainError(`Task ${task.id} has no pull request`);
    return published;
  }

  private publishedPullRequest(task: Task): PullRequest | null {
    const output = this.deps.runs
      .listByTask(task.id)
      .map((run) => run.output)
      .reverse()
      .find((candidate): candidate is { pullRequest: PullRequest } => typeof candidate === 'object' && candidate !== null && 'pullRequest' in candidate);
    return output?.pullRequest ?? null;
  }

  private load(taskId: string): Task {
    const task = this.deps.tasks.get(taskId);
    if (!task) throw new DomainError(`Unknown task ${taskId}`);
    return task;
  }

  private save(task: Task): Task {
    this.deps.tasks.save(task);
    this.deps.bus.publish({ kind: 'task-changed', task });
    return task;
  }
}
