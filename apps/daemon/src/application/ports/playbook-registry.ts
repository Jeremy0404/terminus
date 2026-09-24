import type { LifecycleDefinition } from '../../domain/lifecycle.js';

export interface PlaybookRegistry {
  lifecycle(id: string): LifecycleDefinition;
  lifecycles(): readonly LifecycleDefinition[];
}
