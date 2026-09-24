import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

export interface AgentProfileFile {
  readonly skills?: readonly string[];
  readonly mcpServers?: Record<string, unknown>;
}

export interface BuiltAgentHome {
  readonly skills: string[];
  readonly mcpServers: Record<string, unknown> | null;
}

export class AgentProfileError extends Error {
  override readonly name = 'AgentProfileError';
}

export function readAgentProfile(path: string): AgentProfileFile {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new AgentProfileError(`${path} must contain a JSON object`);
  const { skills, mcpServers } = parsed as Record<string, unknown>;
  if (skills !== undefined && (!Array.isArray(skills) || skills.some((skill) => typeof skill !== 'string'))) throw new AgentProfileError(`${path}: skills must be a list of skill folder paths`);
  if (mcpServers !== undefined && (typeof mcpServers !== 'object' || mcpServers === null || Array.isArray(mcpServers))) throw new AgentProfileError(`${path}: mcpServers must map server names to their configuration`);
  return parsed as AgentProfileFile;
}

export function buildAgentHome(agentHome: string, playbooksDir: string, profile: AgentProfileFile): BuiltAgentHome {
  const target = join(agentHome, 'skills');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const installed = new Set<string>();
  const install = (source: string, origin: string): void => {
    const name = basename(source);
    if (!existsSync(join(source, 'SKILL.md'))) throw new AgentProfileError(`${origin}: ${source} has no SKILL.md`);
    if (installed.has(name)) throw new AgentProfileError(`${origin}: a skill named ${name} is already part of the agent profile`);
    cpSync(source, join(target, name), { recursive: true });
    installed.add(name);
  };
  for (const lifecycle of readdirSync(playbooksDir)) {
    const skills = join(playbooksDir, lifecycle, 'skills');
    if (!existsSync(skills)) continue;
    for (const entry of readdirSync(skills, { withFileTypes: true })) if (entry.isDirectory()) install(join(skills, entry.name), `playbook ${lifecycle}`);
  }
  for (const path of profile.skills ?? []) install(resolve(path.startsWith('~/') ? join(homedir(), path.slice(2)) : path), 'agent profile');
  return { skills: [...installed].sort(), mcpServers: profile.mcpServers && Object.keys(profile.mcpServers).length > 0 ? profile.mcpServers : null };
}
