# GPT Web Agent

[English](README.md)

让 ChatGPT 网页通过 MCP，直接读取本机项目、修改代码、执行测试、查看错误并继续修正。

**当前为实验版 0.3.0。** 本地自动化测试和 ChatGPT 网页实际代码修复闭环均已通过，见 [验证记录](docs/VALIDATION.md)。源码仓库：[yyyqt/gpt-web-agent](https://github.com/yyyqt/gpt-web-agent)。尚未发布到 npm 或 ChatGPT 插件商店。

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

## 图片能力

网页原生生图与本地文件接收是不同能力。当前工具仅支持 UTF-8 文本读写，
没有生成图片、图片二进制导入、ChatGPT 附件下载或自动图片落盘工具。
不要把网页图片预览、sandbox 路径或附件 ID 当成本机文件路径。
当前可先在 ChatGPT 保存图片到本机，再明确指定已下载文件交给本地命令处理；
“一句话自动生图并放入项目”尚未实现或验收。SVG 源码可作为文本写入，但不等同于原生生图。
