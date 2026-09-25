# 从零开始：让 ChatGPT 网页操作自己的电脑

完成本教程后，你可以在 ChatGPT 里说“找到我的 XXX 项目，帮我修改并测试”。**每个人都要在自己的电脑上安装，用自己的账户创建连接**；GitHub 仓库不是一个连接所有人电脑的在线服务。

先看能否使用这条路线：你需要 macOS 或 Linux 电脑、Node.js 22 或更新版本、ChatGPT 开发者模式，以及 OpenAI Platform 的私有隧道权限。Windows 用户可尝试 WSL，但本项目尚未实机验收。ChatGPT 订阅和 Platform 隧道权限是两件事；没有隧道权限时，安装程序也无法替你开通。[OpenAI 官方说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

## 1. 打开终端，安装 Node.js 和本项目

Mac 上按 **Command（⌘）+ 空格**，输入 **Terminal** 或“终端”，按回车。Linux 打开系统的终端程序。

在终端输入 `node --version` 和 `npm --version`。如果都能显示版本，且 Node 是 **22 或更高**，继续下一步。还没有 Node 时，按 [Node.js 官方下载页](https://nodejs.org/en/download)的指引安装；Mac 上已有 Homebrew 的人也可以运行 `brew install node`。安装后重新打开终端，再检查版本。

复制下面整条命令到终端并回车。它从这个 GitHub 仓库的固定版本安装，不需要先学会 Git：

```sh
npm install --global --ignore-scripts https://github.com/yyyqt/gpt-web-agent/archive/refs/tags/v0.5.5.tar.gz
```

然后运行 `gpt-web-agent --help`。能看到 `connect` 等命令，就说明**程序已安装**；此时还没有连接 ChatGPT。如果全局安装报 `EACCES`，不要加 `sudo`；按上方 Node 下载页选择版本管理器安装 Node，再重试。

## 2. 创建自己的隧道和运行 key

隧道是 ChatGPT 与这台电脑之间的**私有通道**。打开 [OpenAI Platform → Tunnels](https://platform.openai.com/settings/organization/tunnels)，点击右上角 **Create tunnel**。填写名称和简介，选择自己的组织，以及要使用的 **ChatGPT workspaces**，再创建。

![Platform 的 Tunnels 页面：创建入口和 ID 所在列，私人信息已遮盖](assets/platform-tunnels-list.png)

![创建隧道表单：选择组织和 ChatGPT 工作区，组织 ID 已遮盖](assets/platform-create-tunnel.png)

创建后回到列表，复制 **ID** 列显示的 `tunnel_...`，下一步会用到。图中的 `Example Tunnel` 和遮盖后的 ID 仅用于标示位置。创建或修改隧道的账户需要 **Tunnels Read + Manage**；运行和在 ChatGPT 中选择隧道需要 **Read + Use**。如果看不到创建按钮或隧道，请先检查当前 Platform 组织与权限，不要猜一个 ID。[权限说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#permissions-and-access)

打开 [OpenAI Platform → API keys](https://platform.openai.com/settings/organization/api-keys)，点击右上角 **Create new secret key**，为本机隧道创建专用 key。按页面要求选择项目和有效期；在 **Permissions** 选 **Restricted**，向下滚动到 **Tunnels**，勾选 **Read** 和 **Use**，其余权限保持 **None**。运行 key 的账户或组织角色也需要 Tunnels Read + Use。创建后先留在页面，等第 3 步提示输入时再粘贴。**不要把 key 发进聊天、Issue 或 Git**；key 只显示一次的话，请妥善保管。

![创建 API key 时只为 Tunnels 勾选 Read 和 Use，无私人 key 信息](assets/platform-api-key-tunnels-permissions.png)

## 3. 运行一次 `connect`

在终端执行：

```sh
gpt-web-agent connect
```

它会依次问三件事：

1. **隧道 ID**：粘贴第 2 步的 `tunnel_...`。
2. **是否允许本机命令**：想让 GPT 跑测试，就输入大写 `YES` 并回车；只想读写文件，就直接回车。允许后，命令拥有你当前电脑用户的权限，请只连接你信任的应用。
3. **运行 key**：粘贴第 2 步的 key 并回车。**屏幕上不会出现字符，这是正常的。** key 存在 macOS 钥匙串或 Linux 的 Secret Service，不写进仓库。

第一次运行可能会自动下载并校验 OpenAI 官方 `tunnel-client`。下面是**省略了 ID、key 和细节日志的输出示例**；具体行可能随官方客户端版本不同：

```text
Your own tunnel_... ID: [粘贴自己的 ID]
Downloading the official OpenAI tunnel-client and checking SHA-256...
Enable host shell commands? ... Type YES to enable: YES
Paste tunnel runtime key (hidden), then Enter:
Configured. Starting the tunnel now...
...
"msg":"poller started"
"msg":"🟢 tunnel-client started"
```

看到 `tunnel-client started` 后保持终端开着，再去第 4 步。它只证明**本机隧道已启动**；是否真的连上 ChatGPT，还要做第 5 步的网页验收。如果终端退出或报错，先看底部“常见卡点”。以后重启电脑后仍运行同一条 `gpt-web-agent connect`，通常不必再输入 key。运行 key 过期时用 `gpt-web-agent set-key` 更新。

## 4. 在 ChatGPT 网页创建自己的连接

在 [ChatGPT](https://chatgpt.com/) 点击左下角头像 → **设置**。

![头像菜单中的设置入口](assets/chatgpt-open-settings.png)

在设置左侧选 **账户安全与登录**，向下找到 **开发者模式**，打开“开发人员模式”。如果根本没有这个选项，先检查账户或工作区权限。[OpenAI 官方接入步骤](https://developers.openai.com/plugins/deploy/connect-chatgpt#enable-developer-mode)

![账户安全与登录中的开发者模式开关](assets/chatgpt-developer-mode.png)

保持第 3 步的终端运行，然后打开 [ChatGPT 插件页](https://chatgpt.com/plugins)。点击搜索框右侧的 **+** → **创建应用** → **创建 MCP 应用**。当前界面里，“创建插件”会走另一条流程；这里要选的是“创建应用”。

![插件页右上角的创建应用入口](assets/chatgpt-create-app-menu.png)

弹出“新插件”窗口后，点击左下角的 **创建 MCP 应用**。

![在新插件窗口选择创建 MCP 应用](assets/chatgpt-create-mcp-choice.png)

在表单中把名称填为 **GPT Web Agent**，连接方式选 **隧道（Tunnel）**，从“可用隧道”选第 2 步创建的隧道；如果列表没有，可用“改用隧道 ID”。身份验证选 **无身份验证（No Authentication）**，因为此例通过私有隧道控制连接访问。**不要把无认证的本地服务公开到互联网。** 阅读页面的风险说明，确认连接的是你自己的服务，再点“创建”。

![新建 MCP 应用：名称、隧道和无身份验证](assets/chatgpt-create-mcp-app.png)

创建后检查工具列表至少有 `workspace_info`、`read_file`、`write_file`，启用本机命令时还应有 `start_command`。没有的话先确认终端还在运行，再刷新连接的工具。

新建聊天，点击输入框旁的 **+**，输入**你刚才填写的连接名称**，在“插件”搜索结果中点它。选中后输入框会出现连接标签，再发送任务。下图用作者账户的旧名称 **Web Agent Bridge** 演示搜索位置；你应搜索自己创建的 **GPT Web Agent**。

![在聊天输入框旁搜索并选择自己的连接](assets/chatgpt-select-plugin.png)

## 5. 第一次确认真的连到了自己的电脑

先在选中连接的聊天里发一条**只读**请求：

> 调用 workspace_info，报告 workspace、absolutePaths、fixedProject 和 hostExecution。然后列出我的 Documents 目录前 10 项。不要修改文件。

返回的目录应是**你自己的电脑**，并且 `absolutePaths=true`、`fixedProject=false`。第 3 步输入过 `YES` 才应看到 `hostExecution=true`；直接回车则是 `false`。如果只给你操作建议，没有实际调用工具，就还没验收通过。

只有第 3 步输入了 `YES`，才继续完整测试：

> 在我的 Documents 下新建一个名称带时间戳的 gpt-web-agent-demo 目录，不覆盖旧目录。在里面创建一个有加法错误的 JavaScript 函数和对应测试，实际运行测试并记录失败退出码；读取文件后用局部补丁修复，再运行测试，报告最终退出码和文件绝对路径。只操作这个新目录，不委托 Codex，不提交、不推送、不部署。

在电脑上打开返回的目录，确认文件确实存在。**“命令已启动”不等于测试通过；要看到最终退出码。**

## 以后怎么用

每次电脑重启或连接停止，在终端运行 `gpt-web-agent connect`。电脑必须开机联网，本地服务也必须运行。关闭网页后，已派发的本机命令可继续；网页是否继续推理下一步取决于 ChatGPT 当前任务状态。示例：

- “看看我的 XXX 项目有什么优化空间，先只分析。”
- “把刚才发现的第一个问题修复并测试，保留原有改动，不提交、不部署。”
- “再看看 YYY 项目。” 不用先登记或切换项目；目标不清楚时让 GPT 确认。
- “把刚才生成的图片原图放到 XXX 项目的 public/images/example.png。” 生图和导入按两步完成。

默认由网页模型直接操作工具。只有你另外安装并登录 Codex、启用 `--allow-codex`，又明确要求委托时，才会用本地 Codex。

### 进阶：登录后自动启动

macOS 上，先在能正常运行 `node` 和 `npm` 的终端中完成首次连接，再运行 `gpt-web-agent install-service`。它会生成不含 key 的登录启动配置；按命令输出执行一次 `launchctl bootstrap`，下次登录会自动启动。Linux 暂无自动安装命令，见[后台运行说明](BACKGROUND.md)。这一步**不是第一次连接的必需步骤**。

### 常见卡点

| 现象 | 先检查什么 |
| --- | --- |
| 没有开发者模式、Tunnel 或 Platform 创建按钮 | 账户、工作区和 Platform 组织的权限；ChatGPT 订阅本身不保证可用 |
| ChatGPT 找不到隧道 | 是否把目标 ChatGPT 工作区关联到隧道；是否有 Tunnels Read + Use |
| 终端报 `gpt-web-agent: command not found` | `npm --version` 是否可用，全局 npm 安装目录是否在 PATH |
| 终端已启动，网页只讲方案 | 本条聊天是否从 `+` 菜单选中了你创建的连接；先让它调用 `workspace_info` |
| 重启后失联 | 重新运行 `gpt-web-agent connect`；key 过期则先运行 `gpt-web-agent set-key` |
| 图片导入失败 | 需要真实生成文件或附件引用，详见[图片说明](IMAGES-AND-EDITS.md) |

更新 GitHub 安装版：先在[仓库标签页](https://github.com/yyyqt/gpt-web-agent/tags)确认新版本，把第 1 步命令中的 `v0.5.5` 改成那个 tag 后重新运行，启动 `gpt-web-agent connect`，并刷新 ChatGPT 工具。源代码安装、运行参数和实现细节见[技术参考](REFERENCE.zh-CN.md)。
