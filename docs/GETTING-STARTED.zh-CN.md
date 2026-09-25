# 从零开始：让 ChatGPT 网页操作自己的电脑

[English](GETTING-STARTED.md)

完成本教程后，你可以在 ChatGPT 里说“找到我的 XXX 项目，帮我修改并测试”，GPT 就会直接在你的电脑上改文件、跑测试。

**每个人都在自己的电脑上安装，用自己的账户连接**，不需要找作者要账号，也不会连到别人的电脑。

**你需要：**

- 一台 Mac 或 Linux 电脑（Windows 可以试试 WSL，尚未实测）。
- 一个 **个人** ChatGPT 账户，以及同一账户登录的 [OpenAI Platform](https://platform.openai.com/)。
- 大约 15 分钟。

> 请用**个人账户**操作。公司或学校的 ChatGPT 账户，开发者模式和隧道通常要管理员开通；个人 Platform 里建的隧道也不会自动出现在公司的 ChatGPT 里。[官方说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#permissions-and-access)

## 1. 打开终端，安装程序

Mac 上按 **Command（⌘）+ 空格**，输入 **终端**（或 Terminal），按回车。Linux 打开系统自带的终端。

在终端输入下面这行并回车，检查有没有装 Node.js：

```sh
node --version
```

显示 `v22` 或更大的数字就可以继续。显示“command not found”或版本太低，就先装 Node.js：已经装过 Homebrew 的 Mac 运行 `brew install node`；否则到 [Node.js 下载页](https://nodejs.org/en/download)按指引安装。装完**关掉终端再重新打开**，再检查一次。

然后复制下面整条命令到终端并回车，安装本程序：

```sh
npm install --global --ignore-scripts https://github.com/yyyqt/gpt-web-agent/archive/refs/tags/v0.5.5.tar.gz
```

最后运行 `gpt-web-agent --help`，能看到一串用法说明就是**安装成功**。此时还没连接 ChatGPT。

> 如果安装时报 `EACCES` 或 permission denied：**不要加 `sudo`**。这是 Node 装在了系统目录导致的，改用 Homebrew 或 Node 下载页推荐的方式重新安装 Node，再重试。

## 2. 在 OpenAI Platform 创建隧道和钥匙

这一步在网页上完成，要拿到两样东西：

- **隧道 ID**：一串 `tunnel_` 开头的编号。隧道就是 ChatGPT 通往你电脑的专用通道。
- **运行 key**：一串 `sk-` 开头的密钥，你的电脑靠它证明“我是这条隧道的主人”。

**创建隧道：** 打开 [Platform → Tunnels](https://platform.openai.com/settings/organization/tunnels)，点右上角 **Create tunnel**。

![Platform 的 Tunnels 页面：创建入口和 ID 所在列，私人信息已遮盖](assets/platform-tunnels-list.png)

名称和简介随便填（比如“我的电脑”）；**Organizations** 选你自己的（通常叫 Personal）；**ChatGPT workspaces** 选你平时用的 ChatGPT 账户。点 **Create**。

![创建隧道表单：选择组织和 ChatGPT 工作区，组织 ID 已遮盖](assets/platform-create-tunnel.png)

回到列表，点 **ID** 列旁边的复制按钮，把 `tunnel_...` 记下来。

**创建运行 key：** 打开 [Platform → API keys](https://platform.openai.com/settings/organization/api-keys)，点右上角 **Create new secret key**。

- **Permissions** 选 **Restricted**。
- 向下找到 **Tunnels**，只勾选 **Read** 和 **Use**。其它都保持 **None**。

![创建 API key 时只为 Tunnels 勾选 Read 和 Use，无私人 key 信息](assets/platform-api-key-tunnels-permissions.png)

创建后页面会显示 key。**它通常只显示一次**，先别关页面，下一步马上要粘贴。不要把 key 发到聊天、GitHub 或任何公开地方。

## 3. 在终端运行 `connect`

回到终端，运行：

```sh
gpt-web-agent connect
```

它会依次问你三件事：

1. **隧道 ID**：粘贴上一步的 `tunnel_...`，回车。
2. **是否允许 GPT 在电脑上运行命令**：想让 GPT 帮你跑测试、装依赖，就输入大写 `YES` 回车；只想让它读写文件，直接回车。
   允许后，GPT 能运行的命令权限和你自己在终端里一样大。只在你自己的连接里用。
3. **运行 key**：粘贴上一步的 `sk-...`，回车。**粘贴时屏幕上不会显示任何字符，这是正常的。** key 会存进 Mac 的“钥匙串”（Linux 是系统密码库），以后不用再输。

第一次运行时，它会自动从 OpenAI 官方下载隧道程序并校验文件。成功时终端大概是这样（中间省略了一些日志）：

```text
Your own tunnel_... ID: [粘贴自己的 ID]
Downloading the official OpenAI tunnel-client and checking SHA-256...
Enable host shell commands? ... Type YES to enable: YES
Paste tunnel runtime key (hidden), then Enter:
Configured. Starting the tunnel now...
...
"msg":"🟢 tunnel-client started"
```

看到 **`tunnel-client started`** 就说明电脑这边准备好了。**这个终端窗口不要关**，关了连接就断了。

以后每次开机，打开终端运行同一条 `gpt-web-agent connect` 就行，不用再输任何东西。

## 4. 在 ChatGPT 里添加你的连接

**先打开开发者模式：** 在 [ChatGPT](https://chatgpt.com/) 点左下角头像 → **设置**。

![头像菜单中的设置入口](assets/chatgpt-open-settings.png)

左侧选 **账户安全与登录**，往下找到 **开发者模式**，打开“开发人员模式”开关。

![账户安全与登录中的开发者模式开关](assets/chatgpt-developer-mode.png)

**再创建连接：** 打开 [ChatGPT 插件页](https://chatgpt.com/plugins)，点搜索框右边的 **+** → **创建应用**（注意不是“创建插件”）。

![插件页右上角的创建应用入口](assets/chatgpt-create-app-menu.png)

弹出窗口后，点左下角的 **创建 MCP 应用**。

![在新插件窗口选择创建 MCP 应用](assets/chatgpt-create-mcp-choice.png)

按下图填写：

- **名称**：`GPT Web Agent`（也可以自己起名，后面要用它来搜索）。
- **连接**：选 **隧道**，再从“可用隧道”里选第 2 步建的那条。列表里没有的话，点“改用隧道 ID”，粘贴 `tunnel_...`。
- **身份验证**：选 **无身份验证**。隧道本身只有你能用，所以这里不用再加一层登录。
- 勾选底部的 **我了解并希望继续**，然后点 **创建**。

![新建 MCP 应用：名称、隧道和无身份验证](assets/chatgpt-create-mcp-app.png)

创建后，在 **设置 → 插件** 里点开刚建的 **GPT Web Agent**，能看到它提供的工具，应该有 `workspace_info`、`read_file`、`write_file`；第 3 步输了 `YES` 的话还有 `start_command`。一个工具都没有的话，检查第 3 步的终端是不是还开着。

**在聊天里选中它：** 新建一个聊天，点输入框左边的 **+**，输入你起的名字（比如 GPT Web Agent），在“插件”下面点它。输入框出现这个标签后再发消息。

![在聊天输入框旁搜索并选择自己的连接](assets/chatgpt-select-plugin.png)

## 5. 试一下，确认真的连上了自己的电脑

在选中连接的聊天里发：

> 调用 workspace_info，告诉我连接的是哪个目录、能不能运行命令。然后列出我的“文稿”（Documents）文件夹里的前 10 项。只看，不要修改任何文件。

**成功的样子：** GPT 真的调用了工具，报出的是**你自己电脑的用户目录**，列出的文件和你电脑里的一致。如果它只是给你讲操作步骤、没有调用工具，说明这条聊天没有选中连接，回到上一步重新选。

第 3 步输入了 `YES` 的话，再发下面这段做一次完整测试：

> 在我的 Documents 下新建一个名字带时间戳的 gpt-web-agent-demo 文件夹。在里面写一个有加法错误的 JavaScript 函数和对应测试，运行测试，告诉我失败结果；然后修好它，再运行测试，告诉我最终结果和文件夹的完整路径。只动这个新文件夹，不提交、不推送、不部署。

到电脑里打开这个文件夹，文件确实在，测试最后是通过的，就全部完成了。

## 以后怎么用

开机后运行 `gpt-web-agent connect`，保持终端开着；在 ChatGPT 聊天里选中你的连接，正常说话就行：

- “看看我的 XXX 项目有什么可以优化的，先只分析。”
- “把刚才说的第一个问题修好并测试，保留我原来的改动，不提交、不部署。”
- “再看看 YYY 项目。”（不用告诉它路径，它会自己找；找不准时会问你。）
- “把刚才生成的图片原图保存到 XXX 项目的 public/images/example.png。”（先让它生成图，再说保存。）

电脑要开机、联网，终端要开着。关掉网页不会中断已经在电脑上跑的命令。

### 进阶（不是必需的）

- **开机自动连接（仅 Mac）**：运行 `gpt-web-agent install-service`，再按屏幕提示复制运行一条 `launchctl` 命令。之后每次登录电脑都会自动连接，不用再开终端。Linux 见[后台运行说明](BACKGROUND.md)。
- **更换 key**：key 过期或想换新的，运行 `gpt-web-agent set-key`，粘贴新 key，再重新运行 `connect`（用了开机自动连接的话，重启一下电脑）。
- **交给本地 Codex 执行**：默认是网页里的 GPT 直接操作。你另外装好并登录了 Codex 的话，可以按[技术参考](REFERENCE.zh-CN.md)开启委托。

### 遇到问题

| 现象 | 怎么办 |
| --- | --- |
| 找不到开发者模式，或 Platform 里没有 Create tunnel | 确认用的是个人账户；公司/学校账户需要管理员开通 |
| ChatGPT 的“可用隧道”里没有你的隧道 | 建隧道时 **ChatGPT workspaces** 要选你正在用的 ChatGPT 账户；也可以改用“隧道 ID”直接粘贴 |
| 终端提示 `gpt-web-agent: command not found` | 关掉终端重开再试；还不行就重新执行第 1 步的安装命令，看有没有报错 |
| 终端报错退出 | 重新运行 `gpt-web-agent connect`；提示 key 无效就运行 `gpt-web-agent set-key` 换一个 |
| GPT 只讲方案、不动手 | 这条聊天没选中连接：点输入框左边的 **+** 选上，再让它先调用 `workspace_info` |
| 重启电脑后连不上 | 重新运行 `gpt-web-agent connect` |
| 图片保存失败 | 看[图片说明](IMAGES-AND-EDITS.md) |
