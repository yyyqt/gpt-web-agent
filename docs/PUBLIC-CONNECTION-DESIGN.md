# Public HTTPS connection: design gate

Current status: **not implemented**. The existing HTTP MCP endpoint listens only on `127.0.0.1` and has no user authentication. Do not forward it with cloudflared, ngrok, port mapping, or an unauthenticated reverse proxy.

## Why this exists

The private tunnel route requires Platform tunnel permission. A separate public HTTPS route could serve people who can add a ChatGPT developer-mode MCP connection but cannot create an OpenAI private tunnel. It does **not** grant ChatGPT developer-mode access to accounts that lack it. No percentage of affected users has been measured.

OpenAI connection requirements: https://developers.openai.com/plugins/deploy/connect-chatgpt
OpenAI authentication contract: https://developers.openai.com/plugins/build/auth

## Proposed architecture

- Keep the local executor bound to loopback. Add a separate public gateway or connector with a stable HTTPS URL; the gateway authenticates before forwarding **any** MCP request or tool discovery.
- Use an established OAuth 2.1 identity provider rather than inventing an authorization server. Follow MCP protected-resource metadata, authorization-server metadata, resource/audience binding, authorization-code + S256 PKCE, and either CIMD or DCR according to the provider and ChatGPT connection UI.
- Bind every issued token to one local executor and account. Verify signature, issuer, audience, expiry, scopes, and revocation on each request. Distinguish read, file write, and host-command scopes. Do not issue host-command scope by default.
- Require explicit local approval of the first connection and each permission expansion. The approval UI must be available only on the local machine and must display the requested scopes and destination account. Reject replayed, expired, or unpaired requests.
- Minimize exposure of the local executor with outbound-only transport to the gateway. A public HTTPS URL must not forward directly to the current loopback server; its Host and Origin checks do not provide authentication.
- Expire tokens, support immediate revocation, rotate signing keys, rate limit discovery and tool calls, bound request size and concurrency, and audit authentication and tool authorization outcomes without logging secrets or file contents.
- Document how to stop the connector and revoke all remote access even if ChatGPT or the gateway is unavailable.

## Release gate

Do not label this feature usable until a separate security review and live ChatGPT test cover OAuth discovery, linking, token refresh/expiry, revocation, cross-user isolation, denied scopes, unauthorized direct requests, localhost confirmation, and shell-disabled default. A local unit test or a tunnel smoke test is insufficient for this boundary.
