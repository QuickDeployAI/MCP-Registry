/**
 * ContentStore – offloads large fields (contentText, contentHtml) to disk files
 * and returns resource URIs instead of inlining content in tool responses.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ContentRef {
  type: "content-ref";
  itemId: string;
  field: string;
  resourceUri: string;
  size: number;
}

const CONTENT_RESOURCE_SCHEME = "rss2mcp://content";

export class ContentStore {
  private memoryBlobs = new Map<string, string>();
  private readonly diskMode: boolean;
  private readonly contentDir: string;

  constructor(private readonly storagePath: string | null) {
    this.diskMode = storagePath !== null;
    this.contentDir = storagePath ? join(storagePath, "content") : "";
  }

  private blobKey(itemId: string, field: string): string {
    return `${itemId}-${field}`;
  }

  private resourceUri(itemId: string, field: string): string {
    return `${CONTENT_RESOURCE_SCHEME}/${itemId}/${field}`;
  }

  async store(itemId: string, field: string, content: string): Promise<ContentRef> {
    const key = this.blobKey(itemId, field);
    const size = Buffer.byteLength(content, "utf-8");

    if (this.diskMode) {
      await this.ensureDir();
      const filePath = join(this.contentDir, `${key}.txt`);
      await writeFile(filePath, content, "utf-8");
    } else {
      this.memoryBlobs.set(key, content);
    }

    return {
      type: "content-ref",
      itemId,
      field,
      resourceUri: this.resourceUri(itemId, field),
      size,
    };
  }

  async retrieve(itemId: string, field: string): Promise<string | null> {
    const key = this.blobKey(itemId, field);

    if (this.diskMode) {
      const filePath = join(this.contentDir, `${key}.txt`);
      if (!existsSync(filePath)) return null;
      return readFile(filePath, "utf-8");
    }

    return this.memoryBlobs.get(key) ?? null;
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.contentDir)) {
      await mkdir(this.contentDir, { recursive: true });
    }
  }
}
