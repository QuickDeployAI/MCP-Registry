import { z } from "zod";

export type JsonSchemaLike = {
  type?: string;
  enum?: unknown[];
  description?: string;
  items?: JsonSchemaLike;
  properties?: Record<string, JsonSchemaLike>;
  required?: string[];
};

export function schemaToZod(schema: JsonSchemaLike, required = false): z.ZodTypeAny {
  let t: z.ZodTypeAny;

  if (schema.enum) {
    const vals = schema.enum;
    t = vals.length >= 2 && vals.every((v) => typeof v === "string")
      ? z.enum(vals as [string, ...string[]])
      : z.unknown();
  } else {
    switch (schema.type) {
      case "string":
        t = z.string();
        break;
      case "integer":
      case "number":
        t = z.number();
        break;
      case "boolean":
        t = z.boolean();
        break;
      case "array":
        t = z.array(schemaToZod(schema.items ?? {}, true));
        break;
      case "object":
        t = z.object(
          Object.fromEntries(
            Object.entries(schema.properties ?? {}).map(([k, v]) => [
              k,
              schemaToZod(v, (schema.required ?? []).includes(k)),
            ]),
          ),
        );
        break;
      default:
        t = z.unknown();
        break;
    }
  }

  if (schema.description) t = t.describe(schema.description);
  return required ? t : t.optional();
}
