# Architecture

`cli.js` validates startup options, opens stdio or loopback HTTP, and cleans up
commands on shutdown. HTTP is stateless per request, while one Runtime instance
holds jobs and serializes mutations across requests.

`server.js` registers MCP tool schemas, descriptions, read/write annotations and
model guidance using the official TypeScript/JavaScript MCP SDK. Zod validates
external tool arguments before dispatch. Errors are structured tool errors;
stdout in stdio mode is reserved for the protocol.

`runtime.js` implements bounded UTF-8 file operations, optimistic atomic writes,
literal search, opted-in host shell jobs, JSON task checkpoints and audit metadata.
The mutation queue prevents concurrent MCP writes from both accepting the same
old revision/hash. It does not lock out external processes editing the workspace.

## Execution lifecycle

1. Client/model calls `start_command` with a timeout.
2. Runtime launches a non-interactive shell and immediately returns a UUID.
3. Client polls `get_command`. Output is bounded and truncation explicit.
4. Process close supplies the exit code and signal. Timeout/cancel sends SIGKILL
   to the process group; side effects already performed are not rolled back.
5. Model reads the result and decides the next tool call.

There is no model backend inside the runtime. It cannot autonomously continue
reasoning after the client conversation ends. A future scheduler would need its
own model execution arrangement; persistent notes alone do not create an agent.

## Extension direction (not implemented)

Browser sessions, database queries, remote hosts and workflow scheduling should
be separate scoped tool modules with explicit credentials, permissions and
acceptance tests. Avoid turning a generic command endpoint into a claim that all
those integrations already work. A public gateway requires OAuth and a separate
threat model; a real sandbox requires an OS/container boundary.
