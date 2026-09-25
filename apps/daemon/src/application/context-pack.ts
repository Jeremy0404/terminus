import type { App } from '../domain/app.js';
import type { MemoryRepository } from './ports/memory-repository.js';
import type { RepositoryKnowledge } from './ports/repository-knowledge.js';

const MAX_TERMS = 80;
const MAX_LESSONS = 40;
const MAX_CONTEXT_CHARS = 8_000;
const MAX_DECISIONS = 60;
const MAX_BRIEF_CHARS = 6_000;
const CUSTOM_STACK = 'custom-';

export interface ContextSource {
  forApp(app: App): string;
}

export class ContextPack implements ContextSource {
  constructor(private readonly deps: { readonly memory: MemoryRepository; readonly knowledge: RepositoryKnowledge }) {}

  forApp(app: App): string {
    const terms = this.deps.memory.terms(app.id).slice(0, MAX_TERMS);
    const lessons = this.deps.memory.lessons(app.id).slice(-MAX_LESSONS);
    const context = this.deps.knowledge.contextDoc(app.repoPath);
    const decisions = this.deps.knowledge.decisions(app.repoPath).slice(0, MAX_DECISIONS);
    const brief = app.brief?.trim();
    const sections = [
      brief ? `## Product brief (approved)\n\n${brief.slice(0, MAX_BRIEF_CHARS)}` : null,
      app.stack
        ? `## Stack and architecture (approved)\n\nStack: ${app.stack.name} (${app.stack.id.startsWith(CUSTOM_STACK) ? 'outside the catalog: follow the decisions below' : `follow the \`${app.stack.id}\` skill`})\n${app.stack.decisions.map((entry) => `- ${entry.title}: ${entry.decision}${entry.why ? ` (${entry.why})` : ''}`).join('\n')}`.trimEnd()
        : null,
      terms.length > 0 ? `## Vocabulary\n\n${terms.map((term) => `- **${term.term}**: ${term.definition}`).join('\n')}` : null,
      lessons.length > 0 ? `## Lessons from earlier tasks\n\n${lessons.map((lesson) => `- ${lesson.text}`).join('\n')}` : null,
      context ? `## CONTEXT.md from the repository\n\n${context.trim().slice(0, MAX_CONTEXT_CHARS)}` : null,
      decisions.length > 0
        ? `## Architecture decisions in the repository (read the file before going against one)\n\n${decisions.map((decision) => `- ${decision.path}: ${decision.title}`).join('\n')}`
        : null,
    ].filter((section): section is string => section !== null);
    if (sections.length === 0) return '';
    return [`# Project memory (kept in Terminus for ${app.name})`, ...sections].join('\n\n');
  }
}
