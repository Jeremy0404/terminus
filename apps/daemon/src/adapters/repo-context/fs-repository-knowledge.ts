import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RepositoryDecision, RepositoryKnowledge } from '../../application/ports/repository-knowledge.js';

const CONTEXT_FILE = 'CONTEXT.md';
const DECISION_DIRS = ['docs/adr', 'docs/adrs', 'docs/decisions', 'docs/architecture/decisions', 'doc/adr', 'adr', 'decisions'];

export class FsRepositoryKnowledge implements RepositoryKnowledge {
  contextDoc(repoPath: string): string | null {
    const file = join(repoPath, CONTEXT_FILE);
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  }

  decisions(repoPath: string): RepositoryDecision[] {
    return DECISION_DIRS.filter((dir) => isDirectory(join(repoPath, dir))).flatMap((dir) =>
      readdirSync(join(repoPath, dir))
        .filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md' && name.toLowerCase() !== 'index.md')
        .sort()
        .map((name) => ({ path: `${dir}/${name}`, title: titleOf(readFileSync(join(repoPath, dir, name), 'utf8')) ?? name.replace(/\.md$/, '') })),
    );
  }
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function titleOf(markdown: string): string | null {
  const heading = markdown.split('\n').find((line) => line.startsWith('# '));
  return heading ? heading.slice(2).trim() : null;
}
