export interface TaskWorkspace {
  readonly taskId: string;
  readonly path: string;
  readonly branch: string;
}

export interface SyncResult {
  readonly state: 'up-to-date' | 'merged' | 'conflicts';
  readonly base: string;
  readonly conflicts: readonly string[];
}

export interface Workspace {
  prepare(repoPath: string, appId: string, taskId: string, baseRef: string): TaskWorkspace;
  locate(appId: string, taskId: string): TaskWorkspace;
  checkpoint(workspace: TaskWorkspace, sequence: number, label: string): string;
  rewind(workspace: TaskWorkspace, checkpointRef: string): void;
  diff(workspace: TaskWorkspace, baseRef: string): string;
  syncWithBase(workspace: TaskWorkspace, baseRef: string): SyncResult;
  isBehindBase(workspace: TaskWorkspace, baseRef: string): boolean;
  remove(repoPath: string, workspace: TaskWorkspace): void;
}
