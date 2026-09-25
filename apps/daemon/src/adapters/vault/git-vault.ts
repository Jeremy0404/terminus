import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import type { Vault, VaultNote } from '../../application/ports/vault.js';

export class GitVault implements Vault {
  constructor(private readonly root: string) {}

  read(path: string): string | null {
    const file = this.resolve(path);
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  }

  list(directory: string): string[] {
    const folder = this.resolve(directory);
    return existsSync(folder) ? readdirSync(folder).map((name) => `${directory}/${name}`) : [];
  }

  write(notes: readonly VaultNote[], message: string): void {
    for (const note of notes) {
      const file = this.resolve(note.path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, note.content);
    }
    if (!existsSync(join(this.root, '.git')) || notes.length === 0) return;
    const paths = notes.map((note) => note.path);
    this.git(['add', '--', ...paths]);
    if (this.git(['diff', '--cached', '--name-only', '--', ...paths]).trim() === '') return;
    this.git(['commit', '--quiet', '-m', message, '--', ...paths]);
  }

  private resolve(path: string): string {
    const relative = normalize(path);
    if (relative.startsWith('..') || relative.startsWith('/')) throw new Error(`Vault path escapes the vault: ${path}`);
    return join(this.root, relative);
  }

  private git(args: readonly string[]): string {
    return execFileSync('git', ['-C', this.root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  }
}
