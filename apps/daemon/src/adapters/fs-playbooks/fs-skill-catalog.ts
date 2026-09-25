import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlaybookSkill, SkillCatalog } from '../../application/ports/skill-catalog.js';

const RESEARCHED = /Researched (\d{4}-\d{2}-\d{2})/;

export class FsSkillCatalog implements SkillCatalog {
  constructor(private readonly root: string) {}

  skills(): PlaybookSkill[] {
    return readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(this.root, entry.name, 'skills')))
      .flatMap((playbook) =>
        readdirSync(join(this.root, playbook.name, 'skills'), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((skill) => {
            const sources = join(this.root, playbook.name, 'skills', skill.name, 'SOURCES.md');
            const researched = existsSync(sources) ? (RESEARCHED.exec(readFileSync(sources, 'utf8'))?.[1] ?? null) : null;
            return { name: skill.name, playbook: playbook.name, researched };
          }),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
