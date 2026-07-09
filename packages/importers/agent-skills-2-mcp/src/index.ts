/**
 * Agent Skills to MCP importer — Main Entry Point
 *
 * A stdio MCP server that reads one or more skills — from a local
 * directory, a git URL (shallow clone, pinned ref), or an agent-skills
 * registry index URL — and exposes:
 *   - Prompts: SKILL.md body as a named prompt
 *   - Tools: Explicitly allowlisted scripts in scripts/ as callable tools
 *   - Resources: Each file in references/ and assets/ as an MCP resource
 *
 * Usage: node dist/index.js <source> [ref]
 *   <source>  Local path, git+https(s):// URL, or http(s):// registry index URL
 *   [ref]     Branch, tag, or commit SHA (git sources only; defaults to HEAD)
 *
 * Scripts are disabled by default. Set SKILLS_MCP_SCRIPT_ALLOWLIST to a
 * comma-separated list of script filenames, basenames, or tool names.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadSkillCatalog } from "./skill-loader.js";
import { parseSkillSourceArg, resolveSkillSource } from "./source.js";
import { registerPrompts } from "./prompts.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";

const sourceArg = process.argv[2];
const refArg = process.argv[3];

if (!sourceArg) {
  console.error("Usage: agent-skills-2-mcp <source> [ref]");
  console.error("  <source>  Local path, git+https(s):// URL, or http(s):// registry index URL");
  console.error("  [ref]     Branch, tag, or commit SHA (git sources only)");
  process.exit(1);
}

async function main() {
  const spec = parseSkillSourceArg(sourceArg, refArg);
  console.error(`[agent-skills-2-mcp] Resolving ${spec.type} source: ${spec.uri}`);

  const resolved = await resolveSkillSource(spec);
  console.error(
    `[agent-skills-2-mcp] Loading skills from: ${resolved.path}` +
      (resolved.resolvedRef ? ` @ ${resolved.resolvedRef}` : "") +
      (resolved.refreshed ? " (refreshed)" : " (cached)"),
  );

  const catalog = loadSkillCatalog(resolved.path);
  for (const diagnostic of catalog.diagnostics) {
    console.error(`[agent-skills-2-mcp]   skipped ${diagnostic.path}: ${diagnostic.message}`);
  }

  const skills = catalog.skills;
  if (skills.length === 0) {
    console.error("[agent-skills-2-mcp] No loadable skills found");
    process.exit(1);
  }

  const skillNames = skills.map((skill) => skill.frontmatter.name).join(", ");

  console.error(`[agent-skills-2-mcp] Loaded skills: ${skillNames}`);
  console.error(
    `[agent-skills-2-mcp]   Scripts: ${skills.reduce((count, skill) => count + skill.scripts.length, 0)}`,
  );
  console.error(
    `[agent-skills-2-mcp]   References: ${skills.reduce((count, skill) => count + skill.references.length, 0)}`,
  );
  console.error(
    `[agent-skills-2-mcp]   Assets: ${skills.reduce((count, skill) => count + skill.assets.length, 0)}`,
  );

  const server = new Server(
    {
      name: skills.length === 1 ? `skill-${skills[0]!.frontmatter.name}` : "agent-skills-2-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        prompts: {},
        tools: {},
        resources: {},
      },
    },
  );

  // Register all MCP capabilities
  registerPrompts(server, skills);
  registerTools(server, skills);
  registerResources(server, skills);

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[agent-skills-2-mcp] Server started for ${skills.length} skill(s)`);
}

main().catch((err) => {
  console.error("[agent-skills-2-mcp] Fatal error:", err);
  process.exit(1);
});
