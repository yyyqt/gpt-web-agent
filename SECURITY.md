# Security model

This is an experimental single-user local tool runtime, **not a sandbox** and not
a multi-tenant hosted execution service.

## Boundaries

- In fixed-root mode, file tools accept relative paths under one configured real directory; reject
  traversal, symbolic links, hard-linked files and common secret-like names.
- These checks prevent straightforward path escapes. They do not provide a
  race-free kernel filesystem sandbox. A hostile process with write access to
  the workspace can race path checks, rename directories or tamper with state.
  Do not use a workspace controlled by an adversarial local process.
- The filename blocklist is not comprehensive secret detection. A credential in
  an ordinary source file can still be read and returned to the remote model.
  Choose the workspace carefully and inspect the data it contains.
- Shell execution is absent unless `--allow-host-exec` is provided. With that flag,
  commands have the current OS user's privileges, unrestricted filesystem/network
  access, and can bypass all file-tool restrictions. `HOME` is set to the workspace
  and most environment variables are not inherited, but absolute paths, PATH
  executables, network credentials and same-user processes are still reachable.
- Command annotations are hints to the client, not server-side authorization.
  Keep the client's normal write-action confirmations enabled. This server does
  not implement per-command local human approval.
- SIGKILL targets the process group on macOS/Linux; Windows uses `taskkill /T /F`
  and serializes process-tree cleanup during shutdown. Programs can
  intentionally escape groups or daemonize. No comprehensive descendant tracking,
  CPU/memory quotas, network sandbox or durable process recovery is implemented.
- HTTP listens only on 127.0.0.1, rejects Origin headers and unexpected Host values,
  limits request body size, and exposes no CORS headers. These are not authentication.
  Local processes/users that can reach the listener have access to the same tools.
  Never forward this listener directly to a public unauthenticated URL.
- Prefer stdio behind an authenticated private tunnel. The tunnel owner must
  restrict workspace access; do not share the tunnel with untrusted accounts.

## State and logs

`.web-agent/tasks.json` stores user/model-authored checkpoint notes; do not put
secrets there. `.web-agent/audit.jsonl` records time, tool name, start/outcome and
error code, not raw tool arguments or file/command output. This is operational
metadata, not a tamper-proof or complete forensic audit. The local user and opted-in
shell can change it. Runtime failures are returned explicitly; a final audit error
after a successful mutation warns the client not to blindly retry.

Job result files store bounded stdout/stderr and may contain sensitive output.
They are created with mode 600 where POSIX modes apply, retained for up to 100 jobs, and never belong in Git.
`--allow-codex` separately opts into local Codex with real user HOME/login state;
it uses workspace-write, not the host shell's unrestricted mode. The bridge does
not strengthen or replace Codex's own sandbox. Project instructions can affect it.
Only run trusted workspaces. Do not print credentials in job output.

State is local and is not automatically uploaded. Tool results and task notes
returned to a remote client become available to that client's model/provider.
Keep `.web-agent/`, `.env`, tunnel configuration and all real workspace data out of
source archives and public repositories. Log rotation is not currently automatic.

## Reporting

Do not file credentials, private project content, exploit access tokens or live
endpoints in public issues. Before public release, the maintainer should enable
GitHub private vulnerability reporting and publish the reporting link here.
Until then, share only a sanitized description privately with the maintainer.
There is no independent security audit claim.

Image import accepts HTTPS OpenAI user-content hosts plus the exact ChatGPT file
parameter host `oaisdmntprnorthcentralus.blob.core.windows.net` and
`oaisdmntprcentralus.blob.core.windows.net`, and checks every redirect;
it does not accept arbitrary network URLs or access browser credentials. Image
bytes are bounded and completely decoded before writing. Decoder dependencies
must stay patched. Original image metadata is retained. File references and signed
URLs are untrusted input, not authorization to modify a different path or project.

## Optional local paths mode

`--dynamic-projects` permits absolute paths outside any one project using the OS user permissions. The home directory is a relative-path base, not an access boundary. Existing private-name, traversal, symlink and hardlink checks remain; they are not a sandbox. File tools may now reach non-secret files across projects. Shell already had host-wide permissions. No mutable current-project setting is shared across conversations.
