import type { LoadedSkill } from "./skill-loader.js";

export interface SkillCatalogEntry {
  id: string;
  description: string;
  skillResourceUri: string;
  referenceResourceUris: string[];
  assetResourceUris: string[];
  promptName: string;
  toolNames: string[];
  _meta: {
    quickdeploy: {
      mode: "instructions";
    };
  };
}

export function normalizeSkills(
  skillOrSkills: LoadedSkill | readonly LoadedSkill[],
): LoadedSkill[] {
  const skills = Array.isArray(skillOrSkills) ? [...skillOrSkills] : [skillOrSkills];
  return skills.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));
}

export function skillResourceUri(skill: LoadedSkill): string {
  return `skill://${skill.frontmatter.name}/SKILL.md`;
}

export function skillReferenceUris(skill: LoadedSkill): string[] {
  return skill.references.map((ref) => `skill://${skill.frontmatter.name}/references/${ref}`);
}

export function skillAssetUris(skill: LoadedSkill): string[] {
  return skill.assets.map((asset) => `skill://${skill.frontmatter.name}/assets/${asset}`);
}

export function skillResourceUris(skill: LoadedSkill): string[] {
  return [skillResourceUri(skill), ...skillReferenceUris(skill), ...skillAssetUris(skill)];
}

export function buildSkillCatalog(
  skillOrSkills: LoadedSkill | readonly LoadedSkill[],
): SkillCatalogEntry[] {
  return normalizeSkills(skillOrSkills).map((skill) => ({
    id: skill.frontmatter.name,
    description: skill.frontmatter.description,
    skillResourceUri: skillResourceUri(skill),
    referenceResourceUris: skillReferenceUris(skill),
    assetResourceUris: skillAssetUris(skill),
    promptName: skill.frontmatter.name,
    toolNames: ["list-prompts", "call-prompt"],
    _meta: {
      quickdeploy: {
        mode: "instructions",
      },
    },
  }));
}
