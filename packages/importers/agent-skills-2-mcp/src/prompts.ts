/**
 * Prompts — Registers SKILL.md body as an MCP prompt.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { LoadedSkill } from "./skill-loader.js";
import { normalizeSkills, skillResourceUris } from "./catalog.js";

export function registerPrompts(
  server: Server,
  skillOrSkills: LoadedSkill | readonly LoadedSkill[],
): void {
  const skills = normalizeSkills(skillOrSkills);

  server.setRequestHandler({ method: "prompts/list" } as any, async () => ({
    prompts: skills.map((skill) => ({
      name: skill.frontmatter.name,
      description: skill.frontmatter.description,
    })),
  }));

  server.setRequestHandler({ method: "prompts/get" } as any, async (request: any) => {
    const promptName = request.params?.name;
    const skill = skills.find((candidate) => candidate.frontmatter.name === promptName);

    if (!skill) {
      throw new Error(`Unknown prompt: ${promptName}`);
    }

    return {
      description: skill.frontmatter.description,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: skill.body,
          },
        },
      ],
      _meta: {
        quickdeploy: {
          resources: skillResourceUris(skill),
        },
      },
    };
  });
}
