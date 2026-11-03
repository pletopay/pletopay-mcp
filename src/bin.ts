import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { USAGE, parseCli } from './cli';
import { ConfigError, secretKeyMode } from './config';
import { startHttpServer } from './http';
import { createPletopayMcpServer } from './server';
import { VERSION } from './version';

// stdout carries the MCP protocol on stdio: everything human-readable goes to stderr.
const log = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

async function main(): Promise<void> {
  const command = parseCli(process.argv.slice(2), process.env);
  if (command.kind === 'help') {
    process.stdout.write(USAGE);
    return;
  }
  if (command.kind === 'version') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (command.kind === 'http') {
    const { url, close } = await startHttpServer({ ...command.http, port: command.port });
    const stop = (): void => {
      void close().finally(() => process.exit(0));
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    log(`Pletopay MCP server ${VERSION} listening on ${url}/mcp`);
    return;
  }

  const server = createPletopayMcpServer(command.options);
  const transport = new StdioServerTransport();
  const shutdown = (): void => {
    void server.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await server.connect(transport);
  const mode = secretKeyMode(command.options.secretKey);
  log(`Pletopay MCP server ${VERSION} running on stdio (${mode} mode)`);
}

main().catch((error: unknown) => {
  log(error instanceof ConfigError ? `pletopay-mcp: ${error.message}` : `pletopay-mcp: ${String(error)}`);
  process.exit(1);
});
