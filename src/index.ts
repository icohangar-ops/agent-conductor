#!/usr/bin/env node
/**
 * Agent Conductor — stdio entrypoint.
 *
 * Register with any MCP client, e.g. Claude Code:
 *   claude mcp add agent-conductor -- node /path/to/agent-conductor/dist/index.js
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.ts";
import { chpBridge } from "./engine/chpBridge.ts";
import { logger } from "./utils/logger.ts";

const server = createServer();
const transport = new StdioServerTransport();

function shutdown(): void {
  chpBridge.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// The client closing our stdin is the MCP signal to exit; without this the
// engine subprocess pipes keep the event loop alive forever.
process.stdin.on("end", shutdown);

await server.connect(transport);
logger.info("running on stdio transport");
