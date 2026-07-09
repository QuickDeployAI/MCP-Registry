#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { greeterDescriptorBytes } from "./test-fixtures";
import { buildGrpcUnaryTools } from "./tools";

type CatalogOptions = {
  descriptor?: string;
  fixture?: string;
  proto?: string;
  endpoint?: string;
  packageName?: string;
};

const [command, ...args] = process.argv.slice(2);

if (command === "catalog") {
  const options = parseCatalogOptions(args);
  const descriptorBytes =
    options.fixture === "greeter"
      ? greeterDescriptorBytes()
      : await readFile(requireOption(options.descriptor, "--descriptor"));
  const catalog = buildGrpcUnaryTools(descriptorBytes, {
    runtime: {
      protoPath: requireOption(options.proto, "--proto"),
      packageName: requireOption(options.packageName, "--package"),
      address: requireOption(options.endpoint, "--endpoint"),
    },
  });
  process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
} else {
  process.stdout.write(
    [
      "Usage: grpc-2-mcp catalog (--descriptor <file.binpb> | --fixture greeter) --proto <file.proto> --package <name> --endpoint <host:port>",
      "",
      "Prints the unary MCP tool catalog for a descriptor-backed gRPC service.",
      "",
    ].join("\n"),
  );
}

function parseCatalogOptions(args: string[]): CatalogOptions {
  const options: CatalogOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    switch (arg) {
      case "--descriptor":
        options.descriptor = requireOption(value, arg);
        index += 1;
        break;
      case "--fixture":
        options.fixture = requireOption(value, arg);
        index += 1;
        break;
      case "--proto":
        options.proto = requireOption(value, arg);
        index += 1;
        break;
      case "--endpoint":
        options.endpoint = requireOption(value, arg);
        index += 1;
        break;
      case "--package":
        options.packageName = requireOption(value, arg);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument ${arg}.`);
    }
  }
  return options;
}

function requireOption(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing value for ${flag}.`);
  return value;
}
