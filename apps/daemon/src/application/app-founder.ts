import type { App } from '../domain/app.js';
import { DomainError } from '../domain/errors.js';
import type { Catalog } from './catalog.js';
import type { RepositoryCreator, Visibility } from './ports/repository-creator.js';

export const FOUNDATION_LINE = { code: 'F', name: 'Fondations' } as const;

export interface FoundApp {
  readonly name: string;
  readonly idea: string;
  readonly repoPath?: string;
  readonly visibility: Visibility;
}

export interface AppFounderDeps {
  readonly catalog: Catalog;
  readonly repositories: RepositoryCreator;
  readonly projectsDir: string;
}

export class AppFounder {
  constructor(private readonly deps: AppFounderDeps) {}

  found(input: FoundApp): App {
    const slug = slugOf(input.name);
    if (!slug) throw new DomainError(`"${input.name}" gives no usable repository name`);
    const repoPath = input.repoPath?.trim() || `${this.deps.projectsDir.replace(/\/+$/, '')}/${slug}`;
    this.deps.repositories.create(repoPath, slug, input.visibility);
    const app = this.deps.catalog.createApp({ name: input.name.trim(), repoPath, verification: [] });
    const line = this.deps.catalog.createEpic(app.id, { ...FOUNDATION_LINE, status: 'active', description: input.idea.trim() });
    const framing = this.deps.catalog.createTask(line.id, { title: 'Cadrer l’idée', description: input.idea.trim(), dependsOn: [], autonomy: 'up-to-pr', lifecycleId: 'app-framing' });
    this.deps.catalog.createTask(line.id, { title: 'Choisir la stack et l’architecture', dependsOn: [framing.id], autonomy: 'up-to-pr', lifecycleId: 'app-stack' });
    return app;
  }
}

export function slugOf(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
