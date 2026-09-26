# Validation record

Privacy-cropped onboarding screenshots in `docs/assets/` show the current Platform tunnel form and key-permissions picker, plus the ChatGPT settings path, developer-mode switch, MCP app creation form, and chat plugin picker. The Platform images mask or replace private organization, workspace, tunnel, account, and key identifiers. The forms used for the screenshots were cancelled without creating a new tunnel or key. The earlier live ChatGPT test evidence is recorded below in text; these setup screenshots do not themselves prove command execution.

On 2026-09-25, the logged-in Chinese ChatGPT interface was rechecked: Settings contains a Plugins tab, opening an installed connection there shows separate read/write tool lists, and the new MCP app form contains the checkbox “我了解并希望继续”. The chat picker screenshot now shows the real plus menu and search prompt without the author's old connection name. No new ChatGPT connection was created during this documentation check.

## Native Windows branch validation (2026-09-26)

- Local platform: Windows x64, Node.js 23.8.0, npm 10.9.2. Final `npm run check` passed with 36 tests: 29 passed, 7 platform-specific tests skipped, and 0 failed. The suite includes real stdio and HTTP MCP edit/fail/fix/pass loops, native absolute paths, UTF-8 command output, native exit-code propagation, timeout/cancellation, DPAPI roundtrip, the generated Windows stdio wrapper, and a PowerShell-safe setup start hint.
- `npm audit --omit=dev` reported 0 vulnerabilities and `npm pack --dry-run` listed the expected 44 package files without creating or publishing a tarball.
- The real official Windows x64 `tunnel-client` release was downloaded through the production downloader, checked against `SHA256SUMS.txt`, extracted with the Windows code path, and executed successfully with `help quickstart`. The installed executable was 22,523,904 bytes. This proves the Windows release path, not an authenticated tunnel by itself.
- An initial ChatGPT-originated read-only `workspace_info` call reached the existing macOS runtime (`/Users/<user>`), not this Windows machine. No file or command actions were requested against that runtime. With user approval, a separate Windows tunnel and development-only ChatGPT connection, `Web Agent Bridge — Windows`, were created without changing the Mac connection. Capability discovery now includes `platform` and `architecture` to distinguish the connected host reliably.
- The authenticated official client (0.0.15) started with a runtime key encrypted locally by DPAPI. Its local `/readyz` returned HTTP 200. The key has only Tunnels Read/Use and a seven-day expiry; no plaintext key was written to the repository, profile, task report, or tool transcript. The tunnel profile references the key through `env:CONTROL_PLANE_API_KEY`.
- In ChatGPT Chat with Pro selected and the Windows connection attached, `workspace_info` returned `platform=win32`, `architecture=x64`, `hostExecution=true`, `workspace=C:\\Users\\<user>`, `sandboxed=false`, and `codexEnabled=false`. ChatGPT created `sum.mjs` and `sum.test.mjs` in a new disposable demo directory using `write_file`, then called `start_command` for `node --test sum.test.mjs` and polled to completion. First job `b8b81f4e-292c-4dbc-a165-0954638e64c9`: exit 1, 0 passed / 2 failed. ChatGPT read the source hash and used `patch_file` to change subtraction to addition. Second job `95c60748-9f56-4572-9757-141d0e151ec6`: exit 0, 2 passed / 0 failed. The test file was not changed. Local file reads, SHA-256 checks, persisted job records, and an independent local rerun confirmed the web results.
- Fixed source SHA-256: `25457087337699136d7c54a0d6e713b53ff7b22302a9b31511a9598b1988e52b`. ChatGPT-originated native environment job `e242c845-c292-4e2f-98a2-d9f3902a1137` exited 0 and produced `win32`, `x64`, the Windows demo cwd, and intact `Windows 原生中文😀`. ChatGPT read complete output pages and saved checkpoint `windows-native-acceptance-20260926-95c60748` as completed, revision 1; local task and audit records confirm it.
- Core Windows file/command/test web acceptance passed. No commit, push, merge, npm publication, or public ChatGPT distribution was performed. Windows login-time service installation, native Codex delegation, long-duration reliability, and Windows CI execution on GitHub remain unverified; the CI matrix was edited locally only.
- With the Windows client still running, a separate ChatGPT conversation attached to the original Mac connection returned `/Users/<user>` and `hostExecution=true` from a single read-only `workspace_info` call. No Mac file or command actions were requested. This checks independent simultaneous connections, not automatic natural-language host switching.

## Version 0.5.5 setup retry fix (2026-09-25)

- A first setup can stop after the official client has downloaded, before the tunnel profile is ready. `locateTunnelClient` now reuses the managed binary on retry after checking that it is a regular executable file and that `help quickstart` succeeds. A broken file produces an explicit error instead of being silently reused.
- `npm run check`: 31/31 tests pass, including download-once/retry and broken-managed-binary cases. The install guide now points to a versioned GitHub tag instead of mutable `main`.

## Version 0.5.4 simplified onboarding (2026-09-25)

