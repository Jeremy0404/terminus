export type EpicStatus = 'planned' | 'active' | 'delivered';

export interface Epic {
  readonly id: string;
  readonly appId: string;
  readonly code: string;
  readonly name: string;
  readonly status: EpicStatus;
  readonly position: number;
}
