export type EpicStatus = 'planned' | 'active' | 'delivered';

export interface ProposedStation {
  readonly title: string;
  readonly why: string;
  readonly dependsOn: readonly number[];
}

export interface BreakdownProposal {
  readonly description: string;
  readonly stations: readonly ProposedStation[];
}

export type Breakdown =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly brief: string; readonly runId: string }
  | { readonly status: 'ready'; readonly brief: string; readonly proposal: BreakdownProposal }
  | { readonly status: 'failed'; readonly brief: string; readonly error: string };

export const IDLE_BREAKDOWN: Breakdown = { status: 'idle' };

export interface Epic {
  readonly id: string;
  readonly appId: string;
  readonly code: string;
  readonly name: string;
  readonly status: EpicStatus;
  readonly position: number;
  readonly description: string;
  readonly breakdown: Breakdown;
}
