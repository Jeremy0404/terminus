import type { IdeaDraft } from '../../domain/idea.js';

export interface IdeaRepository {
  list(): IdeaDraft[];
  get(id: string): IdeaDraft | null;
  save(idea: IdeaDraft): void;
}
