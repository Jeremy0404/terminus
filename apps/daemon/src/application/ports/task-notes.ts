export interface TaskNotes {
  directoryFor(taskId: string): string;
  read(taskId: string, file: string): string | null;
}
