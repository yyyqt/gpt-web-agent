# Validation record

Date: 2026-09-22. Local platform: macOS arm64, Node.js 22.22.3, npm 10.9.8.

## Verified locally

- `npm run check`: **11/11 tests passed**.
- Real SDK clients initialized both stdio and Streamable HTTP transports,
  discovered 10 execution-enabled tools, created a buggy sample, observed a failed
  assertion, read the original hash, corrected the file and confirmed a passing run.
- Read-only tool discovery, traversal/private path/symlink/hardlink rejection,
  concurrent optimistic-write conflict, persistent task revision checks,
  command output cap, timeout, cancellation, concurrency cap, shutdown cleanup and a shutdown/start race regression.
- HTTP Origin/Host rejection, malformed JSON and method rejection.
- `npm audit --omit=dev`: **0 reported vulnerabilities** at validation time.
- Source ZIP extracted into a clean directory: `npm ci --ignore-scripts` and
  `npm run check` also passed (11/11).
- `npm pack --dry-run`: package file list reviewed; no local workspaces, account
  information, credentials, runtime logs or node_modules included.

One initial HTTP Host-header test failed because Node fetch did not transmit the
requested Host override. The test now uses node:http to send the actual header;
server rejection passed. No transport protection was removed to satisfy the test.

## Verified in ChatGPT web

- Developer mode enabled with user approval; a private official MCP tunnel was
  created and confirmed in the Platform UI.
- Official tunnel-client v0.0.14 for macOS arm64 downloaded; SHA-256 matched the
  official release manifest. Its profile targets a disposable demo workspace.
- Dedicated runtime key uses only Tunnels Read + Use. Local health/readiness
  endpoints both returned HTTP 200. No inference API permissions were granted.
- ChatGPT web discovered all 10 tools. The account's selected model was shown as
  **6 Pro** in the UI; this result does not establish support for every plan/model.
- The web model created `bridge-demo-acceptance/sum.cjs` with a subtraction bug
  and a Node assertion expecting `sum(2, 3) === 5`.
- After a one-time command approval, the first test returned **failed / exit 1**
  with `-1 !== 5`.
- It read the file, passed the original SHA-256 to `write_file`, changed the
  function to addition, and reran the same test: **succeeded / exit 0**.
- It saved task `bridge-demo-acceptance` as `completed`, revision 1. The actual
  files and checkpoint were inspected on disk; an independent local rerun of the
  generated test also exited **0**.
- Local audit metadata records the web-originated read/write/command/poll/task
  calls. Live IDs, conversation URLs, account identity and absolute workstation
  paths are intentionally excluded from this public report.

An initial connectivity turn briefly displayed `Internal Server Error`; later
workspace_info calls and the full acceptance run succeeded. This transient UI
failure was not reproduced or attributed to a specific component. It is not a
claim of production reliability or a long-duration soak test.

## Not verified / not provided

- Hosted public OAuth endpoint or ChatGPT plugin store distribution.
- Windows/WSL operation; Linux CI execution (workflow provided, not run remotely).
- Isolation against hostile local processes, a kernel sandbox, or an independent
  security audit.
- Long-running autonomous model execution, browser/SSH/database integrations.
- Cross-client/account permission isolation; this runtime is single-user.

Source is published at https://github.com/yyyqt/web-agent-bridge .
No npm or ChatGPT plugin-store publication is claimed.
