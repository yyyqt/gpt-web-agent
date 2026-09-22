# Connect ChatGPT web

This guide follows official documentation checked on 2026-09-22. UI labels,
account eligibility and organization permissions can change. Read:

- https://developers.openai.com/api/docs/guides/developer-mode
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://developers.openai.com/plugins/deploy/connect-chatgpt

## Preferred: private stdio server through Secure MCP Tunnel

The bridge runs locally; an official `tunnel-client` connects outward to OpenAI.
There is no public listening port and no model API call made by this bridge.
The tunnel still requires a runtime API credential, tunnel identity and permissions.
Do not confuse a ChatGPT subscription with Platform tunnel access or free tunnel
usage; verify any applicable costs and permissions in your account.

1. Install this project's pinned dependencies with `npm ci --ignore-scripts`.
2. Prepare an absolute path to a disposable workspace.
3. In ChatGPT settings, find Security and login → Developer mode. Enable it when
   ready to connect your own tools and review the warning.
4. Open https://platform.openai.com/settings/organization/tunnels . Verify the
   correct organization and ChatGPT workspace association. Creating a tunnel
   needs Read + Manage; running/selecting it needs Read + Use.
5. Get the official tunnel client from https://github.com/openai/tunnel-client/releases/latest .
   Use its official instructions for your platform. This project does not bundle
   or silently download the binary.
6. Supply its runtime key using a protected local secret mechanism. Never paste
   keys into a chat, README, issue, screenshot or shell command recorded in logs.
   Use a dedicated restricted key with only Tunnels Read + Use and an appropriate
   expiry. The official client expects `CONTROL_PLANE_API_KEY`; load it privately in your
   local environment. Do not include this variable in an MCP config committed to Git.
7. Configure a profile (replace the non-secret placeholders):

```sh
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile web-agent-bridge \
  --tunnel-id YOUR_TUNNEL_ID \
  --mcp-command 'node /ABSOLUTE/PATH/web-agent-bridge/src/cli.js --root /ABSOLUTE/PATH/demo --allow-host-exec'

tunnel-client doctor --profile web-agent-bridge --explain
tunnel-client run --profile web-agent-bridge
```

Use simple paths without spaces for the first test; if your paths contain spaces,
follow `tunnel-client help quickstart` for its command quoting rules. A standalone
wrapper script with a fixed command can avoid nested quoting.

8. In https://chatgpt.com/plugins , add a developer-mode app. Select Tunnel under
   Connection; choose the associated tunnel or enter its ID. Name it Web Agent Bridge. For this private stdio server, select No Authentication
   at the MCP application layer: access is authenticated by the private tunnel and
   its organization/workspace permissions. This is not permission to expose an
   unauthenticated public endpoint.
9. Inspect discovered tools. With `--allow-host-exec`, this version exposes 10
   tools. Without the flag it exposes 7; with `--read-only`, 5.
10. Start a new chat, attach the connection, and use the
    [acceptance prompt](../examples/acceptance-prompt.md). Keep write confirmations.
11. Check the actual generated files and command exit status on the host before
    connecting a real project. Stop the tunnel/server to revoke active access;
    remove the custom app/tunnel if no longer needed.

## Local HTTP option

If a trusted local tunnel needs HTTP instead of stdio:

```sh
node src/cli.js --root /tmp/bridge-demo --allow-host-exec --transport http --port 8788
```

Configure the private tunnel target as `http://127.0.0.1:8788/mcp` using the official
client's `--mcp-server-url` option. The private tunnel must send the local Host header
and no browser Origin. A 403 means those assumptions are not satisfied; inspect the
transport configuration instead of deleting the checks blindly. Prefer stdio first.

Public custom-plugin distribution is different from open-source distribution.
A public ChatGPT plugin needs a stable public HTTPS MCP endpoint and appropriate
authentication/review. This repository is a self-hosted runtime, not a hosted public
plugin. Its code can be open-sourced while each user runs a private instance.

## Troubleshooting

- No developer mode: check plan/workspace policy; the project cannot unlock it.
- Tunnel absent: check ChatGPT workspace association and Read + Use permission.
- No Platform access: account configuration is required; do not expose the local
  server publicly as an authentication workaround.
- Connector cannot discover tools: keep tunnel-client running; run its doctor;
  verify the exact Node executable, script path and workspace directory.
- No command tools: restart with `--allow-host-exec`, refresh app metadata and use
  a new chat. A prompt cannot override server startup policy.
- Model does not call tools: select the custom app and explicitly request
  `workspace_info`, then `list_files`. Model-specific support must be live-tested.
- Saved tasks still exist but job ID vanished: command state is in-memory; inspect
  files and rerun only the necessary verification, not arbitrary previous mutations.
