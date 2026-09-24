import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'yaml';

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ALLOWED_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const MAX_LINES = 500;

export function validateSkill(directory: string): string[] {
  const file = join(directory, 'SKILL.md');
  if (!existsSync(file)) return [`${file} is missing`];
  const source = readFileSync(file, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) return [`${file} has no YAML frontmatter`];
  const frontmatter = (parse(match[1] ?? '') ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const name = frontmatter['name'];
  if (typeof name !== 'string' || !NAME.test(name) || name.length > MAX_NAME) errors.push(`${file}: name must be lowercase words joined by single hyphens, at most ${MAX_NAME} characters`);
  if (name !== basename(directory)) errors.push(`${file}: name must match its folder ${basename(directory)}`);
  const description = frontmatter['description'];
  if (typeof description !== 'string' || description.length === 0 || description.length > MAX_DESCRIPTION) errors.push(`${file}: description must be 1 to ${MAX_DESCRIPTION} characters`);
  for (const key of Object.keys(frontmatter)) if (!ALLOWED_KEYS.has(key)) errors.push(`${file}: ${key} is not an Agent Skills frontmatter field`);
  const metadata = frontmatter['metadata'];
  if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null || Object.values(metadata).some((value) => typeof value !== 'string'))) {
    errors.push(`${file}: metadata must map strings to strings`);
  }
  if (source.split('\n').length > MAX_LINES) errors.push(`${file} is longer than ${MAX_LINES} lines`);
  return errors;
}
