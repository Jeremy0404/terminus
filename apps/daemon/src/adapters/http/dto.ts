import type { AgentPhaseDto, AppDto, DecisionDto, EpicDto, InboxItemDto, NetworkDto, QuotaDto, RunDto, ServerEventDto, TaskDetailDto, TaskSummaryDto } from '@terminus/contracts';
import type { AgentPhase } from '../../application/agent-settings.js';
import type { RunUpdate } from '../../application/ports/system.js';
import type { Network, TaskDetail } from '../../application/queries.js';
import type { App } from '../../domain/app.js';
import type { Decision } from '../../domain/decision.js';
import type { Epic } from '../../domain/epic.js';
import { appliesTo } from '../../domain/lifecycle.js';
import type { InboxItem } from '../../domain/inbox.js';
import type { Quota } from '../../domain/quota.js';
import type { Run } from '../../domain/run.js';
import type { Task } from '../../domain/task.js';

export const toAppDto = ({ id, name, repoPath }: App): AppDto => ({ id, name, repoPath });

export const toEpicDto = ({ id, appId, code, name, status, position, description, breakdown }: Epic): EpicDto => ({ id, appId, code, name, status, position, description, breakdown });

export const toTaskSummaryDto = (task: Task): TaskSummaryDto => ({
  id: task.id,
  epicId: task.epicId,
  title: task.title,
  autonomy: task.autonomy,
  track: task.track,
  agent: task.agent,
  phases: task.lifecycle.phases.map((phase) => phase.id),
  phasesInTrack: task.lifecycle.phases.filter((phase) => appliesTo(phase, task.track)).map((phase) => phase.id),
  skippablePhases: task.lifecycle.phases.filter((phase) => phase.skippable).map((phase) => phase.id),
  phaseIndex: task.phaseIndex,
  status: task.status,
  dependsOn: task.dependsOn,
});

const toInboxItemDto = (item: InboxItem): InboxItemDto => item;

const toRunDto = ({ id, phaseIndex, status, startedAt, endedAt, usage, output, agent }: Run): RunDto => ({ id, phaseIndex, status, startedAt, endedAt, usage, output, agent: agent ?? null });

export const toAgentPhaseDto = ({ key, lifecycleId, phaseId, choice }: AgentPhase): AgentPhaseDto => ({ key, lifecycleId, phaseId, choice });

const toDecisionDto = ({ id, kind, phaseIndex, question, options, answer, proposal }: Decision): DecisionDto => ({ id, kind, proposal: proposal ?? null, phaseIndex, question, options, answer });

export const toNetworkDto = (network: Network): NetworkDto => ({
  app: toAppDto(network.app),
  epics: network.epics.map(toEpicDto),
  tasks: network.tasks.map(toTaskSummaryDto),
  inbox: network.inbox.map(toInboxItemDto),
});

export const toTaskDetailDto = (detail: TaskDetail): TaskDetailDto => ({
  task: toTaskSummaryDto(detail.task),
  checkpoints: detail.task.checkpoints.map(({ sequence, phaseIndex, ref, takenAt }) => ({ sequence, phaseIndex, ref, takenAt })),
  failures: detail.task.failuresInPhase,
  actions: detail.actions,
  runs: detail.runs.map(toRunDto),
  decisions: detail.decisions.map(toDecisionDto),
});

export const toQuotaDto = ({ limited, windows, observedAt }: Quota): QuotaDto => ({ limited, windows, observedAt });

export const toServerEventDto = (update: RunUpdate): ServerEventDto => {
  switch (update.kind) {
    case 'task-changed':
      return { type: 'task-changed', task: toTaskSummaryDto(update.task) };
    case 'epic-changed':
      return { type: 'epic-changed', epic: toEpicDto(update.epic) };
    case 'run-event':
      return { type: 'run-event', runId: update.runId, taskId: update.taskId, event: update.event };
    case 'check-started':
      return { type: 'check-started', runId: update.runId, taskId: update.taskId, name: update.name, command: update.command };
    case 'check-output':
      return { type: 'check-output', runId: update.runId, taskId: update.taskId, name: update.name, command: update.command, outputTail: update.outputTail };
    case 'check-result':
      return { type: 'check-result', runId: update.runId, taskId: update.taskId, result: update.result };
    case 'quota-changed':
      return { type: 'quota-changed', quota: toQuotaDto(update.quota) };
  }
};
