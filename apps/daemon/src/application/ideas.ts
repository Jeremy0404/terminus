import { DomainError } from '../domain/errors.js';
import { ideaContent, type IdeaContent, type IdeaDraft } from '../domain/idea.js';
import type { App } from '../domain/app.js';
import type { AppFounder } from './app-founder.js';
import type { IdeaRepository } from './ports/idea-repository.js';
import type { AppRepository } from './ports/repositories.js';
import type { Clock, IdGenerator } from './ports/system.js';

export class Ideas {
  constructor(private readonly deps: { readonly ideas: IdeaRepository; readonly apps: AppRepository; readonly founder: AppFounder; readonly clock: Clock; readonly ids: IdGenerator }) {}

  list(): IdeaDraft[] { return this.deps.ideas.list().filter((idea) => idea.appId === null); }

  save(input: IdeaContent, id?: string): IdeaDraft {
    const previous = id ? this.get(id) : null;
    if (previous?.appId) throw new DomainError('This idea already has an app');
    const idea: IdeaDraft = { ...ideaContent(input), id: previous?.id ?? this.deps.ids.next('idea'), appId: null, updatedAt: this.deps.clock.now() };
    this.deps.ideas.save(idea);
    return idea;
  }

  launch(id: string, options: { readonly visibility: 'private' | 'public'; readonly repoPath?: string | undefined }): App {
    const idea = this.get(id);
    if (idea.appId) {
      const app = this.deps.apps.get(idea.appId);
      if (!app) throw new DomainError('The app created from this idea is missing');
      return app;
    }
    if (![idea.name, idea.audience, idea.problem, idea.outcome].every((text) => text.trim())) throw new DomainError('Complete the name, audience, problem and first outcome before creating the app');
    const founded = this.deps.founder.found({ visibility: options.visibility, ...(options.repoPath ? { repoPath: options.repoPath } : {}), name: idea.name, idea: `Public : ${idea.audience}\nProblème : ${idea.problem}\nPremier résultat : ${idea.outcome}` });
    const app: App = { ...founded, product: { purpose: idea.outcome, audience: idea.audience, outOfScope: '', decisions: '', appUrl: '' } };
    this.deps.apps.save(app);
    this.deps.ideas.save({ ...idea, appId: app.id, updatedAt: this.deps.clock.now() });
    return app;
  }

  private get(id: string): IdeaDraft {
    const idea = this.deps.ideas.get(id);
    if (!idea) throw new DomainError(`Unknown idea ${id}`);
    return idea;
  }
}
