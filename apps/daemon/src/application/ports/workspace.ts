export interface TaskWorkspace {
  readonly taskId: string;
  readonly path: string;
  readonly branch: string;
}

export interface Workspace {
  prepare(repoPath: string, appId: string, taskId: string, baseRef: string): TaskWorkspace;
  checkpoint(workspace: TaskWorkspace, sequence: number, label: string): string;
  rewind(workspace: TaskWorkspace, checkpointRef: string): void;
  diff(workspace: TaskWorkspace, baseRef: string): string;
  remove(repoPath: string, workspace: TaskWorkspace): void;
}
