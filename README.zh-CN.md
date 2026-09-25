# GPT Web Agent

让 ChatGPT 网页直接读写你电脑里的项目、运行命令和测试，并把网页生成的图片保存到本地。默认由网页模型自己调用本地工具；**只有你明确要求并另行启用时，才会委托本地 Codex**。

[English](README.md) · [带截图的逐步教程](docs/GETTING-STARTED.zh-CN.md)

## 开始前确认

- 一台 Mac 或 Linux 电脑，安装了 Node.js **22 或更新版本**。Windows 可尝试 WSL，目前没有实机验收。
- ChatGPT 账户能开启开发者模式；OpenAI Platform 账户能在 [Tunnels 页面](https://platform.openai.com/settings/organization/tunnels)看到 **Create tunnel**。**ChatGPT 订阅不等于拥有 Platform 隧道权限**，先确认这一点再安装。个人账户最方便；公司或学校账户可能需要管理员开通并关联工作区。
- 每位使用者在自己的电脑上安装，用自己的账户建立连接。本仓库不是替别人托管电脑的在线服务。目前尚未发布到 npm 或 ChatGPT 插件商店。

## 安装与连接

1. **安装程序。** 打开终端，运行 `node --version` 确认是 `v22` 或更高；没有 Node 时先按 [Node.js 官方指引](https://nodejs.org/en/download)安装。然后运行：

   ```sh
   npm install --global --ignore-scripts https://github.com/yyyqt/gpt-web-agent/archive/refs/tags/v0.5.5.tar.gz
   gpt-web-agent --help
   ```

   看到帮助文字表示程序已安装。如果报 `EACCES`，不要加 `sudo`；换用用户可写的 Node 安装方式，参见[逐步教程](docs/GETTING-STARTED.zh-CN.md#1-打开终端安装程序)。

2. **创建自己的隧道和运行 key。** 在 [Platform → Tunnels](https://platform.openai.com/settings/organization/tunnels) 点 **Create tunnel**，填写名称，选择自己的组织和要使用的 **ChatGPT workspaces**。创建后复制列表 **ID** 列中的 `tunnel_...`。再到 [Platform → API keys](https://platform.openai.com/settings/organization/api-keys) 点 **Create new secret key**，选项目和有效期，权限选 **Restricted**，只为 **Tunnels** 勾选 **Read**、**Use**，其余保持 **None**。保存显示的 `sk-...`；**不要发到聊天或提交进仓库**。[这一步的页面截图](docs/GETTING-STARTED.zh-CN.md#2-在-openai-platform-创建隧道和钥匙)

3. **在本机启动连接。** 运行：

   ```sh
   gpt-web-agent connect
   ```

   首次依次输入隧道 ID、是否允许本机命令、运行 key。想让 GPT 跑测试时，在第二问输入大写 `YES`；只需读写文件就直接回车。**本机命令拥有当前电脑用户的权限，不是沙箱。** 粘贴 key 时屏幕不显示字符，是正常的。看到 `tunnel-client started` 后保持终端运行；以后启动仍用同一条命令，通常无需再输入 key。

4. **在 ChatGPT 添加连接。** 在 ChatGPT 点击头像 → **设置 → 账户安全与登录**，打开**开发者模式**。打开[插件页](https://chatgpt.com/plugins)，点 **+ → 创建应用 → 创建 MCP 应用**。名称可填 `GPT Web Agent`；连接选 **隧道**，选择刚建的隧道；身份验证选 **无身份验证**，勾选“我了解并希望继续”，然后创建。这里依靠组织和工作区权限控制私有隧道，**不要把无认证的本机服务直接暴露到公网**。新建聊天，在输入框旁的 **+** 菜单搜索并选中自己创建的连接。[这一步的页面截图](docs/GETTING-STARTED.zh-CN.md#4-在-chatgpt-里添加你的连接)

## 确认它真的连到了自己的电脑

在**已选中连接**的聊天中发送：

> 调用 workspace_info，告诉我连接的是哪个目录、能不能运行命令。再列出我 Documents 文件夹里的前 10 项。只看，不要改文件。

检查它**实际调用了工具**，列出的文件与你电脑里的一致。仅看到本机 `tunnel-client started`，还不代表 ChatGPT 已接通。需要测试写文件和运行命令时，请按[首次完整验收](docs/GETTING-STARTED.zh-CN.md#5-试一下确认真的连上了自己的电脑)操作，它只在新建的演示目录里改动。

之后每次开机运行 `gpt-web-agent connect` 并保持电脑联网，再在 ChatGPT 聊天中选中连接。例如：“先看看我的 XXX 项目哪里值得优化，不要修改”；确认后再说“修复第一个问题并跑测试，保留原有改动”。项目无需预先登记；位置不清楚时让 GPT 确认。关闭网页不会终止**已经派发**到本机的命令，后续步骤仍取决于网页任务是否继续推理。

## 常见问题与更多资料

| 现象 | 先检查什么 |
| --- | --- |
| 看不到 Create tunnel 或开发者模式 | 检查 Platform 与 ChatGPT 的账户、组织权限；公司或学校账户联系管理员。订阅 ChatGPT 不自动授予隧道权限 |
| ChatGPT 找不到隧道 | 创建隧道时是否关联了当前 ChatGPT 工作区；也可在应用表单中改用隧道 ID |
| `gpt-web-agent: command not found` | 重开终端，检查 `node --version`，重新执行上面的安装命令并查看错误 |
| 终端运行了，GPT 仍只讲方案 | 当前聊天是否从 **+** 菜单选中连接；先让它调用 `workspace_info` |
| 重启或 key 过期后失联 | 再运行 `gpt-web-agent connect`；key 过期时先运行 `gpt-web-agent set-key` |

更多操作见[带截图的逐步教程](docs/GETTING-STARTED.zh-CN.md)、[图片导入与局部补丁](docs/IMAGES-AND-EDITS.md)、[技术参考](docs/REFERENCE.zh-CN.md)、[安全说明](SECURITY.md)、[验证记录](docs/VALIDATION.md)和[贡献指南](CONTRIBUTING.md)。开机自动连接、Codex 委托和源码运行属于可选进阶功能。
