import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import type { PlaybookRegistry } from '../../application/ports/playbook-registry.js';
import type { LifecycleDefinition, PhaseDefinition } from '../../domain/lifecycle.js';
import { LifecycleFileSchema } from './lifecycle-schema.js';
import { validateSkill } from './skill-validator.js';

const LIFECYCLE_FILE = 'lifecycle.yaml';
const VERSION_LENGTH = 12;

export class PlaybookError extends Error {
  override readonly name = 'PlaybookError';
}

export class FsPlaybookRegistry implements PlaybookRegistry {
  private readonly byId: ReadonlyMap<string, LifecycleDefinition>;

  constructor(root: string) {
    const folders = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const skills = new Map(
      folders.flatMap((folder) => {
        const skillsDir = join(root, folder.name, 'skills');
        return existsSync(skillsDir) ? readdirSync(skillsDir).map((name): [string, string] => [name, join(skillsDir, name)]) : [];
      }),
    );
    const lifecycles = folders.map((entry) => loadLifecycle(join(root, entry.name), entry.name, skills));
    this.byId = new Map(lifecycles.map((lifecycle) => [lifecycle.id, lifecycle]));
  }

  lifecycle(id: string): LifecycleDefinition {
    const lifecycle = this.byId.get(id);
    if (!lifecycle) throw new PlaybookError(`No playbook defines the ${id} lifecycle`);
    return lifecycle;
  }

  lifecycles(): readonly LifecycleDefinition[] {
    return [...this.byId.values()];
  }
}

function loadLifecycle(directory: string, folderName: string, skills: ReadonlyMap<string, string>): LifecycleDefinition {
  const path = join(directory, LIFECYCLE_FILE);
  const source = readFileSync(path, 'utf8');
  const result = LifecycleFileSchema.safeParse(parse(source));
  if (!result.success) throw new PlaybookError(`${path} is invalid:\n${z.prettifyError(result.error)}`);
  if (result.data.id !== folderName) throw new PlaybookError(`${path} declares id ${result.data.id}, expected ${folderName}`);
  const skillErrors = result.data.phases.flatMap((phase) => (phase.skill ? validateSkill(skills.get(phase.skill) ?? join(directory, 'skills', phase.skill)) : []));
  if (skillErrors.length > 0) throw new PlaybookError(`Playbook ${folderName} has invalid skills:\n${skillErrors.join('\n')}`);
  return {
    id: result.data.id,
    version: createHash('sha256').update(source).digest('hex').slice(0, VERSION_LENGTH),
    phases: result.data.phases.map(toPhase),
  };
}

function toPhase(phase: z.infer<typeof LifecycleFileSchema>['phases'][number]): PhaseDefinition {
  return {
    id: phase.id,
    ...(phase.gate ? { gate: phase.gate } : {}),
    ...(phase.skill ? { skill: phase.skill } : {}),
    ...(phase.model ? { model: phase.model } : {}),
    ...(phase.effort ? { effort: phase.effort } : {}),
    ...(phase.output ? { output: phase.output } : {}),
    ...(phase.executor ? { executor: phase.executor } : {}),
    ...(phase.retryFrom ? { retryFrom: phase.retryFrom } : {}),
    ...(phase.tracks ? { tracks: phase.tracks } : {}),
    ...(phase.skippable ? { skippable: phase.skippable } : {}),
  };
}
