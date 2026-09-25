# GPT Web Agent

Let ChatGPT on the web read and edit local project files, run commands and tests, and save generated images to your computer. The web model calls the local tools directly. **Delegation to local Codex is separate and happens only when you enable it and explicitly request it.**

[中文](README.zh-CN.md) · [Step-by-step guide with screenshots](docs/GETTING-STARTED.md)

## Before you start

- A Mac or Linux computer with **Node.js 22 or newer**. Windows may work through WSL, but has not been tested on a real machine.
- A ChatGPT account that can enable developer mode and an OpenAI Platform account that shows **Create tunnel** on the [Tunnels page](https://platform.openai.com/settings/organization/tunnels). **A ChatGPT subscription alone does not grant Platform tunnel access.** Check this before installing. Personal accounts are the easiest route; company or school accounts may need an admin to enable access and associate the workspace.
- Each person installs the bridge on their own computer and connects with their own account. This repository is not a hosted service that connects to other people's computers. It is not yet published to npm or the ChatGPT plugin store.

## Install and connect

1. **Install the program.** Open a terminal and run `node --version` to check for `v22` or higher. If needed, follow the [official Node.js installation instructions](https://nodejs.org/en/download). Then run:

   ```sh
   npm install --global --ignore-scripts https://github.com/yyyqt/gpt-web-agent/archive/refs/tags/v0.5.5.tar.gz
   gpt-web-agent --help
   ```

   Seeing the help text means the program is installed. If npm reports `EACCES`, do not add `sudo`; use a Node installation that is writable by your user. See the [step-by-step guide](docs/GETTING-STARTED.md#1-open-a-terminal-and-install-the-program).

2. **Create your tunnel and runtime key.** On [Platform → Tunnels](https://platform.openai.com/settings/organization/tunnels), click **Create tunnel**, enter a name, and select your organization and the **ChatGPT workspaces** where you will use it. Copy the `tunnel_...` from the **ID** column after creation. Then open [Platform → API keys](https://platform.openai.com/settings/organization/api-keys), click **Create new secret key**, choose a project and expiry, set permissions to **Restricted**, select only **Read** and **Use** under **Tunnels**, and leave other permissions at **None**. Keep the displayed `sk-...` private; **never paste it into a chat or commit it to Git**. [Screenshots for this step](docs/GETTING-STARTED.md#2-create-a-tunnel-and-a-key-in-openai-platform)

3. **Start the connection on your computer.** Run:

   ```sh
   gpt-web-agent connect
   ```

   On the first run, enter the tunnel ID, whether to allow local commands, and the runtime key. Type `YES` at the second prompt if you want GPT to run tests; press Return without typing it if you only need file tools. **Local commands have your OS user's permissions and are not sandboxed.** The key is hidden while you paste it. Keep the terminal running after you see `tunnel-client started`. On later starts, use the same command; it normally reuses the saved key.

4. **Add the connection in ChatGPT.** Click your profile picture → **Settings → Security and login**, and enable **Developer mode**. Open the [plugins page](https://chatgpt.com/plugins), then choose **+ → Create app → Create MCP app**. Name it `GPT Web Agent` or choose your own name. Select **Tunnel** and the tunnel you created, choose **No Authentication**, acknowledge the risk checkbox, and create the app. The private tunnel relies on organization and workspace access controls; **never expose an unauthenticated local server directly to the public internet**. In a new chat, use the **+** menu beside the message box to search for and select your connection. [Screenshots for this step](docs/GETTING-STARTED.md#4-add-your-connection-in-chatgpt)

## Verify that it reaches your computer

In a chat where your connection is **selected**, send:

> Call workspace_info and tell me which folder you are connected to and whether you can run commands. Then list the first 10 items in my Documents folder. Only look; do not change files.

Check that it **actually calls tools** and lists files from your computer. Seeing `tunnel-client started` locally does not prove that ChatGPT is connected. For a write-and-test check, follow the [full first-run test](docs/GETTING-STARTED.md#5-check-that-it-really-reaches-your-computer), which only changes a new demo folder.

After starting your computer, run `gpt-web-agent connect`, keep the computer online, and select the connection in your ChatGPT chat. For example: “Look at my XXX project and suggest improvements without changing anything”; then “Fix the first issue and run tests, preserving my existing changes.” Projects do not need to be registered in advance; ask GPT to confirm if it cannot identify one. Closing the web page does not stop commands **already dispatched** locally; later steps still depend on whether the web task continues reasoning.

## Troubleshooting and more documentation

| What you see | Check first |
| --- | --- |
| No Create tunnel or developer mode | Check Platform and ChatGPT account/organization permissions. Ask the admin for a company or school account. A ChatGPT subscription does not grant tunnel access |
| Your tunnel is missing in ChatGPT | Check that you associated the current ChatGPT workspace when creating it; you can also enter the tunnel ID in the app form |
| `gpt-web-agent: command not found` | Reopen the terminal, check `node --version`, and rerun the install command above while reading any error |
| The terminal is running, but GPT only describes a plan | Select the connection from the chat's **+** menu, then ask it to call `workspace_info` |
| Connection lost after restart or key expiry | Run `gpt-web-agent connect` again; for an expired key, first run `gpt-web-agent set-key` |

See the [illustrated setup guide](docs/GETTING-STARTED.md), [image imports and partial edits](docs/IMAGES-AND-EDITS.md), [technical reference](docs/REFERENCE.md), [security notes](SECURITY.md), [validation record](docs/VALIDATION.md), and [contribution guide](CONTRIBUTING.md). Automatic startup, Codex delegation, and running from source are optional advanced features.