- Installing the GitHub `main` source tarball through npm succeeded in a clean temporary prefix without Git; the installed CLI reported version 0.5.3, which was the published `main` at the time of that check. A locally packed 0.5.4 archive installed in a clean prefix, displayed the new `connect` command, and loaded `sharp` with `--ignore-scripts`.
- The new downloader fetched the real OpenAI `tunnel-client` v0.0.15 macOS arm64 release, checked its `SHA256SUMS.txt` value, extracted the binary and installed it in a private temporary directory. This checks the download path, not a fresh end-to-end account connection.
- `npm run check`: 30/30 tests pass, including a substituted release URL rejection, a bad checksum rejection before install, and reuse of an existing profile through `connect`.

## Version 0.5.3 validation (2026-09-25)

- `set-key` updates the saved credential without rewriting the tunnel profile, wrapper, or path record. The macOS setup and rotation tests pass 164-byte synthetic keys through an interactive pseudo-terminal and verify the full value reached the Keychain command interpreter over stdin.
- A real 164-byte runtime key exposed a macOS `security -w` prompt truncation at 128 bytes. After switching to `security -i` with `-X` data sent only on stdin, the stored Keychain value matched the original key byte-for-byte. During storage, the key was not placed in argv, environment variables, logs, or repository files. The existing `start` flow supplies it to the tunnel process through `CONTROL_PLANE_API_KEY` at runtime.
- With the real private tunnel, `tunnel-client doctor` passed; `gpt-web-agent start` returned HTTP 200 from `/readyz` without a credential error. The macOS LaunchAgent ran with the saved PATH, also returned HTTP 200 from `/readyz`, and `npm test` passed under that exact PATH in a minimal environment. The temporary LaunchAgent was then unloaded and removed; the pre-existing manual tunnel remained running.
- In a fresh ChatGPT 6 Pro chat, the installed Web Agent Bridge reached the new runtime: `workspace_info` reported `hostExecution=true`, `codexEnabled=false`, and workspace `/Users/<user>`. ChatGPT then called `start_command` for `npm test` in this public repository and polled to completion. The web response reported `succeeded`, exit code 0, and 28 passing tests; the new runtime's local job record independently confirms the same result. The temporary LaunchAgent was unloaded and removed after the test; the pre-existing manual tunnel remains running.
- npm publication remains unavailable because the local npm CLI is not authenticated. The `gpt-web-agent` npm package name returned 404 at validation time, but availability may change before publication.

## Version 0.5.2 validation (2026-09-25)

- `npm run check`: 27/27 tests passed on macOS. The setup test runs the real CLI in a pseudo-terminal with a home directory containing spaces and a fake tunnel client; it checks the exact quoted `--mcp-command` and executable wrapper. The LaunchAgent test checks the captured PATH and validates the generated plist with `plutil`.
- The installed official `tunnel-client` v0.0.14 was run against temporary, credential-free profiles: an unquoted script path containing spaces failed stdio preflight because the executable was split at the first space; the quoted path passed `init` and produced a profile. This verifies local profile generation, not a live authenticated tunnel or ChatGPT connection.
- No existing LaunchAgent was present on the development machine, so login-time startup was not live-tested.

Date: 2026-09-22. Local platform: macOS arm64, Node.js 22.22.3, npm 10.9.8.

## Version 0.3 validation

- 17 automated tests pass, including four active jobs plus queued fifth, FIFO dispatch,
  queued cancellation, shutdown cleanup and timeout starting only on launch.
- Codex remains optional. Explicit delegation acknowledgement is now required;
  direct execution is the default in server instructions and capability discovery.
- Image generation/import has not been implemented or live-validated.

## Version 0.2 validation (historical)

- 15 local automated tests pass, including HTTP disconnect/reconnect while a job
  continues, saved result reload, interrupted-state recovery, configurable limits,
  missing Codex executable errors, and stdin prompt handling without shell expansion.
- ChatGPT refreshed the private connection and discovered `start_codex` and
  `list_commands`, plus the configured 7200-second limit.
- In a new ChatGPT web Work conversation, the model called `workspace_info`,
  confirmed Codex was enabled, invoked `start_codex` once and returned its job ID.
- The acceptance browser tab was then closed. At closure the local job was still
  running and RESULT.md did not exist. It completed more than a minute after tab
  closure with exit 0. No browser was driving the Codex task during that interval.
- Real installed Codex CLI (existing ChatGPT login, workspace-write sandbox) ran a
  delayed synthetic task: created subtraction bug, observed assertion exit 1,
  fixed addition, reran exit 0 and wrote a result report. Captured CLI execution
  output includes both the failed assertion and passing result.
- Independent host rerun of the resulting Node test passed.
- This proves dispatched local Codex work can finish after its browser tab closes.
  It does not prove all ordinary ChatGPT cloud turns continue after tab closure,
  nor survival across host sleep/reboot/runtime shutdown.

## Original 0.1 validation (historical)

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

