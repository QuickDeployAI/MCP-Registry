import { describe, it, expect } from "vitest";
import { FIELD_ALIASES, NATIVE_TO_INTERNAL, INTERNAL_TO_NATIVES } from "../../introspection/field-aliases.js";

describe("field-aliases", () => {
  it("NATIVE_TO_INTERNAL has correct entries", () => {
    expect(NATIVE_TO_INTERNAL.get("pubDate")).toBe("publishedAt");
    expect(NATIVE_TO_INTERNAL.get("dc:creator")).toBe("author");
    expect(NATIVE_TO_INTERNAL.get("updated")).toBe("updatedAt");
  });

  it("pubDate maps to publishedAt", () => {
    expect(NATIVE_TO_INTERNAL.get("pubDate")).toBe("publishedAt");
  });

  it("dc:creator maps to author", () => {
    expect(NATIVE_TO_INTERNAL.get("dc:creator")).toBe("author");
  });

  it("INTERNAL_TO_NATIVES correctly reverses the map", () => {
    const natives = INTERNAL_TO_NATIVES.get("publishedAt");
    expect(natives).toContain("pubDate");
    const authorNatives = INTERNAL_TO_NATIVES.get("author");
    expect(authorNatives).toContain("dc:creator");
    expect(authorNatives).toContain("author");
  });

  it("FIELD_ALIASES has no duplicate native entries", () => {
    const natives = FIELD_ALIASES.map((a) => a.native);
    const unique = new Set(natives);
    expect(unique.size).toBe(natives.length);
  });
});
