# 从零开始：让自己的 ChatGPT 网页操作自己的电脑

这份教程面向第一次使用的人。完成后，你可以在 ChatGPT 里说“找到我的 XXX 项目，帮我修改并测试”，由网页模型调用你电脑上的工具完成任务。

**每个人都需要安装自己的本地服务、创建自己的私有连接。** 不需要向作者申请账号，不要使用作者或朋友的 API key、隧道 ID 或电脑地址。GitHub 提供源码，不是一个点击后就连接所有人电脑的在线服务。

## 1. 先确认能不能接入

| 准备项 | 如何确认 |
| --- | --- |
| macOS 或 Linux 电脑 | 本机需开机、联网；Windows 请使用 WSL，尚未做实机验收 |
| Git、Node.js 22 或以上 | 终端运行 `git --version`、`node --version`、`npm --version`；缺少 Node 时从 [Node.js 官网](https://nodejs.org/)安装 |
| ChatGPT 开发者模式权限 | 在账户设置查找 Developer mode / 开发者模式；入口可能随界面调整 |
| OpenAI Platform 私有隧道权限 | 打开 [Tunnels](https://platform.openai.com/settings/organization/tunnels)，确认可以创建隧道并关联自己的 ChatGPT 工作区 |

ChatGPT 订阅和 Platform 隧道权限是两件事。不要仅凭 Plus/Pro 套餐名称判断一定可用。没有开发者模式或隧道权限时，本教程的网页连接路线暂时走不通；安装源码不能解锁这些权限。[官方说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

本项目不需要模型推理 API。隧道客户端仍需自己的运行 key；它用于连接认证，不代表改用 API 模型推理。费用、期限和账户可用性以账户显示为准。直接使用网页时不要求安装 Codex。

## 2. 下载源码并检查

打开终端，依次执行：

```sh
mkdir -p "$HOME/Applications"
cd "$HOME/Applications"
git clone https://github.com/yyyqt/gpt-web-agent.git
cd gpt-web-agent
npm ci --ignore-scripts
npm run check
```

如果已经下载过，不要再次克隆到同名目录，进入已有仓库即可。

**成功标志：** 测试汇总中 `fail 0`。这只证明本地程序能运行，还没有连接 ChatGPT。

## 3. 准备你自己的私有隧道

在 [Platform Tunnels](https://platform.openai.com/settings/organization/tunnels) 创建隧道，关联你要使用的 ChatGPT 工作区，记下 `tunnel_...` ID。

在 [API keys](https://platform.openai.com/settings/organization/api-keys) 创建专用运行 key。创建/管理隧道需要 Tunnels Read + Manage；运行客户端需要 Read + Use。运行客户端不需要管理员 key。具体角色设置看[官方权限说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)。不要把 key 发进 ChatGPT、GitHub Issue 或提交到仓库。

下载 [OpenAI 官方 tunnel-client](https://github.com/openai/tunnel-client/releases/latest)，选择对应系统和 CPU 的文件并解压。按该发布页的说明安装，让终端可以执行：

```sh
tunnel-client help quickstart
```

**成功标志：** 显示官方客户端快速入门说明。如果提示 command not found，先解决客户端安装/PATH，再继续。

## 4. 一次配置，之后一条命令启动

在仓库目录执行。macOS 需在自己的登录终端操作；Linux 需有可用的 Secret Service：

```sh
node src/cli.js setup
```

按提示输入你自己的 `tunnel_...` ID。程序会问你是否启用本机 Shell：只有输入 `YES` 才开启；Shell 会使用当前系统用户权限。**要完成下面第 6 节的运行测试验收，这里必须输入 `YES`。** 如果只想读写文件，可以不启用，此时 `hostExecution=false`，跳过命令和测试验收。随后 macOS Keychain 或 Linux Secret Service 会安全地接收隧道运行 key。Key 不写入 Git 仓库、配置文件或命令行参数。Linux 需要预先安装并运行 `secret-tool` 所依赖的 Secret Service。

程序会检查 `node` 和官方 `tunnel-client`，生成本地 MCP 启动脚本和隧道 profile。如果已存在同名配置，先检查再手动处理；setup 不会默默覆盖旧配置。

配置完成后运行：

```sh
node src/cli.js start
```

**成功标志：** 隧道客户端进入运行状态，保持这个终端打开。之后每次启动都只需 `node src/cli.js start`，无需再次输入 key；key 到期时要更新系统凭据。

如果希望 macOS 登录后自动启动，可执行：

```sh
node src/cli.js install-service
```

它会在 `~/Library/LaunchAgents` 写入不含 key 的 plist，并保存安装时的 PATH（包括 Node 所在目录），登录后从 Keychain 读取。请从能正常运行 `node`、`npm` 和项目所需命令的终端执行安装；以后若迁移或卸载这些工具，需要重新生成 plist。安装后需按命令输出运行一次 `launchctl bootstrap` 才能在当前登录会话立即启动；下次登录会自动启动。首次读取 Keychain 时系统可能询问授权。Linux 的 systemd 安装器尚未实现，可以按 [BACKGROUND.md](BACKGROUND.md) 手工设置 user service。

这套配置允许网页操作本机不同项目；GPT 从聊天上下文判断文件和命令目录，不需要登记或切换项目。

## 5. 在自己的 ChatGPT 里添加连接

保持上一步运行，然后：

1. 在设置启用开发者模式。
2. 打开 [ChatGPT 插件页](https://chatgpt.com/plugins)，选择新增开发者应用。
3. 名称填写 **GPT Web Agent**（名字可自定义）。
4. 连接方式选择 **Tunnel**，选刚创建的隧道，或填写它的 ID。
5. 对本项目的私有 stdio 连接，应用层选择 **No Authentication**；连接访问由私有隧道权限控制。不要把无认证接口公开到互联网。
6. 创建后检查工具列表里有 `workspace_info`、`read_file`、`write_file`、`start_command`。
7. 新建聊天，从输入框旁的添加入口选择刚创建的 **GPT Web Agent**。

作者账户中的旧名称是 Web Agent Bridge，不需要搜索或安装那个私人连接。你要选择的是自己刚创建的连接。

本项目已在聊天 + 6 Pro 验收；其他账号可选模型和工具支持以实际界面为准，不要求使用“工作”界面。

## 6. 第一次确认真的连到了自己的电脑

在选中插件的聊天里发：

> 调用 workspace_info，报告 workspace、absolutePaths、fixedProject 和 hostExecution。然后列出我的 Documents 目录前 10 项。只读，不修改。

预期结果：workspace 是**你自己的用户目录**，`absolutePaths=true`、`fixedProject=false`，目录内容也与你电脑一致。若 setup 时输入了 `YES`，还应有 `hostExecution=true`；未输入则是 `false`，属于预期。出现作者的用户名、假想目录或只给操作建议，都不算通过。

仅在 setup 时输入了 `YES` 的情况下，再发下面这段完成写入、失败、修复、成功的完整验收：

> 在我的 Documents 下新建一个名称带时间戳的 gpt-web-agent-demo 目录，不覆盖旧目录。在里面创建一个有加法错误的 JavaScript 函数和对应测试，实际运行测试并记录失败退出码；读取文件后用局部补丁修复，再运行测试，报告最终退出码、文件绝对路径和改动。只操作这个新目录，不委托 Codex，不提交、不推送、不部署。

在电脑上打开返回的目录，确认文件确实存在。**“命令已启动”不是测试通过，必须拿到最终结果。**

## 7. 以后每天怎么用

每次电脑重启或连接停止后，在仓库目录运行：

```sh
node src/cli.js start
```

`setup` 只做一次。使用 `install-service` 且 LaunchAgent 已加载时，macOS 登录后会自动启动。连接需要电脑开机联网。运行 key 过期或需要轮换时，在登录终端运行 `node src/cli.js set-key`，按系统提示保存新 key，再重启前台 `start` 进程或 LaunchAgent；此命令不改 profile、启动脚本和项目文件。关闭网页不等于停止已经派发的本机命令，停止本地服务会取消未完成任务。后台运行详情见 [BACKGROUND.md](BACKGROUND.md)。

连接运行后，聊天选中插件，正常说话即可：

- 看项目：**“看看我的 XXX 项目有什么优化空间，先只分析。”**
- 改代码：**“把刚才发现的第一个问题修复并测试，保留我原有改动，不提交、不部署。”**
- 换项目：**“再看看 YYY 项目。”** GPT 自己判断和查找目录；目标有歧义时再确认。
- 放图片：先让网页生成图片，再说 **“把刚才的原图放到 XXX 项目的 public/images/example.png，不要重新生成。”** 生图和导入按两步使用。
- 查任务：**“查看刚才命令的状态和结果。”**

默认是网页模型直接操作工具。只有自己另外安装登录 Codex、启动参数加入 `--allow-codex` 并明确要求委托时，才走本地 Codex。

## 常见卡点

| 现象 | 下一步 |
| --- | --- |
| 没有开发者模式或 Tunnel 选项 | 检查账户/工作区权限；源码无法补齐账户权限 |
| 看不到自己的隧道 | 核对关联的 ChatGPT 工作区以及 Read + Use 权限 |
| command not found | 检查 Node、Git 或 tunnel-client 是否装好、是否在 PATH |
| 启动后终端没有聊天输入框 | 正常；到 ChatGPT 网页选插件发指令 |
| GPT 只讲方案、不调用工具 | 确认本条聊天附加了连接，让它先调用 workspace_info |
| 仍然固定到某个项目 | 配置可能用了旧的 `--root`，应改为 `--dynamic-projects`，重启并刷新工具 |
| 升级后网页显示旧说明 | 设置里刷新插件工具，必要时新建聊天重新选择连接 |
| 重启电脑后失联 | 运行 `node src/cli.js start`，或检查 LaunchAgent；若 key 过期需更新系统凭据 |
| 图片导入失败 | 需要真实生成文件/附件引用；看 [图片说明](IMAGES-AND-EDITS.md) |

更新源码：停止自己的服务，进入仓库执行 `git pull --ff-only`、`npm ci --ignore-scripts`、`npm run check`，再启动并刷新 ChatGPT 工具。若自己改过源码，先处理本地改动，不要强制覆盖。

## 如何分享给朋友

直接把本教程链接发给对方即可。对方使用自己的电脑、ChatGPT 账户、隧道和运行 key，按上面的流程独立搭建。

目前没有 npm 一键安装包、桌面安装器或插件商店公开安装入口，也没有替他人托管本地执行器。开源源码不等于发布一个所有人共用的公网 Shell。官方私有隧道与公开插件分发是不同路线，见[官方说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)。
