export interface PlaybookSkill {
  readonly name: string;
  readonly playbook: string;
  readonly researched: string | null;
}

export interface SkillCatalog {
  skills(): PlaybookSkill[];
}
