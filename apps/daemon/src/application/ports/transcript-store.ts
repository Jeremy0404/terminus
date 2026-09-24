export interface TranscriptStore {
  append(runId: string, event: unknown): void;
  read(runId: string): unknown[];
}
