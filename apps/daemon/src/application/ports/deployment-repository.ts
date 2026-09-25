import type { Deployment } from '../../domain/release.js';

export interface DeploymentRepository {
  save(deployment: Deployment): void;
  listByApp(appId: string): Deployment[];
}
