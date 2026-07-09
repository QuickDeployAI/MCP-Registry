import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { readFileSync } from "node:fs";

export type GrpcAuthConfig =
  | {
      scheme: "bearer";
      tokenEnv: string;
      metadataKey?: string;
    }
  | {
      scheme: "apiKey";
      keyEnv: string;
      metadataKey: string;
    }
  | {
      scheme: "basic";
      usernameEnv: string;
      passwordEnv: string;
      metadataKey?: string;
    };

export type GrpcChannelSecurity =
  | { mode: "insecure" }
  | {
      mode: "tls";
      caCertPath?: string;
      clientCertPath?: string;
      clientKeyPath?: string;
      authority?: string;
    };

export type GrpcMetadataOptions = {
  auth?: GrpcAuthConfig;
  env?: Record<string, string | undefined>;
  metadata?: Record<string, string>;
  passthroughMetadata?: Record<string, string>;
  blockedPassthroughKeys?: readonly string[];
};

export type UnaryCallOptions = {
  protoPath: string | string[];
  packageName: string;
  serviceName: string;
  methodName: string;
  address: string;
  request: Record<string, unknown>;
  includeDirs?: string[];
  metadata?: Record<string, string>;
  passthroughMetadata?: Record<string, string>;
  blockedPassthroughKeys?: readonly string[];
  auth?: GrpcAuthConfig;
  env?: Record<string, string | undefined>;
  channelSecurity?: GrpcChannelSecurity;
};

type DynamicConstructor = new (
  address: string,
  credentials: grpc.ChannelCredentials,
  options?: grpc.ChannelOptions,
) => grpc.Client;

type UnaryMethod = (
  this: grpc.Client,
  request: Record<string, unknown>,
  metadataOrCallback: grpc.Metadata | grpc.requestCallback<unknown>,
  callback?: grpc.requestCallback<unknown>,
) => grpc.ClientUnaryCall;

type ServerStreamMethod = (
  this: grpc.Client,
  request: Record<string, unknown>,
  metadata?: grpc.Metadata,
) => grpc.ClientReadableStream<unknown>;

export type ServerStreamBudget = {
  /** Stop after this many messages and mark the result truncated. */
  maxMessages?: number;
  /** Stop after this many milliseconds and mark the result truncated. */
  timeoutMs?: number;
};

export type ServerStreamCallOptions = Omit<UnaryCallOptions, "request"> &
  ServerStreamBudget & {
    request: Record<string, unknown>;
    /** Invoked synchronously as each message arrives, for progress-notification fan-out. */
    onMessage?: (message: unknown, index: number) => void;
  };

export type ServerStreamTruncationReason = "max-messages" | "timeout";

export type ServerStreamResult = {
  messages: unknown[];
  count: number;
  truncated: boolean;
  truncationReason?: ServerStreamTruncationReason;
};

const DEFAULT_BLOCKED_PASSTHROUGH_KEYS = [
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "grpc-encoding",
  "grpc-timeout",
  "host",
  "keep-alive",
  "proxy-authorization",
  "te",
  "transfer-encoding",
  "upgrade",
] as const;

type GrpcClientHandle<Method> = {
  client: grpc.Client;
  method: Method;
};

function connectGrpcMethod<Method>(options: {
  protoPath: string | string[];
  packageName: string;
  serviceName: string;
  methodName: string;
  address: string;
  includeDirs?: string[];
  channelSecurity?: GrpcChannelSecurity;
}): GrpcClientHandle<Method> {
  const definition = protoLoader.loadSync(options.protoPath, {
    defaults: true,
    includeDirs: options.includeDirs,
    keepCase: false,
    longs: String,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(definition);
  const servicePackage = resolvePackage(loaded, options.packageName);
  const Client = servicePackage[options.serviceName] as unknown as DynamicConstructor | undefined;

  if (!Client) {
    throw new Error(`Service ${options.packageName}.${options.serviceName} was not found`);
  }

  const { credentials, options: channelOptions } = channelCredentialsFromSecurity(
    options.channelSecurity,
  );
  const client = new Client(options.address, credentials, channelOptions);
  const methodSurface = client as grpc.Client & Record<string, unknown>;
  const method = (methodSurface[lowerFirst(options.methodName)] ??
    methodSurface[options.methodName]) as Method | undefined;
  if (typeof method !== "function") {
    client.close();
    throw new Error(`Method ${options.methodName} was not found`);
  }
  return { client, method };
}

export async function invokeUnary(options: UnaryCallOptions): Promise<unknown> {
  const { client, method } = connectGrpcMethod<UnaryMethod>(options);

  return await new Promise((resolve, reject) => {
    const callback = (error: grpc.ServiceError | null, response: unknown) => {
      client.close();
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    };
    const metadata = buildGrpcMetadata({
      auth: options.auth,
      blockedPassthroughKeys: options.blockedPassthroughKeys,
      env: options.env,
      metadata: options.metadata,
      passthroughMetadata: options.passthroughMetadata,
    });
    if (metadata) {
      method.call(client, options.request, metadata, callback);
      return;
    }
    method.call(client, options.request, callback);
  });
}

export async function invokeServerStreaming(
  options: ServerStreamCallOptions,
): Promise<ServerStreamResult> {
  const { client, method } = connectGrpcMethod<ServerStreamMethod>(options);

  const metadata = buildGrpcMetadata({
    auth: options.auth,
    blockedPassthroughKeys: options.blockedPassthroughKeys,
    env: options.env,
    metadata: options.metadata,
    passthroughMetadata: options.passthroughMetadata,
  });
  const call = method.call(client, options.request, metadata);

  return new Promise((resolve, reject) => {
    const messages: unknown[] = [];
    let truncated = false;
    let truncationReason: ServerStreamTruncationReason | undefined;
    let settled = false;

    const timeout =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            truncated = true;
            truncationReason = "timeout";
            call.cancel();
          }, options.timeoutMs)
        : undefined;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      client.close();
      resolve({ messages, count: messages.length, truncated, truncationReason });
    };

    call.on("data", (message: unknown) => {
      if (truncated) return;
      const index = messages.length;
      messages.push(message);
      options.onMessage?.(message, index);
      if (options.maxMessages !== undefined && messages.length >= options.maxMessages) {
        truncated = true;
        truncationReason = "max-messages";
        call.cancel();
      }
    });
    call.on("end", finish);
    call.on("error", (error: grpc.ServiceError) => {
      if (truncated && error.code === grpc.status.CANCELLED) {
        finish();
        return;
      }
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      client.close();
      reject(error);
    });
  });
}

