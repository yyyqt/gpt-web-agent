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

## 4. 配置并启动连接

仍在刚才的 `gpt-web-agent` 仓库目录中操作。先进入 Bash，下面输入方式在 Bash 中执行：

```sh
bash
```

隐藏输入运行 key，只放在当前终端进程环境中，不写入源码或命令历史：

```sh
printf '粘贴你的隧道运行 key（输入不可见），然后回车：'
IFS= read -r -s CONTROL_PLANE_API_KEY
printf '\n'
export CONTROL_PLANE_API_KEY
```

再输入隧道 ID（ID 不是 key）：

```sh
printf '输入你的 tunnel_... ID，然后回车：'
IFS= read -r BRIDGE_TUNNEL_ID
```

创建配置。第一次用下面这组命令即可，不需要改项目路径：

```sh
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile gpt-web-agent \
  --tunnel-id "$BRIDGE_TUNNEL_ID" \
  --mcp-command "\"$(command -v node)\" \"$PWD/src/cli.js\" --dynamic-projects --allow-host-exec --max-concurrent 4 --max-seconds 7200 --max-output-bytes 1048576 --max-file-bytes 4194304"

tunnel-client doctor --profile gpt-web-agent --explain
```

已有同名 profile 时先检查旧配置，不要盲目覆盖。`doctor` 有错误时按错误处理；不要把完整日志或 key 直接公开。

确认诊断通过后启动：

```sh
tunnel-client run --profile gpt-web-agent
```

**保持这个终端运行。** 隧道会启动本项目，不需要再另开终端执行 `node src/cli.js`。直接运行 Node 后没有聊天界面是正常的：它是供 ChatGPT 调用的 MCP 服务。

这套配置允许网页操作本机不同项目；文件路径和命令工作目录由 GPT 判断，不存在登记或切换项目的步骤。Shell 使用当前系统用户权限，工作目录不是沙箱。

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

预期结果：workspace 是**你自己的用户目录**，`absolutePaths=true`、`fixedProject=false`、`hostExecution=true`，目录内容也与你电脑一致。出现作者的用户名、假想目录或只给操作建议，都不算通过。

再发下面这段完成写入、失败、修复、成功的完整验收：

> 在我的 Documents 下新建一个名称带时间戳的 gpt-web-agent-demo 目录，不覆盖旧目录。在里面创建一个有加法错误的 JavaScript 函数和对应测试，实际运行测试并记录失败退出码；读取文件后用局部补丁修复，再运行测试，报告最终退出码、文件绝对路径和改动。只操作这个新目录，不委托 Codex，不提交、不推送、不部署。

在电脑上打开返回的目录，确认文件确实存在。**“命令已启动”不是测试通过，必须拿到最终结果。**

## 7. 以后每天怎么用

每次电脑重启或连接停止后，在终端进入 Bash，重新执行第 4 步的隐藏 key 输入，再运行：

```sh
tunnel-client run --profile gpt-web-agent
```

配置只需创建一次，不要每天执行 `init`。这种入门启动方式需要保持终端；它没有自动安装开机启动。关闭网页不等于停止本机任务，关闭这个终端或停止服务会中断运行任务。后台运行见 [BACKGROUND.md](BACKGROUND.md)。

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
| 重启电脑后失联 | 重新启动隧道；若 key 过期需更新运行凭据 |
| 图片导入失败 | 需要真实生成文件/附件引用；看 [图片说明](IMAGES-AND-EDITS.md) |

更新源码：停止自己的服务，进入仓库执行 `git pull --ff-only`、`npm ci --ignore-scripts`、`npm run check`，再启动并刷新 ChatGPT 工具。若自己改过源码，先处理本地改动，不要强制覆盖。

## 如何分享给朋友

直接把本教程链接发给对方即可。对方使用自己的电脑、ChatGPT 账户、隧道和运行 key，按上面的流程独立搭建。

目前没有 npm 一键安装包、桌面安装器或插件商店公开安装入口，也没有替他人托管本地执行器。开源源码不等于发布一个所有人共用的公网 Shell。官方私有隧道与公开插件分发是不同路线，见[官方说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)。
