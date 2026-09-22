# Contributing

Keep tools small and explicit. Add meaningful integration tests when changing
execution, permissions, filesystem boundaries or transport behavior. Run:

```sh
npm ci --ignore-scripts
npm run check
npm audit --omit=dev
npm pack --dry-run
```

Do not add model/API credentials, generated workspaces, task state, conversation
captures or real business data. Maintain the English and Chinese quick starts.
Use structured errors and explicit truncation; do not silently ignore failures.
Never describe path checks or a command allowlist as a sandbox.

Before a public release, choose the repository/package name, verify npm name
ownership if publishing there, enable private security reporting, and complete a
real ChatGPT acceptance run. Do not publish an `npx` command before a package exists.
