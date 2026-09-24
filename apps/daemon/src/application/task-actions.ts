import type { DecisionAnswer } from '../domain/decision.js';
import { DomainError } from '../domain/errors.js';
import {
  answerDecision,
  approveGate,
  openTask,
  recover,
  resumeFromManual,
  sendBack,
  type RecoveryOption,
  type Task,
} from '../domain/task.js';
import type { AppRepository, DecisionRepository, EpicRepository, RunRepository, TaskRepository } from './ports/repositories.js';
import type { Clock, RunEventBus } from './ports/system.js';
import type { Workspace } from './ports/workspace.js';

export interface TaskActionsDeps {
  readonly apps: AppRepository;
  readonly epics: EpicRepository;
  readonly tasks: TaskRepository;
  readonly runs: RunRepository;
  readonly decisions: DecisionRepository;
  readonly workspace: Workspace;
  readonly clock: Clock;
  readonly bus: RunEventBus;
  readonly baseRef: string;
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
    const next = this.deps.decisions
      .listByTask(task.id)
      .find((candidate) => candidate.phaseIndex === task.phaseIndex && candidate.answer === null && candidate.id !== decisionId);
    return this.save(answerDecision(task, next?.id ?? null));
  }

  approve(taskId: string): Task {
    return this.save(approveGate(this.load(taskId)));
  }

  sendBack(taskId: string, toPhaseId: string): Task {
    return this.save(sendBack(this.load(taskId), toPhaseId));
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

  resumeFromManual(taskId: string): Task {
    return this.save(resumeFromManual(this.load(taskId)));
  }

  private workspaceOf(task: Task) {
    const epic = this.deps.epics.get(task.epicId);
    const app = epic && this.deps.apps.get(epic.appId);
    if (!app) throw new DomainError(`Task ${task.id} has no app`);
    return this.deps.workspace.prepare(app.repoPath, app.id, task.id, this.deps.baseRef);
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
