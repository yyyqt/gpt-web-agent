#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createServer as createHttpServer } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Runtime } from './runtime.js';
import os from 'node:os';
import { createServer } from './server.js';

const HELP = `gpt-web-agent 0.5.0
Usage: gpt-web-agent (--dynamic-projects | --root /absolute/workspace) [options]
  --dynamic-projects    No fixed project; allow local paths, default relative base is home.
  --transport stdio|http  Default: stdio. HTTP binds ONLY to 127.0.0.1.
  --port 8788            Local HTTP port (1024-65535).
  --read-only            Expose no file/task mutations or command tools.
  --allow-host-exec      Enable UNSANDBOXED host shell execution (macOS/Linux).
  --allow-codex          Enable local Codex tasks using existing login, workspace-write.
  --codex-bin PATH       Codex executable (default: codex from PATH).
  --max-seconds N        Max job lifetime, 1-86400 (default 600).
  --max-concurrent N     Concurrent jobs, 1-16 (default 4; excess jobs queue).
  --max-output-bytes N   Combined job output, 1024-16777216 (default 131072).
  --max-file-bytes N     Text file limit, 1024-16777216 (default 1048576).
  --help                 Show this help.

Default: file read/write and task checkpoints, shell disabled.
State/audit metadata is written even in read-only mode: ROOT/.web-agent in fixed
mode; ~/Library/Application Support/gpt-web-agent/local-state in dynamic mode.
HTTP is for a trusted local tunnel/client ONLY; never publicly forward it
without an authenticating gateway. Prefer the official Secure MCP Tunnel.
The bridge does not call model APIs or extract browser session tokens.
Optional Codex tasks use the existing Codex login and account quota.
`;
let runtime, http;
const servers = new Set();
async function main() {
  const { values } = parseArgs({ options: {
    root: { type: 'string' }, 'dynamic-projects': { type: 'boolean' }, transport: { type: 'string', default: 'stdio' },
    port: { type: 'string', default: '8788' }, 'read-only': { type: 'boolean' },
    'allow-host-exec': { type: 'boolean' }, 'allow-codex': { type: 'boolean' }, 'codex-bin': { type: 'string' },
    'max-seconds': { type: 'string' }, 'max-concurrent': { type: 'string' }, 'max-output-bytes': { type: 'string' }, 'max-file-bytes': { type: 'string' }, help: { type: 'boolean' }
  }, allowPositionals: false });
  if (values.help) { process.stdout.write(HELP); return; }
  if (values['dynamic-projects'] && values.root) throw new Error('--dynamic-projects and --root are mutually exclusive');
  if (!values['dynamic-projects'] && (!values.root || !path.isAbsolute(values.root))) throw new Error('--root must be an explicit absolute directory');
  if (!['stdio', 'http'].includes(values.transport)) throw new Error('--transport must be stdio or http');
  if (values['read-only'] && (values['allow-host-exec'] || values['allow-codex'])) throw new Error('--read-only conflicts with execution options');
  if ((values['allow-host-exec'] || values['allow-codex']) && process.platform === 'win32') throw new Error('Host execution requires macOS/Linux; use WSL on Windows');
  const limits = {};
  for (const [flag, key] of Object.entries({ 'max-seconds': 'timeoutSeconds', 'max-concurrent': 'concurrency', 'max-output-bytes': 'outputBytes', 'max-file-bytes': 'fileBytes' })) {
    if (values[flag] !== undefined) { if (!/^\d+$/.test(values[flag])) throw new Error(`--${flag} must be an integer`); limits[key] = Number(values[flag]); }
  }
  const options = { readOnly: !!values['read-only'], allowHostExec: !!values['allow-host-exec'], allowCodex: !!values['allow-codex'], codexBinary: values['codex-bin'] || 'codex', limits };
  runtime = values['dynamic-projects']
    ? new Runtime(os.homedir(), { ...options, allowAbsolutePaths: true, stateDirectory: path.join(os.homedir(), 'Library', 'Application Support', 'gpt-web-agent', 'local-state') })
    : new Runtime(values.root, options);
  await runtime.init();
  if (runtime.allowHostExec) process.stderr.write('Host shell ENABLED: commands run with your OS user permissions. No sandbox.\n');
  if (values.transport === 'stdio') {
    const server = createServer(runtime); servers.add(server);
    await server.connect(new StdioServerTransport());
    process.stdin.once('end', () => shutdown());
  } else {
    const port = Number(values.port);
    if (!/^\d+$/.test(values.port) || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be 1024-65535');
    http = createHttpServer(async (req, res) => {
      // Protect against browser CSRF and DNS rebinding. No CORS policy is emitted.
      if (req.headers.origin || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) {
        res.writeHead(403).end('Local requests only'); return;
      }
      if (req.url === '/health' && req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); return; }
      if (req.url !== '/mcp') { res.writeHead(404).end('Not found'); return; }
      if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end('Stateless MCP: use POST'); return; }
      if (!req.headers['content-type']?.startsWith('application/json')) { res.writeHead(415).end('Expected application/json'); return; }
      let size = 0; const chunks = [];
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > runtime.limits.fileBytes * 6 + 65536) { res.writeHead(413).end('Request too large'); return; }
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { res.writeHead(400).end('Invalid JSON'); return; }
        const server = createServer(runtime);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        servers.add(server);
        res.on('close', () => { servers.delete(server); server.close().catch(e => process.stderr.write(`Transport close error: ${e.message}\n`)); });
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (e) {
        process.stderr.write(`HTTP error: ${e.message}\n`);
        if (!res.headersSent) res.writeHead(500).end('MCP request failed');
        else res.end();
      }
    });
    http.requestTimeout = 15000;
    http.headersTimeout = 10000;
    await new Promise((resolve, reject) => { http.once('error', reject); http.listen(port, '127.0.0.1', resolve); });
    process.stderr.write(`Local MCP listening at http://127.0.0.1:${port}/mcp\n`);
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  http?.close();
  try { await runtime?.close(); await Promise.all([...servers].map(s => s.close())); }
  catch (e) { process.stderr.write(`Shutdown error: ${e.message}\n`); process.exitCode = 1; }
}
main().catch(async e => { process.stderr.write(`gpt-web-agent: ${e.message}\n`); await shutdown(); process.exitCode = 1; });