export function buildGrpcMetadata(options: GrpcMetadataOptions = {}): grpc.Metadata | undefined {
  const entries = new Map<string, string>();
  mergeMetadata(entries, options.metadata);
  mergeMetadata(
    entries,
    filterPassthroughMetadata(options.passthroughMetadata, options.blockedPassthroughKeys),
  );
  const authMetadata = metadataFromAuth(options.auth, options.env ?? process.env);
  mergeMetadata(entries, authMetadata);

  if (entries.size === 0) {
    return undefined;
  }

  const metadata = new grpc.Metadata();
  for (const [key, value] of entries) {
    metadata.set(key, value);
  }
  return metadata;
}

export function filterPassthroughMetadata(
  metadata: Record<string, string> | undefined,
  blockedKeys: readonly string[] = DEFAULT_BLOCKED_PASSTHROUGH_KEYS,
): Record<string, string> | undefined {
  if (!metadata) return undefined;
  const blocked = new Set(blockedKeys.map((key) => key.toLowerCase()));
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (blocked.has(key.toLowerCase())) continue;
    filtered[key] = value;
  }
  return filtered;
}

export function channelCredentialsFromSecurity(security: GrpcChannelSecurity | undefined): {
  credentials: grpc.ChannelCredentials;
  options?: grpc.ChannelOptions;
} {
  if (!security || security.mode === "insecure") {
    return { credentials: grpc.credentials.createInsecure() };
  }

  const rootCerts = security.caCertPath ? readFileSync(security.caCertPath) : undefined;
  const privateKey = security.clientKeyPath ? readFileSync(security.clientKeyPath) : undefined;
  const certChain = security.clientCertPath ? readFileSync(security.clientCertPath) : undefined;
  if ((privateKey && !certChain) || (!privateKey && certChain)) {
    throw new Error("gRPC mTLS requires both clientKeyPath and clientCertPath");
  }

  return {
    credentials: grpc.credentials.createSsl(rootCerts, privateKey, certChain),
    options: security.authority
      ? {
          "grpc.default_authority": security.authority,
          "grpc.ssl_target_name_override": security.authority,
        }
      : undefined,
  };
}

function metadataFromAuth(
  auth: GrpcAuthConfig | undefined,
  env: Record<string, string | undefined>,
): Record<string, string> | undefined {
  if (!auth) return undefined;

  if (auth.scheme === "bearer") {
    const token = requiredEnv(auth.tokenEnv, env);
    return { [auth.metadataKey ?? "authorization"]: `Bearer ${token}` };
  }

  if (auth.scheme === "apiKey") {
    return { [auth.metadataKey]: requiredEnv(auth.keyEnv, env) };
  }

  const username = requiredEnv(auth.usernameEnv, env);
  const password = requiredEnv(auth.passwordEnv, env);
  return {
    [auth.metadataKey ?? "authorization"]: `Basic ${Buffer.from(`${username}:${password}`).toString(
      "base64",
    )}`,
  };
}

function requiredEnv(name: string, env: Record<string, string | undefined>): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required gRPC credential env var ${name}`);
  }
  return value;
}

function mergeMetadata(
  target: Map<string, string>,
  source: Record<string, string> | undefined,
): void {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    target.set(key.toLowerCase(), value);
  }
}

function resolvePackage(root: grpc.GrpcObject, packageName: string): grpc.GrpcObject {
  return packageName.split(".").reduce<grpc.GrpcObject>((current, part) => {
    const next = current[part];
    if (!isGrpcObject(next)) {
      throw new Error(`Package ${packageName} was not found`);
    }
    return next;
  }, root);
}

function isGrpcObject(value: unknown): value is grpc.GrpcObject {
  return typeof value === "object" && value !== null;
}

function lowerFirst(value: string): string {
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}
