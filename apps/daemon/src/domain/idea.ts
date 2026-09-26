import { DomainError } from './errors.js';

export interface IdeaContent {
  readonly name: string;
  readonly audience: string;
  readonly problem: string;
  readonly outcome: string;
}

export interface IdeaDraft extends IdeaContent {
  readonly id: string;
  readonly appId: string | null;
  readonly updatedAt: string;
}

export function ideaContent(input: IdeaContent): IdeaContent {
  const content = { name: input.name.trim(), audience: input.audience.trim(), problem: input.problem.trim(), outcome: input.outcome.trim() };
  if (content.name.length > 80 || [content.audience, content.problem, content.outcome].some((text) => text.length > 1200)) throw new DomainError('Idea fields exceed their size limit');
  return content;
}
