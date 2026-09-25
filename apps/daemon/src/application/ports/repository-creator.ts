export type Visibility = 'private' | 'public';

export interface RepositoryCreator {
  create(path: string, name: string, visibility: Visibility): void;
}
