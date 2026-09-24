import type { Quota } from '../../domain/quota.js';

export interface QuotaStore {
  save(quota: Quota): void;
  latest(): Quota | null;
}
