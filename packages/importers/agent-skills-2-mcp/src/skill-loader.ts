/**
 * Skill Loader - Reads and parses one or more skill directories.
 *
 * A skill directory contains:
 *   SKILL.md (required)
 *   scripts/ (optional)
 *   references/ (optional)
 *   assets/ (optional)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";

export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
}

export interface LoadedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  skillDir: string;
  scripts: string[];
  references: string[];
  assets: string[];
}

export interface SkillDiagnostic {
  path: string;
  message: string;
}

export interface LoadedSkillCatalog {
  root: string;
  skills: LoadedSkill[];
  diagnostics: SkillDiagnostic[];
}

interface RegistryIndex {
  agents?: Array<{
    skill?: string;
    summary?: string;
  }>;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .filter((file) => fs.statSync(path.join(dir, file)).isFile())
    .map(toPosixPath)
    .sort();
}

function parseSkillMarkdown(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const trimmed = content.trim();

  if (!trimmed.startsWith("---")) {
    throw new Error("SKILL.md must start with YAML frontmatter (---)");
  }

  const endIndex = trimmed.indexOf("---", 3);
  if (endIndex === -1) {
    throw new Error("SKILL.md frontmatter is not closed (missing closing ---)");
  }

  const yamlContent = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 3).trim();
  const frontmatter = parseYaml(yamlContent) as SkillFrontmatter;

  if (!frontmatter?.name || !frontmatter?.description) {
    throw new Error("SKILL.md frontmatter must contain 'name' and 'description'");
  }

  return { frontmatter, body };
}

export function loadSkill(skillDir: string): LoadedSkill {
  const skillMdPath = path.join(skillDir, "SKILL.md");

  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found in ${skillDir}`);
  }

  const content = fs.readFileSync(skillMdPath, "utf-8");
  const { frontmatter, body } = parseSkillMarkdown(content);

  return {
    frontmatter,
    body,
    skillDir,
    scripts: listFiles(path.join(skillDir, "scripts")),
    references: listFiles(path.join(skillDir, "references")),
    assets: listFiles(path.join(skillDir, "assets")),
  };
}

function findSkillDirs(rootDir: string): string[] {
  const skillDirs: string[] = [];

  function visit(dir: string): void {
    if (fs.existsSync(path.join(dir, "SKILL.md"))) {
      skillDirs.push(dir);
      return;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      visit(path.join(dir, entry.name));
    }
  }

  visit(rootDir);
  return skillDirs.sort((a, b) => a.localeCompare(b));
}

export function loadSkills(rootDir: string): LoadedSkill[] {
  const skills = findSkillDirs(rootDir).map(loadSkill);
  const seen = new Set<string>();

  for (const skill of skills) {
    const id = skill.frontmatter.name;
    if (seen.has(id)) {
      throw new Error(`Duplicate skill name: ${id}`);
    }
    seen.add(id);
  }

  return skills.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));
}

function loadSkillSafely(skillDir: string): { skill?: LoadedSkill; diagnostic?: SkillDiagnostic } {
  try {
    return { skill: loadSkill(skillDir) };
  } catch (error) {
    return {
      diagnostic: {
        path: skillDir,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function pushUniqueSkill(
  skills: LoadedSkill[],
  diagnostics: SkillDiagnostic[],
  seenNames: Set<string>,
  skillDir: string,
  skill: LoadedSkill,
): void {
  if (seenNames.has(skill.frontmatter.name)) {
    diagnostics.push({
      path: skillDir,
      message: `Duplicate skill name: ${skill.frontmatter.name}`,
    });
    return;
  }

  seenNames.add(skill.frontmatter.name);
  skills.push(skill);
}

function loadRegistryIndex(indexPath: string): LoadedSkillCatalog {
  const root = path.dirname(indexPath);
  const diagnostics: SkillDiagnostic[] = [];
  const skills: LoadedSkill[] = [];
  const seenNames = new Set<string>();
  const raw = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as RegistryIndex;

  for (const [index, agent] of (raw.agents ?? []).entries()) {
    if (!agent.skill) {
      diagnostics.push({
        path: `${indexPath}#agents[${index}]`,
        message: "Missing agents[].skill path",
      });
      continue;
    }

    const skillDir = path.resolve(root, path.dirname(agent.skill));
    const loaded = loadSkillSafely(skillDir);
    if (loaded.diagnostic) {
      diagnostics.push(loaded.diagnostic);
      continue;
    }
    if (loaded.skill) {
      pushUniqueSkill(skills, diagnostics, seenNames, skillDir, loaded.skill);
    }
  }

  skills.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));
  if (skills.length === 0 && diagnostics.length === 0) {
    diagnostics.push({ path: indexPath, message: "No skills listed in registry index" });
  }

  return { root, skills, diagnostics };
}

export function loadSkillCatalog(inputPath: string): LoadedSkillCatalog {
  const resolved = path.resolve(inputPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Skill catalog path not found: ${inputPath}`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    if (path.extname(resolved).toLowerCase() !== ".json") {
      throw new Error(`Unsupported skill catalog file: ${inputPath}`);
    }
    return loadRegistryIndex(resolved);
  }

  const diagnostics: SkillDiagnostic[] = [];
  const skills: LoadedSkill[] = [];
  const seenNames = new Set<string>();

  for (const skillDir of findSkillDirs(resolved)) {
    const loaded = loadSkillSafely(skillDir);
    if (loaded.diagnostic) {
      diagnostics.push(loaded.diagnostic);
      continue;
    }
    if (loaded.skill) {
      pushUniqueSkill(skills, diagnostics, seenNames, skillDir, loaded.skill);
    }
  }

  skills.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));
  if (skills.length === 0 && diagnostics.length === 0) {
    diagnostics.push({ path: resolved, message: "No SKILL.md files found" });
  }

  return { root: resolved, skills, diagnostics };
}
