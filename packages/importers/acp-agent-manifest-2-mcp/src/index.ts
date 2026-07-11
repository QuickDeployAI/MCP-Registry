import { ImporterConfigError } from "@quickdeployai/importer-core/auth";
import type {
  ArtifactParseResult,
  ArtifactParser,
  ParsedCapability,
} from "@quickdeployai/importer-core/parser";
import {
  ACP_AGENT_MANIFEST_MEDIA_TYPE,
  deriveCapabilityKinds,
  type ArdCapabilityKind,
  type ArdEntry,
} from "@quickdeployai/registry-schemas/ard";
import { inferListingFromManifest } from "@quickdeployai/registry-schemas/inference";
import {
  AgntcyTransportSchema,
  OasfRecordSchema,
  resolveAgntcyTransport,
  type AgntcyTransport,
} from "@quickdeployai/registry-schemas";

type UnknownRecord = Record<string, unknown>;

export type AcpAgentManifestParseResult = ArtifactParseResult<ArdCapabilityKind> & {
  transport: AgntcyTransport;
};

export type AcpAgentManifestParserOptions = {
  transport?: AgntcyTransport;
  skillAllowlist?: readonly string[];
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function declaredSkills(manifest: UnknownRecord): unknown[] {
  if (Array.isArray(manifest.skills)) return manifest.skills;
  const capabilities = asRecord(manifest.capabilities);
  return Array.isArray(capabilities.skills) ? capabilities.skills : [];
}

function skillCapability(skill: unknown): ParsedCapability<ArdCapabilityKind> | undefined {
  if (typeof skill === "string") {
    const name = nonEmptyString(skill);
    return name ? { kind: "skill", name, raw: skill } : undefined;
  }
  const record = asRecord(skill);
  const id = typeof record.id === "number" ? String(record.id) : nonEmptyString(record.id);
  const name = nonEmptyString(record.name) ?? id;
  if (!name) return undefined;
  return {
    kind: "skill",
    name,
    ...(nonEmptyString(record.description)
      ? { description: nonEmptyString(record.description) }
      : {}),
    ...(record.inputSchema !== undefined
      ? { inputSchema: record.inputSchema }
      : record.input_schema !== undefined
        ? { inputSchema: record.input_schema }
        : {}),
    raw: skill,
  };
}

function transportForManifest(manifest: UnknownRecord, agentName: string): AgntcyTransport {
  const declared = AgntcyTransportSchema.safeParse(
    manifest.transport ?? asRecord(manifest.invocation).transport,
  );
  if (declared.success) return declared.data;

  const skills = declaredSkills(manifest).map((skill) => {
    if (typeof skill === "string") return { name: skill };
    const record = asRecord(skill);
    return {
      ...record,
      ...(record.name === undefined && record.id !== undefined
        ? { name: String(record.id) }
        : {}),
    };
  });
  const record = OasfRecordSchema.parse({ ...manifest, name: agentName, skills });
  return resolveAgntcyTransport(record);
}

export async function parseAcpAgentManifest(
  nativeArtifact: unknown,
  entry: ArdEntry,
  options: AcpAgentManifestParserOptions = {},
): Promise<AcpAgentManifestParseResult> {
  const manifest = asRecord(nativeArtifact);
  if (Object.keys(manifest).length === 0) {
    throw new ImporterConfigError("ACP agent-manifest parser expected a JSON object.");
  }

  const inference = inferListingFromManifest("acp", manifest);
  if (!inference.name) {
    throw new ImporterConfigError("ACP agent manifest requires name or agent_id.");
  }
  const transport = options.transport ?? transportForManifest(manifest, inference.name);
  const derived = deriveCapabilityKinds(entry);
  const capabilities: ParsedCapability<ArdCapabilityKind>[] = [];

  if (derived.kinds.includes("agent")) {
    capabilities.push({
      kind: "agent",
      name: inference.name,
      ...(inference.description ? { description: inference.description } : {}),
      raw: nativeArtifact,
    });
  }
  if (derived.kinds.includes("skill")) {
    const seen = new Set<string>();
    const allowlist = options.skillAllowlist ? new Set(options.skillAllowlist) : undefined;
    for (const skill of declaredSkills(manifest)) {
      const capability = skillCapability(skill);
      if (!capability || seen.has(capability.name) || (allowlist && !allowlist.has(capability.name))) {
        continue;
      }
      seen.add(capability.name);
      capabilities.push(capability);
    }
  }

  return {
    capabilities,
    diagnostics: [
      ...derived.unrecognizedHints.map((hint) => ({
        level: "warn" as const,
        message: `Ignoring unrecognized publisher capabilityKinds hint "${hint}" for ${entry.identifier}.`,
      })),
      {
        level: "info",
        message:
          `AGNTCY Agent Connect Protocol transport resolved as "${transport}"; ` +
          "the catalog capability remains agent-shaped and does not use the Zed Agent Client Protocol type.",
      },
    ],
    transport,
  };
}

export function createAcpAgentManifestArtifactParser(
  options: AcpAgentManifestParserOptions = {},
): ArtifactParser<ArdEntry, ArdCapabilityKind> {
  return {
    mediaTypes: [ACP_AGENT_MANIFEST_MEDIA_TYPE],
    parse: (nativeArtifact, entry) => parseAcpAgentManifest(nativeArtifact, entry, options),
  };
}

export const acpAgentManifestArtifactParser = createAcpAgentManifestArtifactParser();
