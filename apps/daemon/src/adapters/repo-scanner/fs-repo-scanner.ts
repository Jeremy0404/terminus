import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { RepoScan, RepoScanner } from '../../application/ports/repo-scanner.js';
import type { VerificationCommand } from '../../domain/app.js';

const MAX_TODOS = 30;
const NODE_CHECKS = ['lint', 'typecheck', 'test', 'build'];
const LOCKFILES: readonly [string, string][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['package-lock.json', 'npm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['uv.lock', 'uv'],
  ['poetry.lock', 'poetry'],
  ['Cargo.toml', 'cargo'],
  ['go.mod', 'go'],
];

export class FsRepoScanner implements RepoScanner {
  scan(repoPath: string): RepoScan {
    if (!existsSync(repoPath)) throw new Error(`${repoPath} does not exist`);
    const isGitRepo = tryGit(repoPath, ['rev-parse', '--is-inside-work-tree']) === 'true';
    const packageManager = LOCKFILES.find(([file]) => existsSync(join(repoPath, file)))?.[1] ?? (existsSync(join(repoPath, 'package.json')) ? 'npm' : null);
    return {
      repoPath,
      name: basename(repoPath),
      isGitRepo,
      hasOrigin: isGitRepo && tryGit(repoPath, ['remote', 'get-url', 'origin']) !== null,
      defaultBranch: isGitRepo ? (tryGit(repoPath, ['symbolic-ref', '--short', 'HEAD']) ?? null) : null,
      packageManager,
      ciWorkflows: listFiles(join(repoPath, '.github', 'workflows')).filter((file) => /\.ya?ml$/.test(file)),
      agentDocs: ['CLAUDE.md', 'AGENTS.md', '.cursorrules'].filter((file) => existsSync(join(repoPath, file))),
      suggestedVerification: suggest(repoPath, packageManager),
      todos: isGitRepo ? todos(repoPath) : [],
    };
  }
}

function suggest(repoPath: string, packageManager: string | null): VerificationCommand[] {
  switch (packageManager) {
    case 'pnpm':
    case 'npm':
    case 'yarn':
    case 'bun': {
      const scripts = packageScripts(repoPath);
      return NODE_CHECKS.filter((name) => scripts.includes(name)).map((name) => ({ name, command: `${packageManager} run ${name}` }));
    }
    case 'uv':
    case 'poetry': {
      const pyproject = readText(join(repoPath, 'pyproject.toml'));
      const run = `${packageManager} run`;
      return [
        ...(pyproject.includes('ruff') ? [{ name: 'lint', command: `${run} ruff check` }] : []),
        ...(pyproject.includes('mypy') ? [{ name: 'typecheck', command: `${run} mypy .` }] : []),
        ...(pyproject.includes('pytest') ? [{ name: 'test', command: `${run} pytest` }] : []),
      ];
    }
    case 'cargo':
      return [
        { name: 'lint', command: 'cargo clippy --all-targets -- -D warnings' },
        { name: 'test', command: 'cargo test' },
        { name: 'build', command: 'cargo build' },
      ];
    case 'go':
      return [
        { name: 'lint', command: 'go vet ./...' },
        { name: 'test', command: 'go test ./...' },
        { name: 'build', command: 'go build ./...' },
      ];
    default:
      return [];
  }
}

function packageScripts(repoPath: string): string[] {
  try {
    const manifest = JSON.parse(readText(join(repoPath, 'package.json'))) as { scripts?: Record<string, string> };
    return Object.keys(manifest.scripts ?? {});
  } catch {
    return [];
  }
}

function todos(repoPath: string): RepoScan['todos'] {
  const output = tryGit(repoPath, ['grep', '-n', '-I', '-E', '\\b(TODO|FIXME)\\b', '--', '.', ':(exclude)node_modules', ':(exclude)*.lock']) ?? '';
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .slice(0, MAX_TODOS)
    .map((line) => {
      const [file = '', lineNumber = '0', ...rest] = line.split(':');
      return { file, line: Number(lineNumber), text: rest.join(':').trim() };
    });
}

function listFiles(directory: string): string[] {
  return existsSync(directory) ? readdirSync(directory).sort() : [];
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function tryGit(cwd: string, args: readonly string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
