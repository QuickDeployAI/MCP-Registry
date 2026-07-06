export type ConfigPrimitive = string | number | boolean | null;

export interface ConfigOption<T extends ConfigPrimitive> {
  readonly type: "string" | "number" | "boolean";
  readonly cli?: string | readonly string[];
  readonly env?: readonly string[];
  readonly default?: T;
  readonly choices?: readonly T[];
  readonly parse?: (value: string | boolean) => T;
}

export type ConfigShape = Record<string, ConfigOption<ConfigPrimitive>>;

type InferOption<T extends ConfigOption<ConfigPrimitive>> =
  T extends ConfigOption<infer TValue> ? TValue : never;

export type InferConfig<TShape extends ConfigShape> = {
  [K in keyof TShape]: InferOption<TShape[K]>;
};

export interface DefinedConfig<TShape extends ConfigShape> {
  parse(argv?: readonly string[], env?: NodeJS.ProcessEnv): InferConfig<TShape>;
}

export function defineConfig<TShape extends ConfigShape>(
  shape: TShape,
): DefinedConfig<TShape> {
  return {
    parse(argv = process.argv.slice(2), env = process.env) {
      const cli = parseArgs(argv);
      const result: Record<string, ConfigPrimitive> = {};

      for (const [key, option] of Object.entries(shape)) {
        const cliNames = toCliNames(option.cli, key);
        const raw = firstCli(cliNames, cli) ?? firstEnv(option.env, env);
        const value = raw === undefined
          ? option.default ?? null
          : coerceValue(option, raw);

        if (option.choices && !option.choices.includes(value)) {
          throw new Error(
            `Invalid value for ${cliNames[0]}: ${String(value)}. Expected one of ${option.choices.join(", ")}`,
          );
        }

        result[key] = value;
      }

      return result as InferConfig<TShape>;
    },
  };
}

function toCliNames(cli: string | readonly string[] | undefined, key: string): readonly string[] {
  if (typeof cli === "string" || cli === undefined) return [cli ?? kebabCase(key)];
  return cli;
}

function firstCli(
  names: readonly string[],
  cli: ReadonlyMap<string, string | boolean>,
): string | boolean | undefined {
  for (const name of names) {
    const value = cli.get(name);
    if (value !== undefined) return value;
  }
  return undefined;
}

function parseArgs(argv: readonly string[]): Map<string, string | boolean> {
  const values = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith("-")) continue;

    if (arg.startsWith("--no-")) {
      values.set(arg.slice("--no-".length), false);
      continue;
    }

    const prefixLength = arg.startsWith("--") ? 2 : 1;
    const withoutPrefix = arg.slice(prefixLength);
    if (!withoutPrefix) continue;
    const equalsIndex = withoutPrefix.indexOf("=");
    if (equalsIndex >= 0) {
      values.set(withoutPrefix.slice(0, equalsIndex), withoutPrefix.slice(equalsIndex + 1));
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values.set(withoutPrefix, next);
      i += 1;
    } else {
      values.set(withoutPrefix, true);
    }
  }
  return values;
}

function firstEnv(
  names: readonly string[] | undefined,
  env: NodeJS.ProcessEnv,
): string | undefined {
  for (const name of names ?? []) {
    const value = env[name];
    if (value !== undefined) return value;
  }
  return undefined;
}

function coerceValue<T extends ConfigPrimitive>(
  option: ConfigOption<T>,
  raw: string | boolean,
): T {
  if (option.parse) return option.parse(raw);

  switch (option.type) {
    case "boolean":
      return parseBoolean(raw) as T;
    case "number":
      return parseNumber(raw) as T;
    case "string":
      return String(raw) as T;
  }
}

function parseBoolean(raw: string | boolean): boolean {
  if (typeof raw === "boolean") return raw;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function parseNumber(raw: string | boolean): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Expected numeric value, received ${String(raw)}`);
  return value;
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
