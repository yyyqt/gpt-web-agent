# GPT Web Agent

让 ChatGPT 网页直接操作你电脑上的项目：读代码、修改文件、运行测试，也能把网页生成的图片保存到本地。

**第一次使用：[从零安装、连接 ChatGPT、验收到日常使用 →](docs/GETTING-STARTED.zh-CN.md)**

[English](README.md) · [连接故障排查](docs/CHATGPT.md) · [验证记录](docs/VALIDATION.md)

## 我该怎么开始？

1. 在自己的电脑下载源码，安装依赖。
2. 用自己的 OpenAI 账户创建私有隧道，启动本地服务。
3. 在自己的 ChatGPT 里添加这个连接，然后正常聊天。

每一步的命令、页面入口和成功标志都在上面的完整教程里。首次安装后运行 `node src/cli.js setup`，日常运行 `node src/cli.js start`；macOS 可用 `install-service` 安装登录自启。**仅下载仓库或执行 npm install 不会自动连接 ChatGPT。**

完成后可以说：“看看 XXX 项目有什么优化空间”，接着说“修复第一个问题并测试”。不绑定具体项目，不要求每次输入绝对路径，也不用先切换项目，GPT 根据上下文自行判断和查找。默认由网页直接执行，Codex 委托是可选功能。

**当前实验版 0.5.1，源码自部署。** 尚未发布到 npm 或 ChatGPT 插件商店。朋友需要各自安装、使用自己的隧道和凭据；不需要连接作者的电脑。能否连接取决于各自账户的开发者模式及私有隧道权限。

## 连接关系

```text
你的 ChatGPT 网页 → 你的私有隧道 → 你电脑上的 GPT Web Agent → 你的本地文件和命令
```

以下是功能和技术参考；首次使用请先完成[上手教程](docs/GETTING-STARTED.zh-CN.md)。

## 它负责什么

网页模型负责思考和选择工具；本项目负责在本地执行、返回结果和保存任务检查点。

- 文件列表、UTF-8 文件读取、文字搜索。
- 创建或修改文件，修改前校验 SHA-256，避免覆盖过期内容。
- 可选的本机命令执行，支持状态查询、输出截断、超时和取消。
- 重启后可读取的任务检查点，以及不记录正文和命令参数的操作元数据日志。
- 标准 MCP stdio 和仅监听回环地址的 Streamable HTTP。

不反代 ChatGPT，不提取 Cookie，不需要本项目调用模型 API；不承诺无限额度。
官方 Secure MCP Tunnel 本身另需权限及运行凭据。

## 本地运行

需要 Node.js 22+。命令执行目前面向 macOS/Linux；Windows 可在 WSL 中运行，但尚未实测。
先在本项目目录中执行：

```sh
npm ci --ignore-scripts
npm run check
mkdir -p /tmp/bridge-demo
node src/cli.js --root /tmp/bridge-demo
```

默认是 MCP stdio 服务，需要客户端连接，不是可直接输入指令的聊天窗口。
默认提供文件读写和任务工具，命令执行关闭。要让网页版跑测试，启动时加：

```sh
node src/cli.js --root /tmp/bridge-demo --allow-host-exec
```

**本机命令不是沙箱。** 启用后，命令拥有启动用户的操作系统权限，可能访问工作目录之外的文件或网络。
文件工具的路径限制不约束 Shell。初次验证请使用无敏感数据的测试目录；有严格隔离要求时，应把整个服务放在独立低权限虚拟机或容器内。

加 `--read-only` 可移除业务文件写入、任务保存及命令工具，但服务仍写入自己的 `.web-agent/` 元数据目录。
请在目标项目的 `.gitignore` 中加入 `.web-agent/`，避免将任务笔记提交到 Git。

## 连接 ChatGPT

详见 [连接说明](docs/CHATGPT.md)。优先通过官方私有隧道连接 stdio 服务，避免公开执行接口。
如果账户没有隧道权限，仍可把本项目接入其他支持 stdio 的 MCP 客户端；公网 OAuth 网关尚未实现，不能直接把无认证的本地 HTTP 接口映射到公网。

## 第一次验收

使用 [验收提示词](examples/acceptance-prompt.md)，检查它是否真的：

1. 创建一个有错误的函数和对应测试。
2. 调用命令工具，读到失败及真实退出码。
3. 读取文件，带原始哈希修正内容。
4. 再运行测试，确认成功，保存任务检查点。

启动命令不等于测试通过。服务启动和 MCP 客户端测试通过也不等于 ChatGPT 网页已连接。

## 长任务和本地 Codex

默认由网页模型自己读取、编辑文件和执行测试。只有用户明确要求“委托 Codex”或“Pro 规划、Codex 执行”时，才可以通过 `start_codex` 把完整任务交给本机 Codex。
Codex 使用已有 CLI 登录，独立完成读代码、修改、测试的循环；消耗 Codex 账户额度。
不调用 Codex 桌面应用界面，也不是把 Codex 推理变成免费网页额度。

