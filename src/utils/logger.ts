/**
 * Agent Conductor — stderr logger.
 *
 * stdout belongs to the MCP stdio transport; every log line must go to
 * stderr or it corrupts the protocol stream.
 */

function write(level: string, message: string): void {
  process.stderr.write(`[agent-conductor] ${level} ${message}\n`);
}

export const logger = {
  info: (message: string) => write("INFO", message),
  warn: (message: string) => write("WARN", message),
  error: (message: string) => write("ERROR", message),
};
