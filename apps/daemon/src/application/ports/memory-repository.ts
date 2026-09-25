import type { Lesson, MemoryProposal, Term } from '../../domain/memory.js';

export interface MemoryRepository {
  lessons(appId: string): Lesson[];
  saveLesson(lesson: Lesson): void;
  removeLesson(id: string): boolean;
  terms(appId: string): Term[];
  saveTerm(term: Term): void;
  removeTerm(id: string): boolean;
  pendingProposals(appId: string): MemoryProposal[];
  proposal(id: string): MemoryProposal | null;
  saveProposal(proposal: MemoryProposal): void;
}
