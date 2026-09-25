import { DomainError } from '../domain/errors.js';
import type { ReleaseState } from '../domain/release.js';
import type { DeployTarget } from './ports/deploy-target.js';
import type { AppRepository } from './ports/repositories.js';
import type { Clock } from './ports/system.js';

const FRESH_FOR_MS = 30_000;

export class Releases {
  private readonly cache = new Map<string, { readonly at: number; readonly state: ReleaseState | null }>();

  constructor(private readonly deps: { readonly apps: AppRepository; readonly target: DeployTarget; readonly clock: Clock }) {}

  state(appId: string, fresh = false): ReleaseState | null {
    const app = this.deps.apps.get(appId);
    if (!app) throw new DomainError(`Unknown app ${appId}`);
    const now = Date.parse(this.deps.clock.now());
    const cached = this.cache.get(appId);
    if (!fresh && cached && now - cached.at < FRESH_FOR_MS) return cached.state;
    const state = this.deps.target.state(app.repoPath);
    this.cache.set(appId, { at: now, state });
    return state;
  }
}
