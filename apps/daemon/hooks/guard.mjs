#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob']);
const PUSH = /\bgit\b[^;&|]*\bpush\b/;

const input = JSON.parse(readFileSync(0, 'utf8'));
const worktree = process.env.TERMINUS_WORKTREE ?? input.cwd;
const notes = process.env.TERMINUS_NOTES_DIR;
const secrets = (process.env.TERMINUS_SECRET_PATHS ?? '').split(':').filter(Boolean).map(expand);
const tool = input.tool_name;
const toolInput = input.tool_input ?? {};

const block = (reason) => {
  process.stderr.write(`Blocked by Terminus: ${reason}`);
  process.exit(2);
};

const target = toolInput.file_path ?? toolInput.notebook_path ?? toolInput.path;
if (typeof target === 'string') {
  const absolute = resolve(worktree, expand(target));
  if (secrets.some((secret) => inside(absolute, secret))) block(`${target} is a protected secret path.`);
  const writable = inside(absolute, worktree) || (notes !== undefined && inside(absolute, notes));
  if (FILE_TOOLS.has(tool) && !writable) block(`${target} is outside the task worktree ${worktree} and the task notes; only files inside them may be changed.`);
  if (READ_TOOLS.has(tool)) process.exit(0);
}

if (tool === 'Bash' && typeof toolInput.command === 'string') {
  const command = toolInput.command;
  if (PUSH.test(command)) block('pushing is done by Terminus after the verification barriers, never by the agent.');
  const mentioned = secrets.find((secret) => command.includes(secret) || command.includes(secret.replace(homedir(), '~')));
  if (mentioned) block(`the command touches the protected secret path ${mentioned}.`);
}

process.exit(0);

function expand(path) {
  return path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : path;
}

function inside(path, root) {
  const offset = relative(resolve(root), resolve(path));
  return offset === '' || (!offset.startsWith('..') && !isAbsolute(offset));
}
