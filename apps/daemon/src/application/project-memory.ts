import { productJournal, type ProductJournal } from '../domain/product.js';
import { DomainError } from '../domain/errors.js';
import type { CloseReason } from '../domain/task.js';
import { MAX_DEFINITION_CHARS, MAX_LESSON_CHARS, MAX_TERM_CHARS, memoryText, sameTerm, type Lesson, type MemoryProposal, type Term } from '../domain/memory.js';
import type { App } from '../domain/app.js';
import type { ContextSource } from './context-pack.js';
import type { MemoryRepository } from './ports/memory-repository.js';
import type { AppRepository, TaskRepository } from './ports/repositories.js';
import type { Clock, IdGenerator, RunEventBus } from './ports/system.js';

export type ReviewedProposal = MemoryProposal & { readonly sourceTitle: string; readonly targetTitle: string | null };

export interface MemoryView {
  readonly lessons: readonly Lesson[];
  readonly terms: readonly Term[];
  readonly proposals: readonly ReviewedProposal[];
}

export interface ProjectMemoryDeps {
  readonly apps: AppRepository;
  readonly tasks: TaskRepository;
  readonly memory: MemoryRepository;
  readonly context: ContextSource;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly bus: RunEventBus;
  readonly closer: { close(taskId: string, reason: CloseReason, evidence: string): unknown };
}

export class ProjectMemory {
  constructor(private readonly deps: ProjectMemoryDeps) {}

  setProduct(appId: string, input: ProductJournal): ProductJournal {
    const app = this.appOf(appId);
    const product = productJournal(input);
    this.deps.apps.save({ ...app, product });
    this.deps.bus.publish({ kind: 'memory-changed', appId });
    return product;
  }

  view(appId: string): MemoryView {
    this.appOf(appId);
    const proposals = this.deps.memory.pendingProposals(appId).map((proposal) => ({
      ...proposal,
      sourceTitle: this.titleOf(proposal.sourceTaskId),
      targetTitle: proposal.proposed.kind === 'obsolete' ? this.titleOf(proposal.proposed.targetTaskId) : null,
    }));
    return { lessons: this.deps.memory.lessons(appId), terms: this.deps.memory.terms(appId), proposals };
  }

  addLesson(appId: string, text: string, sourceTaskId: string | null = null): Lesson {
    this.appOf(appId);
    const lesson: Lesson = { id: this.deps.ids.next('lesson'), appId, text: memoryText(text, MAX_LESSON_CHARS, 'lesson'), sourceTaskId, createdAt: this.deps.clock.now() };
    this.deps.memory.saveLesson(lesson);
    return lesson;
  }

  removeLesson(id: string): void {
    if (!this.deps.memory.removeLesson(id)) throw new DomainError(`Unknown lesson ${id}`);
  }

  setTerm(appId: string, term: string, definition: string): Term {
    this.appOf(appId);
    const name = memoryText(term, MAX_TERM_CHARS, 'term');
    const existing = this.deps.memory.terms(appId).find((candidate) => sameTerm(candidate.term, name));
    const saved: Term = {
      id: existing?.id ?? this.deps.ids.next('term'),
      appId,
      term: name,
      definition: memoryText(definition, MAX_DEFINITION_CHARS, 'definition'),
      updatedAt: this.deps.clock.now(),
    };
    this.deps.memory.saveTerm(saved);
    return saved;
  }

  removeTerm(id: string): void {
    if (!this.deps.memory.removeTerm(id)) throw new DomainError(`Unknown term ${id}`);
  }

  accept(proposalId: string): void {
    const proposal = this.pending(proposalId);
    const proposed = proposal.proposed;
    if (proposed.kind === 'lesson') this.addLesson(proposal.appId, proposed.text, proposal.sourceTaskId);
    else if (proposed.kind === 'term') this.setTerm(proposal.appId, proposed.term, proposed.definition);
    else this.deps.closer.close(proposed.targetTaskId, 'obsolete', `Covered by « ${this.titleOf(proposal.sourceTaskId)} » (${proposal.sourceTaskId}): ${proposal.why}`);
    this.decide(proposal, 'accepted');
  }

  dismiss(proposalId: string): void {
    this.decide(this.pending(proposalId), 'dismissed');
  }

  pack(appId: string): string {
    return this.deps.context.forApp(this.appOf(appId));
  }

  private pending(proposalId: string): MemoryProposal {
    const proposal = this.deps.memory.proposal(proposalId);
    if (!proposal) throw new DomainError(`Unknown proposal ${proposalId}`);
    if (proposal.status !== 'pending') throw new DomainError(`Proposal ${proposalId} is already ${proposal.status}`);
    return proposal;
  }

  private decide(proposal: MemoryProposal, status: 'accepted' | 'dismissed'): void {
    this.deps.memory.saveProposal({ ...proposal, status });
    this.deps.bus.publish({ kind: 'memory-changed', appId: proposal.appId });
  }

  private titleOf(taskId: string): string {
    return this.deps.tasks.get(taskId)?.title ?? taskId;
  }

  private appOf(appId: string): App {
    const app = this.deps.apps.get(appId);
    if (!app) throw new DomainError(`Unknown app ${appId}`);
    return app;
  }
}
