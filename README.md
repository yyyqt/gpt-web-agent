# GPT Web Agent

Let ChatGPT on the web read and edit local project files, run tests, and save generated images to your computer. The web model works directly through a private local bridge; delegating to local Codex is optional.

**[Start here: step-by-step setup guide with screenshots](docs/GETTING-STARTED.md)** · [中文首页](README.zh-CN.md)

## Three steps

1. Install Node.js 22 or newer, then install this project from the versioned GitHub tag:

   ```sh
   npm install --global --ignore-scripts https://github.com/yyyqt/gpt-web-agent/archive/refs/tags/v0.5.5.tar.gz
   ```

2. Create your own private tunnel and runtime key in OpenAI Platform, then run `gpt-web-agent connect` on your computer. The first run asks for the tunnel ID, whether to enable local shell commands, and the key. Later runs use the saved configuration.
3. Enable developer mode in ChatGPT, create your own MCP app using **Tunnel**, and select it in a chat.

Everyone installs it on their own computer and connects with their own account. The guide uses a **personal** ChatGPT and Platform account; company or school accounts usually need an admin to enable developer mode and tunnels. The current release is experimental and is not published to npm or the ChatGPT plugin store. The [setup guide](docs/GETTING-STARTED.md) shows every screen and the first connection check. For implementation details, see the [technical reference](docs/REFERENCE.md), [security notes](SECURITY.md), and [validation record](docs/VALIDATION.md).
