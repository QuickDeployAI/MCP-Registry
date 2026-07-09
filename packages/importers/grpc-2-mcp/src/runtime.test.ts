import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildGrpcMetadata,
  channelCredentialsFromSecurity,
  filterPassthroughMetadata,
  invokeServerStreaming,
} from "./runtime";
import { buildGrpcUnaryTools } from "./tools";
import { greeterDescriptorBytes } from "./test-fixtures";

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(currentDir, "..");
const fixtureProto = join(packageDir, "fixtures", "greeter.proto");
const fixtureCertificate = `-----BEGIN CERTIFICATE-----
MIICzjCCAbagAwIBAgIUHP4WM0H6I/b6v0WSNuRkXpdiCvYwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDcwNTEzNDc1MVoXDTM2MDcw
MzEzNDc1MVowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAwuG9jrzv3ucvYW9Nv38UKL5nmKnTmG9zsUVZAXZSJfRR
C0i5N+2/lMA/BouSOFkUCS0RVJv95TNTQsPP6gM2E83rzVJr66ZvmE+wlzPBn8WV
1K+vj7HyyWMyTY4Any34jvz3p2Spjzax1uvzA2kan/pVjz/LmHRWJPU/sm6F2PU5
xqXivgA/E52OlNzhd9XRK0IkBWdxJU0dL7bLgXXL8J532x4mvXL+spuCEW1UszPJ
rSOnQsNWJPtobq+jM3zMgMAgb6Qej6QTv24HX/tll+HFMJcZlf6cjDyj/65BknFA
nXH47RNkC1Rgm7LLy8N4Sd8tLl5N3D6YJbkeVTzJRQIDAQABoxgwFjAUBgNVHREE
DTALgglsb2NhbGhvc3QwDQYJKoZIhvcNAQELBQADggEBAEZqgb+uWDbWzLMWIJ1z
7/TFK0kbrh8o/9iUgdyjmisE3oo48GcPqS6NLbek2vLHS5DexTbrmjjdTkckHmrV
eva0a9dmDMboVHUCpRhgYN0aPvq6NCFjTU+HGjMvE0boPgkK4Z7FM75JuV/Dpfx6
SQo1T2mTJ5p+o1rrUeDZDH/BEIBwcTpPv1dcR9AhcBeFlzv3SJ4tM/3Y/HDCkxrd
bMRsG9H8mwYpt9DXRdLQ+/3z2q1oWJaRb1o3REmf2SN8KJiWAR+JfsrP2b53i81Q
PycvdPK+yQ1PByiMpWQAH6CZfC0clLEGZbzu9+plda9O80ofpDhbg9qcj2E5DjcT
QoI=
-----END CERTIFICATE-----
`;
const fixturePrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDC4b2OvO/e5y9h
b02/fxQovmeYqdOYb3OxRVkBdlIl9FELSLk37b+UwD8Gi5I4WRQJLRFUm/3lM1NC
w8/qAzYTzevNUmvrpm+YT7CXM8GfxZXUr6+PsfLJYzJNjgCfLfiO/PenZKmPNrHW
6/MDaRqf+lWPP8uYdFYk9T+yboXY9TnGpeK+AD8TnY6U3OF31dErQiQFZ3ElTR0v
tsuBdcvwnnfbHia9cv6ym4IRbVSzM8mtI6dCw1Yk+2hur6MzfMyAwCBvpB6PpBO/
bgdf+2WX4cUwlxmV/pyMPKP/rkGScUCdcfjtE2QLVGCbssvLw3hJ3y0uXk3cPpgl
uR5VPMlFAgMBAAECggEAFOMdWNP0QPz1+D315HfqK7cYow//VJ+2voG9w+kwGHmi
nrspKuQ+++JM/wEXkhWDZGZhrKKu0ubY3ize4b3Ss8sGzRyv4h5rvd87VewKAntV
ZJR96cCl/SK2IgIocTx79FYK9HSBXeRRVEU5aHIBP13qggN8PqH9bPxM2u17SAuf
RtEh5/ivEEuYSAgaVhod2ChtWjcIbDt/mTSt5D0s2pku2Qcac/a0SOmeS8MWSQsI
Bbq3wOKUHmpiSqOrPBP3KEYZcgrsjITXoDMRrbd3CtGK4IvSe9pSfwjlmxS8XM9T
zJPU9tz3kPpLmtQj3tvEBxsTb+jd2miJ5W0nMwvSwwKBgQDicLOLyXLqGWyINLX3
FBjr8+DWovMkg9Ux2vliDKjuMseYEof7ewtCkWONTmZPXcidOALPaq7JWkD6EO60
aWHaKFt1AfwZ3SVpdSmcdG3ioD+c66RhVHlinkmt0WSiCYqRRi5s38saonN62EcT
g/6dZ2JA6Yt7szHWOSwc4b7ynwKBgQDcUmcPjGlb3cUyolj3XnFdIvwlqnTunyzc
EKSvpbtsbzHImj9vapMe0fics5KbE+0vVVOqyyXwwZ9xEYRXKSLN5BYBhqHkY+p7
91o8G4Qa8oJ9uAk8aEsgFrSJj8LUx7baJ+E6Ov/zbKMvnzcdkZ1szjI2xS+evmn3
29UmtzA9mwKBgQCR72p3k7wgzYPaAIapl2U8ZC+qhNhI10IGYIbKvzf8U/O4uXC0
DafDHipXvohHbDzHvnppLOs6z5UC1PjSgvxSeiH/NelAzfq3jY/kylCrdvWob2HA
bI3SlgsMH+BIYffRCrcO6ehe4QWlzU95b18gGKoFBb8kWOeslaotbvv+JwKBgEl3
HLB9lIAygdfxdJL/pfN1f/ibTyRmZVH4JsH/FHEC3unSLUbclbQYNbsi0cbuLQ+0
dxKjbMJL/ft46NUbfWSEIqZdm0wJ2R1/DFKwpitKJCMBo+rFqA9KIucfzcqf0aQK
2jpNhB1KY1u0zm8IqCKo2uuSct+PBMzGO9wOB4LzAoGBAJEzdzjcNTdQYl+4womH
22E9eCPiHDzky4TpatmLC6n+VYPtwsfOdWUkGDVpgMyqZkXkkk30H7oT1oQX85p2
ufzi+WtVI4szTiXGNMoqtG7rzcg6x7sBlLizC7LdmUV4fayxXDRYQoCj3MMLUCLK
VmaUvl6vFvI7fLwqz4rQMovq
-----END PRIVATE KEY-----
`;

describe("grpc-2-mcp unary runtime tools", () => {
  const servers: grpc.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.tryShutdown(() => resolve());
          }),
      ),
    );
    servers.length = 0;
  });

  it("calls unary echo and nested-message services through generated tools", async () => {
    const address = await startGreeterServer();
    const catalog = buildGrpcUnaryTools(greeterDescriptorBytes(), {
      runtime: {
        protoPath: fixtureProto,
        packageName: "quickdeploy.fixture",
        address,
        includeDirs: [packageDir],
      },
    });

    expect(catalog.tools.map((tool) => tool.name)).toEqual([
      "quickdeploy_fixture_greeter_say_hello",
      "quickdeploy_fixture_greeter_describe_profile",
    ]);
    expect(catalog.unsupportedMethods.map((method) => method.methodName)).toEqual([
      "UploadHellos",
      "ChatHello",
    ]);

    await expect(catalog.tools[0]?.invoke({ name: "QDAI" })).resolves.toEqual({
      message: "hello QDAI",
    });
    await expect(
      catalog.tools[1]?.invoke({
        userId: "user-123",
        accountId: "9223372036854775807",
        tags: ["mcp", "grpc"],
        metadata: { tier: "preview" },
        attributes: { enabled: true },
        email: "dev@quickdeploy.ai",
      }),
    ).resolves.toEqual({
      summary: "user-123:mcp,grpc:preview:dev@quickdeploy.ai",
      accountId: "9223372036854775807",
    });
  });

  it("injects env-backed auth metadata into unary calls", async () => {
    const address = await startGreeterServer({ requiredAuthorization: "Bearer test-token" });
    const unauthenticated = buildGrpcUnaryTools(greeterDescriptorBytes(), {
      runtime: {
        protoPath: fixtureProto,
        packageName: "quickdeploy.fixture",
        address,
        includeDirs: [packageDir],
      },
    });

    await expect(unauthenticated.tools[0]?.invoke({ name: "QDAI" })).rejects.toMatchObject({
      code: grpc.status.UNAUTHENTICATED,
    });

    const authenticated = buildGrpcUnaryTools(greeterDescriptorBytes(), {
      runtime: {
        protoPath: fixtureProto,
        packageName: "quickdeploy.fixture",
        address,
        includeDirs: [packageDir],
        auth: { scheme: "bearer", tokenEnv: "GRPC_BEARER_TOKEN" },
        env: { GRPC_BEARER_TOKEN: "test-token" },
        passthroughMetadata: {
          cookie: "must-not-forward",
          "x-request-id": "trace-123",
        },
      },
    });

    await expect(authenticated.tools[0]?.invoke({ name: "QDAI" })).resolves.toEqual({
      message: "hello QDAI",
    });
  });

  it("builds bearer, api-key, and basic auth metadata from env references", () => {
    expect(
      buildGrpcMetadata({
        auth: { scheme: "bearer", tokenEnv: "TOKEN" },
        env: { TOKEN: "bearer-secret" },
      })?.get("authorization"),
    ).toEqual(["Bearer bearer-secret"]);
    expect(
      buildGrpcMetadata({
        auth: { scheme: "apiKey", keyEnv: "API_KEY", metadataKey: "x-api-key" },
        env: { API_KEY: "api-secret" },
      })?.get("x-api-key"),
    ).toEqual(["api-secret"]);
    expect(
      buildGrpcMetadata({
        auth: { scheme: "basic", usernameEnv: "BASIC_USER", passwordEnv: "BASIC_PASS" },
        env: { BASIC_USER: "dev", BASIC_PASS: "secret" },
      })?.get("authorization"),
    ).toEqual([`Basic ${Buffer.from("dev:secret").toString("base64")}`]);
  });

  it("names missing credential env vars without logging secret values", () => {
    expect(() =>
      buildGrpcMetadata({
        auth: { scheme: "apiKey", keyEnv: "GRPC_API_KEY", metadataKey: "x-api-key" },
        env: {},
      }),
    ).toThrow("Missing required gRPC credential env var GRPC_API_KEY");
  });

  it("filters unsafe pass-through metadata keys", () => {
    expect(
      filterPassthroughMetadata({
        authorization: "Bearer caller-token",
        cookie: "session=secret",
        "x-request-id": "trace-123",
      }),
    ).toEqual({ "x-request-id": "trace-123" });
  });

  it("flattens a server-streaming call into progress messages plus a final result", async () => {
    const address = await startGreeterServer();
    const seen: Array<{ message: unknown; index: number }> = [];

    const result = await invokeServerStreaming({
      protoPath: fixtureProto,
      packageName: "quickdeploy.fixture",
      serviceName: "Greeter",
      methodName: "WatchHello",
      address,
      includeDirs: [packageDir],
      request: { name: "QDAI" },
      onMessage: (message, index) => seen.push({ message, index }),
    });

    expect(result).toEqual({
      messages: [
        { message: "hello QDAI #0" },
        { message: "hello QDAI #1" },
        { message: "hello QDAI #2" },
        { message: "hello QDAI #3" },
      ],
      count: 4,
      truncated: false,
      truncationReason: undefined,
    });
    expect(seen.map((entry) => entry.index)).toEqual([0, 1, 2, 3]);
    expect(seen[0]?.message).toEqual({ message: "hello QDAI #0" });
  });

  it("truncates a server-streaming call once the message budget is hit", async () => {
    const address = await startGreeterServer();

    const result = await invokeServerStreaming({
      protoPath: fixtureProto,
      packageName: "quickdeploy.fixture",
      serviceName: "Greeter",
      methodName: "WatchHello",
      address,
      includeDirs: [packageDir],
      request: { name: "QDAI" },
      maxMessages: 2,
    });

    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toEqual("max-messages");
    expect(result.messages).toEqual([{ message: "hello QDAI #0" }, { message: "hello QDAI #1" }]);
  });

  it("truncates a server-streaming call once the time budget is hit", async () => {
    const address = await startGreeterServer();

    const result = await invokeServerStreaming({
      protoPath: fixtureProto,
      packageName: "quickdeploy.fixture",
      serviceName: "Greeter",
      methodName: "WatchHello",
      address,
      includeDirs: [packageDir],
      request: { name: "slow" },
      timeoutMs: 20,
    });

    expect(result).toEqual({
      messages: [],
      count: 0,
      truncated: true,
      truncationReason: "timeout",
    });
  });

  it("exposes server-streaming tools through the tool catalog with progress callbacks", async () => {
    const address = await startGreeterServer();
    const catalog = buildGrpcUnaryTools(greeterDescriptorBytes(), {
      runtime: {
        protoPath: fixtureProto,
        packageName: "quickdeploy.fixture",
        address,
        includeDirs: [packageDir],
      },
    });

    const watchHello = catalog.streamingTools.find((tool) => tool.methodName === "WatchHello");
    const progressed: number[] = [];

    const result = await watchHello?.invoke(
      { name: "QDAI" },
      { maxMessages: 1, onProgress: (_message, index) => progressed.push(index) },
    );

    expect(progressed).toEqual([0]);
    expect(result).toMatchObject({ truncated: true, truncationReason: "max-messages" });
  });

  it("builds TLS channel credentials from custom CA and mTLS file references", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "grpc-2-mcp-tls-"));
    const caPath = join(tempDir, "ca.pem");
    const certPath = join(tempDir, "client.pem");
    const keyPath = join(tempDir, "client.key");
    await writeFile(caPath, fixtureCertificate, "utf8");
    await writeFile(certPath, fixtureCertificate, "utf8");
    await writeFile(keyPath, fixturePrivateKey, "utf8");

    try {
      const security = channelCredentialsFromSecurity({
        mode: "tls",
        caCertPath: caPath,
        clientCertPath: certPath,
        clientKeyPath: keyPath,
        authority: "localhost",
      });

      expect(security.credentials).toBeDefined();
      expect(security.options).toMatchObject({
        "grpc.default_authority": "localhost",
        "grpc.ssl_target_name_override": "localhost",
      });
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("passes env-backed credential bindings as gRPC metadata", async () => {
    const address = await startGreeterServer({ requiredAuthorization: "Bearer grpc-secret" });
    const catalog = buildGrpcUnaryTools(greeterDescriptorBytes(), {
      runtime: {
        protoPath: fixtureProto,
        packageName: "quickdeploy.fixture",
        address,
        includeDirs: [packageDir],
        credentialBindings: [{ type: "bearer", token: { env: "GRPC_TOKEN" } }],
        credentialEnv: { GRPC_TOKEN: "grpc-secret" },
      },
    });

    await expect(catalog.tools[0]?.invoke({ name: "QDAI" })).resolves.toEqual({
      message: "hello QDAI",
    });
  });

  async function startGreeterServer(
    options: { requiredAuthorization?: string } = {},
  ): Promise<string> {
    const definition = protoLoader.loadSync(fixtureProto, {
      defaults: true,
      includeDirs: [packageDir],
      keepCase: false,
      longs: String,
      oneofs: true,
    });
    const loaded = grpc.loadPackageDefinition(definition) as grpc.GrpcObject;
    const pkg = loaded.quickdeploy as grpc.GrpcObject;
    const fixture = pkg.fixture as grpc.GrpcObject;
    const Greeter = fixture.Greeter as grpc.ServiceClientConstructor;

    const server = new grpc.Server();
    server.addService(Greeter.service, {
      sayHello: (
        call: grpc.ServerUnaryCall<{ name: string }, { message: string }>,
        callback: grpc.sendUnaryData<{ message: string }>,
      ) => {
        if (!hasRequiredAuthorization(call.metadata, options.requiredAuthorization)) {
          callback(unauthenticated("missing required authorization metadata"));
          return;
        }
        callback(null, { message: `hello ${call.request.name}` });
      },
      describeProfile: (
        call: grpc.ServerUnaryCall<ProfileRequest, { summary: string; accountId: string }>,
        callback: grpc.sendUnaryData<{ summary: string; accountId: string }>,
      ) => {
        const request = call.request;
        callback(null, {
          summary: `${request.userId}:${request.tags.join(",")}:${request.metadata.tier}:${request.email}`,
          accountId: request.accountId,
        });
      },
      watchHello: (call: grpc.ServerWritableStream<{ name: string }, { message: string }>) => {
        if (call.request.name === "slow") {
          const timer = setTimeout(() => call.end(), 5_000);
          call.on("cancelled", () => clearTimeout(timer));
          return;
        }
        let index = 0;
        let cancelled = false;
        call.on("cancelled", () => {
          cancelled = true;
        });
        call.on("error", () => {
          cancelled = true;
        });
        const emitNext = () => {
          if (cancelled) return;
          if (index >= 4) {
            call.end();
            return;
          }
          call.write({ message: `hello ${call.request.name} #${index}` });
          index += 1;
          setImmediate(emitNext);
        };
        emitNext();
      },
      uploadHellos: (
        _call: grpc.ServerReadableStream<{ name: string }, { message: string }>,
        callback: grpc.sendUnaryData<{ message: string }>,
      ) => {
        callback(new Error("grpc-2-mcp does not support client streaming."));
      },
      chatHello: () => {
        throw new Error("grpc-2-mcp does not support bidirectional streaming.");
      },
    });

    const port = await new Promise<number>((resolve, reject) => {
      server.bindAsync(
        "127.0.0.1:0",
        grpc.ServerCredentials.createInsecure(),
        (error, boundPort) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(boundPort);
        },
      );
    });
    servers.push(server);
    return `127.0.0.1:${port}`;
  }
});

function hasRequiredAuthorization(
  metadata: grpc.Metadata,
  requiredAuthorization: string | undefined,
): boolean {
  if (!requiredAuthorization) return true;
  return metadata.get("authorization").includes(requiredAuthorization);
}

function unauthenticated(message: string): grpc.ServiceError {
  return {
    name: "Unauthenticated",
    message,
    details: message,
    code: grpc.status.UNAUTHENTICATED,
    metadata: new grpc.Metadata(),
  };
}

type ProfileRequest = {
  userId: string;
  accountId: string;
  tags: string[];
  metadata: Record<string, string>;
  attributes: Record<string, unknown>;
  email?: string;
  phone?: string;
};
