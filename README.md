# Web Agent Bridge

[中文说明](README.zh-CN.md)

Give a browser-based AI assistant tools to work on a real local project: read code,
edit files, run tests, inspect failures, and keep task checkpoints.

**Status: experimental 0.1.0.** Local MCP integration tests and a live ChatGPT web
code-edit/test/fix workflow pass; see [validation](docs/VALIDATION.md).
Source: [yyyqt/web-agent-bridge](https://github.com/yyyqt/web-agent-bridge).
Not published to npm or the ChatGPT plugin store.

```text
ChatGPT web (reasoning and tool selection)
          │ MCP through a private authenticated tunnel
          ▼
Web Agent Bridge (local tool runtime)
          ├─ workspace files + optimistic edits
          ├─ optional host commands + bounded results
          └─ task checkpoints + metadata-only audit log
```

No model inference API, reverse proxy for ChatGPT, browser session extraction,
or scraping of ChatGPT conversations. The runtime itself needs no OpenAI API key.
The optional official tunnel has its own runtime credential and permissions.
This project does **not** promise unlimited tokens or bypass account limits.

## Quick start

Requirements: Node.js 22+, macOS or Linux for shell execution. Use a disposable
project directory for first use. Clone this repository or extract its source archive, then run:

```sh
npm ci --ignore-scripts
npm run check
mkdir -p /tmp/bridge-demo
node src/cli.js --root /tmp/bridge-demo
```

The default transport is MCP stdio: it waits for an MCP client, not terminal input.
It exposes file tools and task checkpoints. Shell tools are absent by default.
To enable command execution:

```sh
node src/cli.js --root /tmp/bridge-demo --allow-host-exec
```

**`--allow-host-exec` gives the assistant unsandboxed host shell access.** Commands
run as the current OS user. `cwd`, blocked file names, and a reduced environment
are not a sandbox: commands can access paths outside the workspace, use the
network, and launch other processes. For stronger isolation, run the entire
runtime in a dedicated unprivileged VM/container. Do not mount secrets or the
Docker socket into that environment. No built-in container integration is claimed.

Connect through [the ChatGPT setup guide](docs/CHATGPT.md). For any stdio MCP
client, adapt [the configuration example](examples/mcp-client.json).

Optional loopback-only HTTP transport:

```sh
node src/cli.js --root /tmp/bridge-demo --transport http --port 8788
```

Endpoint: `http://127.0.0.1:8788/mcp`; health: `/health`. HTTP rejects browser
Origins and unexpected Host headers. It has no public authentication server and
must not be exposed through an unauthenticated public forwarding URL. Use an
access-controlled private tunnel; all trusted local clients share this workspace.

## Tools

| Tool | Purpose |
| --- | --- |
| `workspace_info` | Discover mode, limits, and the execution boundary |
| `list_files` | List one directory |
| `read_file` | Read UTF-8 text and SHA-256 |
| `search_text` | Literal search with file/line evidence |
| `write_file` | Atomic replace with expected hash; `null` only for creation |
| `list_tasks` / `save_task` | Resume a checkpoint using revision checks |
| `start_command` | Start an opted-in host command, return a job ID |
| `get_command` | Inspect bounded output and final exit status |
| `cancel_command` | Kill the command process group |

`--read-only` removes write/task-save/shell tools. Runtime metadata still writes
to `.web-agent/`. File tools deny parent traversal, secret-like names, `.git`,
symlinks and hard-linked files. Secret detection is deliberately incomplete.

Limits: 1 MiB UTF-8 files; 128 KiB combined stdout/stderr per command; two concurrent
commands; 600-second maximum command lifetime; 100 retained command results;
100 task records; 2,000 visited entries per search. Truncation and skipped search
files are returned explicitly. Shell stdin is closed; interactive programs/PTY
are not supported. Background daemons and detached processes are unsupported.

Tasks survive a server restart; running jobs and their output do not. A task
checkpoint does not schedule an autonomous model loop. Closing ChatGPT does not
cause the runtime to keep choosing or starting new tasks. Already started commands
can finish while the server remains running. Server shutdown cancels active jobs.

## Verify the first real workflow

After connecting, use [the demo prompt](examples/acceptance-prompt.md). Confirm
that the assistant calls tools, observes a failing test, corrects the code, runs
it again, and reports the real exit code. Verify the resulting files locally.
A written plan or fabricated terminal transcript does not count as acceptance.

## Development and contribution

```sh
npm ci --ignore-scripts
npm run check
npm audit --omit=dev
npm pack --dry-run
```

Tests cover real stdio/HTTP MCP round trips, a failing-test/fix/passing-test loop,
read-only discovery, path rejection, edit conflicts, task persistence, bounded
output, process cancellation, timeout, and local HTTP request validation.

See [architecture](docs/ARCHITECTURE.md), [security](SECURITY.md), and
[contribution notes](CONTRIBUTING.md). MIT licensed. Independent project, not
endorsed by OpenAI. No source code was copied from AgentDock or the article.
