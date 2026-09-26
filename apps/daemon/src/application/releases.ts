import { DomainError } from '../domain/errors.js';
import { followRun, serverChecklistPending, type Deployment, type ReleaseState } from '../domain/release.js';
import type { ChecksState, CodeHost } from './ports/code-host.js';
import type { DeployNotifier } from './ports/deploy-notifier.js';
import type { DeployTarget } from './ports/deploy-target.js';
import type { DeploymentRepository } from './ports/deployment-repository.js';
import type { AppRepository, TaskRepository } from './ports/repositories.js';
import type { Clock, IdGenerator } from './ports/system.js';

const FRESH_FOR_MS = 30_000;
const HISTORY = 5;

type ReleaseChecks = ChecksState | 'unavailable' | null;

export interface ReleaseView extends ReleaseState {
  readonly checks: ReleaseChecks;
  readonly deployments: readonly Deployment[];
  readonly serverChecklistPending: boolean;
}

interface Snapshot {
  readonly at: number;
  readonly state: ReleaseState | null;
  readonly checks: ReleaseChecks;
}

export interface ReleasesDeps {
  readonly apps: AppRepository;
  readonly tasks: Pick<TaskRepository, 'listByApp'>;
  readonly target: DeployTarget;
  readonly codeHost: Pick<CodeHost, 'checks' | 'merge'>;
  readonly deployments: DeploymentRepository;
  readonly notifier: DeployNotifier;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class Releases {
  private readonly cache = new Map<string, Snapshot>();

  constructor(private readonly deps: ReleasesDeps) {}

  state(appId: string, fresh = false): ReleaseView | null {
    const app = this.appOf(appId);
    const now = Date.parse(this.deps.clock.now());
    const cached = this.cache.get(appId);
    const { state, checks } = !fresh && cached && now - cached.at < FRESH_FOR_MS ? cached : this.load(appId, app.repoPath, now);
    if (!state) return null;
    return { ...state, checks, deployments: this.follow(app.name, appId, state), serverChecklistPending: serverChecklistPending(this.deps.tasks.listByApp(appId)) };
  }

  deploy(appId: string, version: string): Deployment {
    const app = this.appOf(appId);
    if (serverChecklistPending(this.deps.tasks.listByApp(appId))) throw new DomainError(`${app.name} waits for its server checklist: confirm it in the production station first`);
    const { state, checks } = this.load(appId, app.repoPath, Date.parse(this.deps.clock.now()));
    const pending = state?.pending;
    if (!pending) throw new DomainError(`${app.name} has no release waiting to ship`);
    if (pending.version !== version) throw new DomainError(`The release waiting is now v${pending.version ?? '?'}, not v${version}: reload and check it again`);
    if (checks !== 'success' && checks !== 'none') throw new DomainError(`CI on the release pull request #${pending.number} is ${checks ?? 'unavailable'}`);
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
          if (followed.state === 'succeeded') this.deps.notifier.notify(state.deploysOnRelease && state.lastRun?.deploymentVerified ? `✅ ${appName} v${followed.version} est en production` : `✅ ${appName} v${followed.version} est publiée`);
          if (followed.state === 'failed') this.deps.notifier.notify(`❌ ${appName} v${followed.version} : le déploiement a échoué ${followed.runUrl ?? ''}`.trim());
        }
        return followed;
      });
  }

  private load(appId: string, repoPath: string, now: number): Snapshot {
    const state = this.deps.target.state(repoPath);
    const snapshot = { at: now, state, checks: state?.pending ? this.checksOf(repoPath, state.pending.number) : null };
    this.cache.set(appId, snapshot);
    return snapshot;
  }

  private checksOf(repoPath: string, pullRequest: number): ReleaseChecks {
    try {
      return this.deps.codeHost.checks(repoPath, pullRequest);
    } catch {
      return 'unavailable';
    }
  }

  private appOf(appId: string) {
    const app = this.deps.apps.get(appId);
    if (!app) throw new DomainError(`Unknown app ${appId}`);
    return app;
  }
}
