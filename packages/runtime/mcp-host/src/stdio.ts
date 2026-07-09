import type { Readable, Writable } from "node:stream";
import type { JsonRpcRequest, McpHost } from "./runtime";

export async function runStdioHost(
  host: McpHost,
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): Promise<void> {
  for await (const request of readStdioFrames(input)) {
    const response = await host.handleJsonRpc(request);
    if (response) writeStdioFrame(output, response);
  }
}

export async function* readStdioFrames(input: Readable): AsyncGenerator<JsonRpcRequest> {
  let buffer = Buffer.alloc(0);

  for await (const chunk of input) {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);

    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;

      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const lengthMatch = /^Content-Length:\s*(\d+)$/im.exec(header);
      if (!lengthMatch) {
        throw new Error("Stdio frame missing Content-Length header.");
      }

      const length = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const frameEnd = bodyStart + length;
      if (buffer.length < frameEnd) break;

      const body = buffer.subarray(bodyStart, frameEnd).toString("utf8");
      buffer = buffer.subarray(frameEnd);
      yield JSON.parse(body) as JsonRpcRequest;
    }
  }
}

export function writeStdioFrame(output: Writable, payload: unknown): void {
  const body = JSON.stringify(payload);
  output.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}
