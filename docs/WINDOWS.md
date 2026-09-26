# Windows 原生使用与验收

Windows 原生适配已通过真机网页验收，从 `0.6.0` 起包含在 npm 包中。打开 Windows PowerShell，运行：

```powershell
npm.cmd install --global gpt-web-agent@latest
gpt-web-agent.cmd connect
```

已经安装旧版的用户也用上面的安装命令升级。源码开发与测试可以克隆仓库后运行 `npm.cmd ci --ignore-scripts` 和 `npm.cmd run check`。

需要 Node.js 22 或以上、Windows PowerShell，以及可创建 Secure MCP Tunnel 的 OpenAI 账户。按上手教程创建自己的隧道和受限运行 key。需要运行测试时，在命令权限提示输入 `YES`；key 的粘贴输入不会显示字符。Windows key 使用 DPAPI 按当前系统用户加密保存，不能复制给另一台电脑直接使用。

## Mac 和 Windows 同时连接

每台电脑使用独立隧道。在 ChatGPT 中分别创建并命名连接，例如 `GPT Web Agent — Mac` 和 `GPT Web Agent — Windows`。建议分别保留一个聊天，每个聊天只选目标电脑的连接。开始改代码前可以说：

> 先调用 workspace_info，确认这是 Windows（platform=win32），再找到我的项目。先报告找到的项目路径，再按我们讨论的要求修改并测试。

这不要求每次给工具传固定项目路径；核对的是目标电脑与实际找到的目录。两台电脑的连接可以同时运行，切换聊天无需停止另一台。

Windows 命令使用 PowerShell 语法。运行 npm 时优先使用 `npm.cmd test`，以避免部分系统上的 npm.ps1 执行策略报错。终端需保持运行；电脑休眠、关机或断网会中断连接。

## 已验证与未验证

2026-09-26 的 Windows x64 真机记录确认：官方隧道下载及 SHA-256 校验、DPAPI 凭据读写、ChatGPT 网页创建和修复本地代码、测试退出码从 1 到 0，以及中文和 emoji 输出。Windows 自动测试报告为 29 通过、0 失败、7 项平台限定跳过。

Windows 登录自启、原生 Codex 委派和 ARM64 真机尚未验收。不要据此承诺这些能力已可用。详细证据见 [验证记录](VALIDATION.md)。

## key 过期

有效期由创建 key 时的账户配置决定，7 天不是 Windows 限制。过期后，在 Platform 创建新的受限 key，再运行：

```powershell
gpt-web-agent.cmd set-key
gpt-web-agent.cmd connect
```

无需重建项目或删除隧道。不要把 key 发进聊天或提交到 Git。
