import { choiceKey, resolveChoice } from '../domain/agent-choice.js';
import type { Epic } from '../domain/epic.js';
import { IDLE_BREAKDOWN } from '../domain/epic.js';
import { DomainError } from '../domain/errors.js';
import type { Track } from '../domain/lifecycle.js';
import type { Task } from '../domain/task.js';
import { BREAKDOWN_OUTPUT_SCHEMA, readBreakdown } from './breakdown-output.js';
import type { Catalog } from './catalog.js';
import type { RunBudget } from './phase-runner.js';
import type { AgentDefaultsStore } from './ports/agent-defaults-store.js';
import type { AgentEvent, AgentRunner } from './ports/agent-runner.js';
import type { PlaybookRegistry } from './ports/playbook-registry.js';
import type { AppRepository, EpicRepository, TaskRepository } from './ports/repositories.js';
import type { RepositoryInstructions } from './ports/repository-instructions.js';
import type { IdGenerator, RunEventBus } from './ports/system.js';
import type { TaskNotes } from './ports/task-notes.js';
import type { TranscriptStore } from './ports/transcript-store.js';
import type { Workspace } from './ports/workspace.js';

const BREAKDOWN_PHASE = 'breakdown';

export interface EpicPlannerDeps {
  readonly apps: AppRepository;
  readonly epics: EpicRepository;
  readonly tasks: TaskRepository;
  readonly catalog: Catalog;
  readonly workspace: Workspace;
  readonly notes: TaskNotes;
  readonly instructions: RepositoryInstructions;
  readonly agent: AgentRunner;
  readonly agentDefaults: AgentDefaultsStore;
  readonly playbooks: PlaybookRegistry;
  readonly transcripts: TranscriptStore;
  readonly ids: IdGenerator;
  readonly bus: RunEventBus;
  readonly budget: RunBudget;
  readonly baseRef: string;
}

export interface AcceptedBreakdown {
  readonly description: string;
  readonly stations: readonly { readonly title: string; readonly why?: string; readonly dependsOn: readonly number[] }[];
  readonly track: Track;
}

export class EpicPlanner {
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly deps: EpicPlannerDeps) {}

  start(epicId: string, brief: string): Epic {
    const epic = this.load(epicId);
    if (epic.breakdown.status === 'running') throw new DomainError(`Line ${epic.code} is already being broken down`);
    const app = this.deps.apps.get(epic.appId);
    if (!app) throw new DomainError(`Line ${epic.code} has no app`);
    const runId = this.deps.ids.next('run');
    const running = this.save({ ...epic, breakdown: { status: 'running', brief, runId } });
    const flight = this.run(running, app.repoPath, app.id, brief, runId)
      .catch((error: unknown) => {
        this.save({ ...this.load(epicId), breakdown: { status: 'failed', brief, error: error instanceof Error ? error.message : String(error) } });
      })
      .finally(() => this.inFlight.delete(epicId));
    this.inFlight.set(epicId, flight);
    return running;
  }

  accept(epicId: string, accepted: AcceptedBreakdown): Task[] {
    const epic = this.load(epicId);
    if (epic.breakdown.status !== 'ready') throw new DomainError(`Line ${epic.code} has no breakdown to accept`);
    const created: Task[] = [];
    for (const [index, station] of accepted.stations.entries()) {
      const invalid = station.dependsOn.filter((dependency) => dependency >= index || !created[dependency]);
      if (invalid.length > 0) throw new DomainError(`Station ${index + 1} can only depend on stations listed before it`);
      created.push(
        this.deps.catalog.createTask(epicId, {
          title: station.title,
          description: station.why ?? '',
          dependsOn: station.dependsOn.map((dependency) => (created[dependency] as Task).id),
          autonomy: 'up-to-pr',
          track: accepted.track,
        }),
      );
    }
    this.save({ ...epic, description: accepted.description, breakdown: IDLE_BREAKDOWN });
    return created;
  }

  dismiss(epicId: string): Epic {
    const epic = this.load(epicId);
    if (epic.breakdown.status === 'running') throw new DomainError(`Line ${epic.code} is still being broken down`);
    return this.save({ ...epic, breakdown: IDLE_BREAKDOWN });
  }

  async idle(): Promise<void> {
    await Promise.all(this.inFlight.values());
  }

  private async run(epic: Epic, repoPath: string, appId: string, brief: string, runId: string): Promise<void> {
    const scratch = this.deps.workspace.prepare(repoPath, appId, `epic-${runId}`, this.deps.baseRef);
    try {
      const notesDir = this.deps.notes.directoryFor(`epic-${epic.id}`);
      const lifecycle = this.deps.playbooks.lifecycle('epic');
      const phase = lifecycle.phases.find((candidate) => candidate.id === BREAKDOWN_PHASE);
      const choice = resolveChoice(this.deps.agentDefaults.all()[choiceKey(lifecycle.id, BREAKDOWN_PHASE)], phase);
      const handle = this.deps.agent.start({
        runId,
        sessionId: this.deps.ids.uuid(),
        resume: false,
        cwd: scratch.path,
        notesDir,
        prompt: this.prompt(epic, brief, notesDir),
        systemPromptAppend: this.deps.instructions.localOnly(repoPath, scratch.path),
        skill: 'epic-breakdown',
        model: choice.model,
        effort: choice.effort,
        maxTurns: this.deps.budget.maxTurns,
        outputSchema: BREAKDOWN_OUTPUT_SCHEMA,
      });
      let finished: Extract<AgentEvent, { type: 'finished' }> | null = null;
      for await (const event of handle.events) {
        this.deps.transcripts.append(runId, event);
        if (event.type === 'finished') finished = event;
      }
      const proposal = finished?.outcome === 'success' ? readBreakdown(finished.structuredOutput) : null;
      const current = this.load(epic.id);
      if (proposal) this.save({ ...current, breakdown: { status: 'ready', brief, proposal } });
      else this.save({ ...current, breakdown: { status: 'failed', brief, error: finished ? finished.summary || finished.outcome : 'The agent stopped without a result' } });
    } finally {
      this.deps.workspace.remove(repoPath, scratch, { deleteBranch: true });
    }
  }

  private prompt(epic: Epic, brief: string, notesDir: string): string {
    const existing = this.deps.tasks
      .listByApp(epic.appId)
      .filter((task) => task.status.kind !== 'closed')
      .map((task) => `- [${this.deps.epics.get(task.epicId)?.code ?? '?'}] ${task.title} (${task.status.kind})`);
    return [
      `Epic: ${epic.name} (line ${epic.code})`,
      `Brief from the human: ${brief.trim() || 'none — infer the goal from the epic name and the code'}`,
      epic.description ? `Current description:\n${epic.description}` : '',
      `Task notes directory: ${notesDir}`,
      'Stations already on this app network (do not propose them again):',
      ...(existing.length > 0 ? existing : ['- none']),
      '',
      'Follow the `epic-breakdown` skill.',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  private load(epicId: string): Epic {
    const epic = this.deps.epics.get(epicId);
    if (!epic) throw new DomainError(`Unknown epic ${epicId}`);
    return epic;
  }

  private save(epic: Epic): Epic {
    this.deps.epics.save(epic);
    this.deps.bus.publish({ kind: 'epic-changed', epic });
    return epic;
  }
}
