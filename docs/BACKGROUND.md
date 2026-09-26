# Running without an open browser

Run one runtime per workspace; multiple independent runtimes do not share a concurrency lock.
The browser is a client, not the local execution host. Once an explicitly requested `start_command` or
`start_codex` returns a job ID, the job can finish while the browser is closed,
provided the local runtime remains alive. Poll `list_commands` / `get_command`
after reconnecting. Tool approval must have happened before dispatch.

For official Secure MCP Tunnel, supervise the **tunnel client**; it owns the
stdio runtime process. A foreground terminal must remain open. A terminal
multiplexer or your OS service manager can own that process instead. On macOS,
a LaunchAgent can run the exact `tunnel-client run --config /absolute/private.yaml`
command; on Linux use a user systemd service. On Windows, keep the PowerShell
window running; this project does not currently install a scheduled task or service. Keep configs and logs private and
use absolute paths and an explicit PATH including Node and Codex. Do not place
runtime keys in public unit files or the repository. No autostart service is
installed by this project automatically.

If using HTTP, keep the runtime as its own supervised process and connect a
trusted authenticated gateway. Losing an HTTP client does not shut down the
runtime. Never publicly expose the unauthenticated loopback endpoint.

A computer that sleeps, loses network, logs out, reboots or powers down cannot
provide the same availability as an always-on host. Move the runtime plus project
to an always-on machine if that is required; that is a deployment choice, not a
browser toggle. This release preserves completed results, but does not restart
interrupted work automatically. Inspect side effects before retrying.

## Codex

The supported integration is the official [non-interactive CLI](https://learn.chatgpt.com/docs/non-interactive-mode).
It runs on your machine while inference uses the configured Codex service. It
requires its own login/quota. It does not automate the Codex desktop UI or make
Codex model calls count as ordinary ChatGPT web messages.

Use `--allow-codex --max-seconds 7200` for longer coding jobs. The dedicated tool
sets HOME to the OS user's home to find login state, optionally preserves
CODEX_HOME, and uses workspace-write sandboxing. Other server environment secrets
are not forwarded. Global Codex config is ignored for a reproducible invocation;
project instructions and rules still apply. A sandbox error is a real failure,
not a reason to silently retry with unrestricted execution.

## Queue and delegation

Default: four active processes. Excess jobs are queued FIFO; execution timeout
starts when launched. Cancelling queued work prevents launch. Shutdown cancels
both queued and active jobs; queued records after a crash become interrupted,
not silently replayed. At most 100 retained or pending records are accepted.

The web model performs work directly by default. Enabling the Codex tool only makes
it available; invocation requires an explicit user delegation request and
`userRequestedDelegation: true`. This acknowledgement is model-provided, not
independent proof of user consent or a shell security boundary.
