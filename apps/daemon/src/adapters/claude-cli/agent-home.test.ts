import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentProfileError, buildAgentHome, readAgentProfile } from './agent-home.js';

let root: string;
const skill = (folder: string): string => {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'SKILL.md'), '---\nname: x\ndescription: x\n---\n');
  return folder;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'terminus-agent-home-'));
  skill(join(root, 'playbooks', 'task', 'skills', 'spec'));
  skill(join(root, 'playbooks', 'task', 'skills', 'plan'));
  mkdirSync(join(root, 'playbooks', 'epic'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('buildAgentHome', () => {
  it('installs the playbook skills plus the allowed personal ones, and drops stale skills', () => {
    const home = join(root, 'agent-home');
    skill(join(home, 'skills', 'stale'));
    const graphify = skill(join(root, 'personal', 'graphify'));

    const built = buildAgentHome(home, join(root, 'playbooks'), { skills: [graphify], mcpServers: { graph: { command: 'g' } } });

    expect(built).toEqual({ skills: ['graphify', 'plan', 'spec'], mcpServers: { graph: { command: 'g' } } });
    expect(readdirSync(join(home, 'skills')).sort()).toEqual(['graphify', 'plan', 'spec']);
    expect(existsSync(join(home, 'skills', 'stale'))).toBe(false);
  });

  it('refuses a personal skill that would shadow a playbook skill, or a folder without SKILL.md', () => {
    const home = join(root, 'agent-home');
    expect(() => buildAgentHome(home, join(root, 'playbooks'), { skills: [skill(join(root, 'personal', 'plan'))] })).toThrow(AgentProfileError);
    mkdirSync(join(root, 'empty'));
    expect(() => buildAgentHome(home, join(root, 'playbooks'), { skills: [join(root, 'empty')] })).toThrow(/has no SKILL.md/);
  });

  it('reports no MCP servers when none are allowed', () => {
    expect(buildAgentHome(join(root, 'agent-home'), join(root, 'playbooks'), {}).mcpServers).toBeNull();
  });
});

describe('readAgentProfile', () => {
  it('reads an optional profile file and rejects malformed ones', () => {
    expect(readAgentProfile(join(root, 'missing.json'))).toEqual({});
    writeFileSync(join(root, 'agent.json'), JSON.stringify({ skills: ['~/.claude/skills/graphify'] }));
    expect(readAgentProfile(join(root, 'agent.json'))).toEqual({ skills: ['~/.claude/skills/graphify'] });
    writeFileSync(join(root, 'bad.json'), JSON.stringify({ skills: 'graphify' }));
    expect(() => readAgentProfile(join(root, 'bad.json'))).toThrow(AgentProfileError);
  });
});
