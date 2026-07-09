/**
 * Resources — Registers references/ and assets/ files as MCP resources.
 *
 * URI scheme: skill://{skill-name}/{dir}/{filename}
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { LoadedSkill } from "./skill-loader.js";
import {
  buildSkillCatalog,
  normalizeSkills,
  skillAssetUris,
  skillReferenceUris,
  skillResourceUri,
} from "./catalog.js";

interface SkillResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  filePath: string;
}

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".yaml": "application/x-yaml",
    ".yml": "application/x-yaml",
    ".py": "text/x-python",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".sh": "text/x-shellscript",
    ".html": "text/html",
    ".css": "text/css",
    ".csv": "text/csv",
    ".xml": "application/xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}

export function registerResources(
  server: Server,
  skillOrSkills: LoadedSkill | readonly LoadedSkill[],
): void {
  const skills = normalizeSkills(skillOrSkills);
  const catalog = buildSkillCatalog(skills);
  const resources: SkillResource[] = [
    {
      uri: "skill://index.json",
      name: "index.json",
      description: "Skill catalog index",
      mimeType: "application/json",
      filePath: "",
    },
  ];

  for (const skill of skills) {
    resources.push({
      uri: skillResourceUri(skill),
      name: "SKILL.md",
      description: `Skill body: ${skill.frontmatter.name}`,
      mimeType: "text/markdown",
      filePath: path.join(skill.skillDir, "SKILL.md"),
    });

    for (const [index, ref] of skill.references.entries()) {
      resources.push({
        uri: skillReferenceUris(skill)[index]!,
        name: ref,
        description: `Reference file: ${ref}`,
        mimeType: guessMimeType(ref),
        filePath: path.join(skill.skillDir, "references", ref),
      });
    }

    for (const [index, asset] of skill.assets.entries()) {
      resources.push({
        uri: skillAssetUris(skill)[index]!,
        name: asset,
        description: `Asset file: ${asset}`,
        mimeType: guessMimeType(asset),
        filePath: path.join(skill.skillDir, "assets", asset),
      });
    }
  }

  server.setRequestHandler({ method: "resources/list" } as any, async () => ({
    resources: resources.map(({ filePath, ...r }) => r),
  }));

  server.setRequestHandler({ method: "resources/read" } as any, async (request: any) => {
    const uri = request.params?.uri;
    const resource = resources.find((r) => r.uri === uri);

    if (!resource) {
      throw new Error(`Unknown resource: ${uri}`);
    }

    if (resource.uri === "skill://index.json") {
      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: JSON.stringify(catalog, null, 2),
          },
        ],
      };
    }

    if (!fs.existsSync(resource.filePath)) {
      throw new Error(`Resource file not found: ${resource.filePath}`);
    }

    const isText =
      resource.mimeType.startsWith("text/") ||
      resource.mimeType === "application/json" ||
      resource.mimeType === "application/x-yaml" ||
      resource.mimeType === "application/xml";

    if (isText) {
      const content = fs.readFileSync(resource.filePath, "utf-8");
      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: content,
          },
        ],
      };
    }

    // Binary content as base64
    const content = fs.readFileSync(resource.filePath);
    return {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.mimeType,
          blob: content.toString("base64"),
        },
      ],
    };
  });
}
