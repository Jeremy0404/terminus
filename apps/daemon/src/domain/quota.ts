export interface QuotaWindow {
  readonly kind: string;
  readonly utilization: number;
  readonly resetsAt: string;
}

export interface Quota {
  readonly limited: boolean;
  readonly windows: readonly QuotaWindow[];
  readonly observedAt: string;
}
