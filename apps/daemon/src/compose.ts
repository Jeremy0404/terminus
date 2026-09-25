import type { Hono } from 'hono';
import { EmitterBus } from './adapters/events/emitter-bus.js';
import { createHttpApp } from './adapters/http/app.js';
import { Adoption } from './application/adoption.js';
import { AppFounder } from './application/app-founder.js';
import { AgentSettings } from './application/agent-settings.js';
import { Catalog } from './application/catalog.js';
import { ContextPack } from './application/context-pack.js';
import { EpicPlanner } from './application/epic-planner.js';
import { PhaseRunner, type RunBudget } from './application/phase-runner.js';
import type { AgentDefaultsStore } from './application/ports/agent-defaults-store.js';
import type { AgentRunner } from './application/ports/agent-runner.js';
import type { MemoryRepository } from './application/ports/memory-repository.js';
import type { RepositoryKnowledge } from './application/ports/repository-knowledge.js';
import type { RepositoryCreator } from './application/ports/repository-creator.js';
import type { Vault } from './application/ports/vault.js';
import type { SkillCatalog } from './application/ports/skill-catalog.js';
import type { CheckRunner } from './application/ports/check-runner.js';
import type { CodeHost } from './application/ports/code-host.js';
import type { IssueTracker } from './application/ports/issue-tracker.js';
import type { RepoScanner } from './application/ports/repo-scanner.js';
import type { PlaybookRegistry } from './application/ports/playbook-registry.js';
import type { QuotaStore } from './application/ports/quota-store.js';
import type {
  AppRepository,
  DecisionRepository,
  EpicRepository,
  RunRepository,
  TaskRepository,
} from './application/ports/repositories.js';
import type { Clock, IdGenerator } from './application/ports/system.js';
import type { RepositoryInstructions } from './application/ports/repository-instructions.js';
import type { TaskNotes } from './application/ports/task-notes.js';
import type { TranscriptStore } from './application/ports/transcript-store.js';
import type { Workspace } from './application/ports/workspace.js';
import { PlaybookRitual } from './application/playbook-ritual.js';
import { ProjectMemory } from './application/project-memory.js';
import { Queries } from './application/queries.js';
import { QuotaTrackingRunner } from './application/quota-tracker.js';
import { Scheduler } from './application/scheduler.js';
import { STATION_DRAFT_TIMEOUT_MS, StationDrafter } from './application/station-drafter.js';
import { TaskActions } from './application/task-actions.js';
import { NO_EXPORT, VaultExport } from './application/vault-export.js';
import { DEFAULT_FAILURE_POLICY } from './domain/failure.js';

export interface Adapters {
  readonly apps: AppRepository;
  readonly epics: EpicRepository;
  readonly tasks: TaskRepository;
  readonly runs: RunRepository;
  readonly decisions: DecisionRepository;
  readonly transcripts: TranscriptStore;
  readonly quota: QuotaStore;
  readonly workspace: Workspace;
  readonly notes: TaskNotes;
  readonly instructions: RepositoryInstructions;
  readonly agent: AgentRunner;
  readonly agentDefaults: AgentDefaultsStore;
  readonly memory: MemoryRepository;
  readonly knowledge: RepositoryKnowledge;
  readonly repositories: RepositoryCreator;
  readonly vault: Vault | null;
  readonly skills: SkillCatalog;
  readonly checks: CheckRunner;
  readonly codeHost: CodeHost;
  readonly scanner: RepoScanner;
  readonly issues: IssueTracker;
  readonly playbooks: PlaybookRegistry;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface Settings {
  readonly version: string;
  readonly baseRef: string;
  readonly concurrency: number;
  readonly budget: RunBudget;
  readonly systemPromptAppend: string;
  readonly projectsDir: string;
  readonly playbooksRepo: string;
}

export interface Services {
  readonly http: Hono;
  readonly planner: EpicPlanner;
  readonly scheduler: Scheduler;
  readonly bus: EmitterBus;
}

export function compose(given: Adapters, settings: Settings): Services {
  const bus = new EmitterBus();
  const adapters = { ...given, agent: new QuotaTrackingRunner(given.agent, given.quota, bus, given.clock), context: new ContextPack(given) };
  const phases = new PhaseRunner({
    ...adapters,
    bus,
    budget: settings.budget,
    failurePolicy: DEFAULT_FAILURE_POLICY,
    baseRef: settings.baseRef,
    systemPromptAppend: settings.systemPromptAppend,
  });
  const scheduler = new Scheduler(adapters.apps, adapters.tasks, phases, settings.concurrency, (taskId, error) => {
    console.error(`run of ${taskId} crashed`, error);
  });
  const exporter = adapters.vault
    ? new VaultExport({ vault: adapters.vault, notes: adapters.notes, clock: adapters.clock, onError: (error) => console.error('vault export failed', error) })
    : NO_EXPORT;
  const actions = new TaskActions({ ...adapters, bus, baseRef: settings.baseRef, exporter });
  const catalog = new Catalog({ ...adapters, bus });
  const planner = new EpicPlanner({ ...adapters, catalog, bus, budget: settings.budget, baseRef: settings.baseRef });
  const drafter = new StationDrafter({ ...adapters, timeoutMs: STATION_DRAFT_TIMEOUT_MS });
  const http = createHttpApp({
    version: settings.version,
    queries: new Queries(adapters),
    catalog,
    founder: new AppFounder({ catalog, repositories: adapters.repositories, projectsDir: settings.projectsDir }),
    adoption: new Adoption(adapters.scanner, adapters.checks, adapters.issues, catalog, adapters.apps),
    planner,
    drafter,
    actions,
    agentSettings: new AgentSettings(adapters),
    ritual: new PlaybookRitual({ ...adapters, catalog, playbooksRepo: settings.playbooksRepo }),
    memory: new ProjectMemory({ ...adapters, bus, closer: actions }),
    runs: phases,
    scheduler,
    events: bus,
  });
  return { http, planner, scheduler, bus };
}
