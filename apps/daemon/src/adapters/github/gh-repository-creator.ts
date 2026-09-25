import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import type { RepositoryCreator, Visibility } from '../../application/ports/repository-creator.js';
import { DomainError } from '../../domain/errors.js';

export class GhRepositoryCreator implements RepositoryCreator {
  constructor(private readonly gh = 'gh') {}

  create(path: string, name: string, visibility: Visibility): void {
    if (existsSync(path) && readdirSync(path).length > 0) throw new DomainError(`${path} already exists and is not empty`);
    mkdirSync(path, { recursive: true });
    run('git', path, ['init', '--quiet', '--initial-branch', 'main']);
    run('git', path, ['commit', '--quiet', '--allow-empty', '--message', 'chore: start the project']);
    try {
      run(this.gh, path, ['repo', 'create', name, `--${visibility}`, '--source', path, '--remote', 'origin', '--push']);
    } catch (error) {
      const stderr = (error as { stderr?: unknown }).stderr;
      throw new DomainError(`GitHub refused to create ${name}: ${typeof stderr === 'string' && stderr.trim() ? stderr.trim() : String(error)}`);
    }
  }
}

function run(command: string, cwd: string, args: readonly string[]): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
