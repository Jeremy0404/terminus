import { DomainError } from './errors.js';

export const MAX_LESSON_CHARS = 600;
export const MAX_TERM_CHARS = 80;
export const MAX_DEFINITION_CHARS = 600;

export interface Lesson {
  readonly id: string;
  readonly appId: string;
  readonly text: string;
  readonly sourceTaskId: string | null;
  readonly createdAt: string;
}

export interface Term {
  readonly id: string;
  readonly appId: string;
  readonly term: string;
  readonly definition: string;
  readonly updatedAt: string;
}

export function memoryText(value: string, max: number, what: string): string {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) throw new DomainError(`The ${what} is empty`);
  if (text.length > max) throw new DomainError(`The ${what} is longer than ${max} characters`);
  return text;
}

export const sameTerm = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
