import { DomainError } from '../domain/errors.js';
import { followRun, type Deployment, type ReleaseState } from '../domain/release.js';
import type { CodeHost } from './ports/code-host.js';
import type { DeployNotifier } from './ports/deploy-notifier.js';
import type { DeployTarget } from './ports/deploy-target.js';
import type { DeploymentRepository } from './ports/deployment-repository.js';
import type { AppRepository } from './ports/repositories.js';
import type { Clock, IdGenerator } from './ports/system.js';

const FRESH_FOR_MS = 30_000;
const HISTORY = 5;

export interface ReleaseView extends ReleaseState {
  readonly deployments: readonly Deployment[];
}

export interface ReleasesDeps {
  readonly apps: AppRepository;
  readonly target: DeployTarget;
  readonly codeHost: Pick<CodeHost, 'checks' | 'merge'>;
  readonly deployments: DeploymentRepository;
  readonly notifier: DeployNotifier;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class Releases {
  private readonly cache = new Map<string, { readonly at: number; readonly state: ReleaseState | null }>();

  constructor(private readonly deps: ReleasesDeps) {}

  state(appId: string, fresh = false): ReleaseView | null {
    const app = this.appOf(appId);
    const now = Date.parse(this.deps.clock.now());
    const cached = this.cache.get(appId);
    const state = !fresh && cached && now - cached.at < FRESH_FOR_MS ? cached.state : this.load(appId, app.repoPath, now);
    if (!state) return null;
    return { ...state, deployments: this.follow(app.name, appId, state) };
  }

  deploy(appId: string, version: string): Deployment {
    const app = this.appOf(appId);
    const state = this.load(appId, app.repoPath, Date.parse(this.deps.clock.now()));
    const pending = state?.pending;
    if (!pending) throw new DomainError(`${app.name} has no release waiting to ship`);
    if (pending.version !== version) throw new DomainError(`The release waiting is now v${pending.version ?? '?'}, not v${version}: reload and check it again`);
    const checks = this.deps.codeHost.checks(app.repoPath, pending.number);
    if (checks === 'pending' || checks === 'failure') throw new DomainError(`CI on the release pull request #${pending.number} is ${checks}`);
    this.deps.codeHost.merge(app.repoPath, pending.number);
    const deployment: Deployment = {
      id: this.deps.ids.next('deploy'),
      appId,
      version,
      pullRequest: pending.number,
      requestedAt: this.deps.clock.now(),
      state: 'requested',
      runUrl: null,
      finishedAt: null,
    };
    this.deps.deployments.save(deployment);
    this.cache.delete(appId);
    this.deps.notifier.notify(`🚀 ${app.name} v${version} : déploiement lancé depuis Terminus`);
    return deployment;
  }

  private follow(appName: string, appId: string, state: ReleaseState): Deployment[] {
    return this.deps.deployments
      .listByApp(appId)
      .slice(0, HISTORY)
      .map((deployment) => {
        const followed = followRun(deployment, state.lastRun, this.deps.clock.now());
        if (followed.state !== deployment.state) {
          this.deps.deployments.save(followed);
          if (followed.state === 'succeeded') this.deps.notifier.notify(`✅ ${appName} v${followed.version} est en production`);
          if (followed.state === 'failed') this.deps.notifier.notify(`❌ ${appName} v${followed.version} : le déploiement a échoué ${followed.runUrl ?? ''}`.trim());
        }
        return followed;
      });
  }

  private load(appId: string, repoPath: string, now: number): ReleaseState | null {
    const state = this.deps.target.state(repoPath);
    this.cache.set(appId, { at: now, state });
    return state;
  }

  private appOf(appId: string) {
    const app = this.deps.apps.get(appId);
    if (!app) throw new DomainError(`Unknown app ${appId}`);
    return app;
  }
}
