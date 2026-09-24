import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RepositoryInstructions } from '../../application/ports/repository-instructions.js';

const INSTRUCTION_FILES = ['CLAUDE.md', 'AGENTS.md'];
const MAX_CHARS = 40_000;

export class FsRepositoryInstructions implements RepositoryInstructions {
  localOnly(repoPath: string, worktreePath: string): string {
    return INSTRUCTION_FILES.filter((file) => existsSync(join(repoPath, file)) && !existsSync(join(worktreePath, file)))
      .map((file) => `# Repository instructions (${file}, kept outside git, so absent from your working copy)\n\n${readFileSync(join(repoPath, file), 'utf8').slice(0, MAX_CHARS)}`)
      .join('\n\n');
  }
}
