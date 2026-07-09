#!/usr/bin/env tsx
import { createAsyncApi2McpCommand } from "./cli";

await createAsyncApi2McpCommand().parseAsync(process.argv);