## Original 0.1 ChatGPT web validation (historical)

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
- Windows login-time service installation and native Windows Codex delegation. The core file and PowerShell command workflow is covered above.
- Isolation against hostile local processes, a kernel sandbox, or an independent
  security audit.
- Day-long soak tests, reboot-resuming execution, browser/SSH/database integrations.
- Cross-client/account permission isolation; this runtime is single-user.

Source is published at https://github.com/yyyqt/gpt-web-agent .
No npm or ChatGPT plugin-store publication is claimed.

## 0.4.0 images, patches and output pages — 2026-09-22

21 automated tests pass, including actual stdio and HTTP tool calls for patches,
status-only polling and output pagination; exact matching/conflicts/overlaps;
Unicode pages and persisted output; image full decoding, malformed image rejection,
extension mismatch, download URL/redirect/size validation and atomic import conflicts.

Live ChatGPT Work validation (native image generation, no Codex delegation):
- Native blue-moon image was directly passed to `import_image` and saved in a new
  `bridge-acceptance/moon.png` inside the configured project. No manual transfer.
- Original PNG: 1254×1254, 1,183,182 bytes; visually inspected locally.
- SHA-256: `ba046232c4b03408a54ba8a0978f18d63fb1d9e90e1968089f8645eea52a77ab`.
- `patch_file` changed a newly created sample from `alpha\nbeta` to `alpha\ngamma`;
  verified by both web read-back and local file read.
- A printf job exited 0; output pages were `中文😀` (offset0→4, hasMore=true)
  and `\n分页🌙\n` (4→10, hasMore=false). No broken Unicode.
- Existing business files were not targets of this acceptance test; no project
  commit, deployment, or publication was performed.

Other ChatGPT models/interfaces may expose different image/file capabilities.
The bridge only receives files and does not meter or guarantee account image quota.

## 0.4.1 Chat / 6 Pro image handoff — 2026-09-22

Chat with 6 Pro selected successfully generated a golden-star image. Initial
imports failed because the runtime only allowed oaiusercontent.com, whereas
ChatGPT file parameters supplied signed Azure Blob URLs. Observed exact hosts:
`oaisdmntprcentralus.blob.core.windows.net` (original library image) and
`oaisdmntprnorthcentralus.blob.core.windows.net` (exported attachment).
Both exact accounts are now allowed; arbitrary Azure accounts remain denied.
Diagnostics expose only protocol/hostname, never signed paths or query tokens.

After the fix, a fresh Chat conversation with 6 Pro selected and the bridge
explicitly attached retrieved the already-generated original from the user's
ChatGPT library and imported it successfully. No Work-mode switch, Codex
 delegation, image API call, or manual download/upload was used. Generation and
import were separate requests; a one-prompt combined workflow is not established.

Local result: `bridge-acceptance/chat-6pro-star.png`, 1254×1254 PNG, 1,636,459 bytes.
SHA-256: `3dde2021814af40e9120a5e27bba177348d9684a7c209b950b4078e34c6c1e22`.
The local file was visually inspected and its digest matched the tool response.
21 automated tests pass, including exact-host acceptance, untrusted Azure account
and lookalike-host rejection, signed-query redaction, and real PNG decoding/import.

## 0.5.0 local paths mode

`npm run check`: 22 tests pass. New MCP transport integration verifies that no project parameter or switching tool is required, relative paths use the reported home directory, absolute paths read/write/patch/search two independent directories, commands run in their own cwd and share one concurrency cap. Private files, runtime state, parent traversal and symlinks remain rejected. Existing fixed-root tests still pass. Local tunnel configured with `--dynamic-projects`; no business project code was changed for this upgrade. ChatGPT tool refresh and live verification are recorded separately below.

## Repository integration check (2026-09-26)

The Windows task history patches were reconstructed on macOS after the remote synchronization turn did not return a commit. `npm run check` passed: 36 total, 34 passed, 2 Windows-only tests skipped, 0 failed. Windows results above are from the referenced Windows task, not a new Mac-hosted Windows run. The Windows source changes are not yet an npm release.

## 0.6.0 release checks (2026-09-26)

- The Windows CI reconnect test previously assumed a job finished after 1.2 seconds. It now polls to a bounded deadline and cleans up the complete Windows server process tree. Workflow jobs have a five-minute timeout so failures cannot silently hang indefinitely.
- Release commit `ba0a9bb` passed all six GitHub CI combinations: macOS, Linux and Windows with Node 22 and 24. Each includes checks, dependency audit and package dry-run. Workflow: https://github.com/yyyqt/gpt-web-agent/actions/runs/36217957454.
- npm accepted `gpt-web-agent@0.6.0` after browser 2FA; processing delayed registry visibility for several minutes. The official registry subsequently returned version 0.6.0 and its tarball, and the latest tag now resolves to 0.6.0. Git tag `v0.6.0` points to the release commit.
- Native Windows autostart and Codex delegation remain unavailable; Windows ARM64 has asset-selection coverage but no real-machine acceptance.
