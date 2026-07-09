export class McpHostError extends Error {
  constructor(
    message: string,
    readonly code = "MCP_HOST_ERROR",
  ) {
    super(message);
    this.name = "McpHostError";
  }
}

export class ConfigValidationError extends McpHostError {
  constructor(message: string) {
    super(message, "CONFIG_VALIDATION_ERROR");
    this.name = "ConfigValidationError";
  }
}

export class EngineResolutionError extends McpHostError {
  constructor(message: string) {
    super(message, "ENGINE_RESOLUTION_ERROR");
    this.name = "EngineResolutionError";
  }
}
