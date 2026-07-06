import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean relevant env vars before each test
    delete process.env.RSS_FEED;
    delete process.env.FEED;
    delete process.env.POLL_INTERVAL;
    delete process.env.NO_POLL;
    delete process.env.MAX_ITEMS;
    delete process.env.MAX_QUERY_RESULTS;
    delete process.env.MAX_FIELD_SIZE;
    delete process.env.STORAGE_BACKEND;
    delete process.env.STORAGE_PATH;
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  it("returns defaults when no args or env are set", () => {
    const config = loadConfig([]);
    expect(config.defaultFeed).toBeNull();
    expect(config.pollIntervalMs).toBe(0);
    expect(config.pollingEnabled).toBe(false);
    expect(config.maxItems).toBe(5000);
    expect(config.maxQueryResults).toBe(50);
    expect(config.maxFieldSize).toBe(500);
    expect(config.storageBackend).toBe("memory");
    expect(config.storagePath).toBe("./rss2mcp-data");
    expect(config.embeddingProvider).toBe("none");
    expect(config.openaiApiKey).toBeNull();
  });

  it("reads defaultFeed from --feed arg", () => {
    const config = loadConfig(["--feed", "https://example.com/feed.rss"]);
    expect(config.defaultFeed).toBe("https://example.com/feed.rss");
  });

  it("reads defaultFeed from RSS_FEED env", () => {
    process.env.RSS_FEED = "https://env.example.com/rss";
    const config = loadConfig([]);
    expect(config.defaultFeed).toBe("https://env.example.com/rss");
  });

  it("enables polling when --poll-interval is provided", () => {
    const config = loadConfig(["--poll-interval", "60000"]);
    expect(config.pollIntervalMs).toBe(60000);
    expect(config.pollingEnabled).toBe(true);
  });

  it("disables polling when --no-poll is set even with interval", () => {
    const config = loadConfig(["--poll-interval", "60000", "--no-poll"]);
    expect(config.pollingEnabled).toBe(false);
  });

  it("reads max-items from CLI arg", () => {
    const config = loadConfig(["--max-items", "1000"]);
    expect(config.maxItems).toBe(1000);
  });

  it("reads storage backend from --storage arg", () => {
    const config = loadConfig(["--storage", "file"]);
    expect(config.storageBackend).toBe("file");
  });

  it("reads storage path from --storage-path arg", () => {
    const config = loadConfig(["--storage-path", "/tmp/test-data"]);
    expect(config.storagePath).toBe("/tmp/test-data");
  });

  it("reads embedding provider from --embedding arg", () => {
    const config = loadConfig(["--embedding", "openai", "--openai-api-key", "sk-test"]);
    expect(config.embeddingProvider).toBe("openai");
    expect(config.openaiApiKey).toBe("sk-test");
  });

  it("reads openai api key from OPENAI_API_KEY env", () => {
    process.env.OPENAI_API_KEY = "sk-from-env";
    const config = loadConfig([]);
    expect(config.openaiApiKey).toBe("sk-from-env");
  });
});