```sh
node src/cli.js --root /absolute/project --allow-host-exec --allow-codex \
  --max-seconds 7200 --max-output-bytes 1048576 --max-file-bytes 4194304
```

首次使用先安装官方 Codex CLI 并执行 `codex login`。专用工具固定使用
`codex exec --ignore-user-config --sandbox workspace-write`，复用登录但不加载
个人全局配置里的其他 MCP 服务、模型覆盖或钩子。项目内 Codex 规则仍可能生效。
模型使用 CLI 默认值；不要把不可信仓库当作隔离环境。

工具立即返回任务 ID，使用 `get_command` 查看进度与退出码；`list_commands`
可找回重连前的任务。最多保留 100 个结果，命令与 Codex 共用并发额度。

### 可以关闭网页吗？

可以关闭网页，**但要先确认任务已经派发，拿到任务 ID**。
已启动的本地命令或 Codex 任务在本地执行器保持运行时继续；不需要网页一直打开。
Codex 自己负责后续推理和工具循环。电脑需要保持开机、联网并避免睡眠。

普通 ChatGPT 当前云端回合关闭标签页后是否完成整个工具循环，取决于 ChatGPT
运行方式和审批状态；本项目不作保证。关闭标签页不等于主动点击“停止”。
本项目也不会在 ChatGPT 回合结束后凭空启动新模型回合或自动处理待批准操作。

已完成任务的状态、退出码和限量输出保存在本地 `.web-agent/job-*.json`，重启可查。
服务正常关闭会取消运行任务；崩溃后未记录最终状态的任务标为 `interrupted`，
不会自动重跑，避免重复写文件或产生外部副作用。这不是关机后继续运算。
持续运行请看 [后台运行说明](docs/BACKGROUND.md)。

### 限制现在可以配置

| 项目 | 默认 | 可配置上限 |
| --- | --- | --- |
| 单任务时间 `--max-seconds` | 600 秒 | 24 小时 |
| 并发 `--max-concurrent` | 4 | 16 |
| 输出 `--max-output-bytes` | 128 KiB | 16 MiB |
| UTF-8 文件 `--max-file-bytes` | 1 MiB | 16 MiB |

这些是本项目资源保护设置，不是 GPT 固定限制。默认 4 个运行槽位，更多命令按 FIFO 排队；最多保留/接收 100 个任务。超时从实际启动开始计算。并发修改同一项目仍应避免冲突。
文件路径校验、密钥文件名拦截、哈希冲突检测继续保留；不会为了方便取消这些保护。
暂未提供 PTY 交互终端、自动定时调度、浏览器控制或 SSH 专用工具。

## 开源

MIT 许可证，中英文说明、测试、CI 和安全边界文档均在仓库内。仅把通用源码和合成示例开源；实际项目文件、`.web-agent/`、账户信息和隧道凭据不得提交。

参阅 [安全说明](SECURITY.md) 和 [架构](docs/ARCHITECTURE.md)。这是独立项目，不代表 OpenAI 官方产品。

## 图片、局部修改与日志分页

- `import_image`：通过 ChatGPT 官方文件参数接收图片，完整解码并校验格式、尺寸、大小和路径后保存原始文件；返回路径、哈希和尺寸。支持 PNG/JPEG/WebP，最大 20 MiB、4000 万像素。
- `patch_file`：只提交要替换的片段；基于原文件唯一匹配、不允许重叠，哈希冲突或任何片段失败则整次不写入。
- `read_command_output`：分页读取 stdout/stderr，使用返回的 nextOffset 续读；中文和 emoji 不会因分页被拆坏。`get_command` 可设置 `includeOutput:false` 只查状态。

2026-09-22 已在 ChatGPT Work 实测：网页原生生成月亮图，自动传给 `import_image` 并落入本地项目，无需手动下载上传。

网页生图与文件传递是两个步骤；插件本身不调用生图 API。自动落盘需要当前 ChatGPT 会话把生成图片提供为真实文件引用，不能把预览或 sandbox 路径冒充本地文件。如果当前界面不支持直接传递，可下载后重新附加图片再导入。
详见 [协议与边界](docs/IMAGES-AND-EDITS.md)。

0.4.1 另已实测「聊天 + 6 Pro」：先原生生图，再通过插件从 ChatGPT 资料库取回原图并保存到本地，无需手动下载上传。修复了聊天文件实际使用 Azure Blob 下载地址而被误拦的问题，仅增加两个实测域名。生图与导入分步验收，不承诺每次一句话自动完成。

## 公网连接路线

正在设计另一条不依赖 Platform 私有隧道的 HTTPS 路线，见 [设计与安全验收门槛](docs/PUBLIC-CONNECTION-DESIGN.md)。当前本地 HTTP 端口没有公网认证，不能直接映射到互联网。
