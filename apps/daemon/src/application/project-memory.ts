import { DomainError } from '../domain/errors.js';
import { MAX_DEFINITION_CHARS, MAX_LESSON_CHARS, MAX_TERM_CHARS, memoryText, sameTerm, type Lesson, type Term } from '../domain/memory.js';
import type { App } from '../domain/app.js';
import type { ContextSource } from './context-pack.js';
import type { MemoryRepository } from './ports/memory-repository.js';
import type { AppRepository } from './ports/repositories.js';
import type { Clock, IdGenerator } from './ports/system.js';

export interface MemoryView {
  readonly lessons: readonly Lesson[];
  readonly terms: readonly Term[];
}

export interface ProjectMemoryDeps {
  readonly apps: AppRepository;
  readonly memory: MemoryRepository;
  readonly context: ContextSource;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class ProjectMemory {
  constructor(private readonly deps: ProjectMemoryDeps) {}

  view(appId: string): MemoryView {
    this.appOf(appId);
    return { lessons: this.deps.memory.lessons(appId), terms: this.deps.memory.terms(appId) };
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

  pack(appId: string): string {
    return this.deps.context.forApp(this.appOf(appId));
  }

  private appOf(appId: string): App {
    const app = this.deps.apps.get(appId);
    if (!app) throw new DomainError(`Unknown app ${appId}`);
    return app;
  }
}
