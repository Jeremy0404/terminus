export interface Checkpoint {
  readonly sequence: number;
  readonly phaseIndex: number;
  readonly ref: string;
  readonly sessionId: string | null;
  readonly takenAt: string;
}
