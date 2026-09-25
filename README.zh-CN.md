# GPT Web Agent

让 ChatGPT 网页直接读写你电脑里的项目、运行测试，并把网页生成的图片保存到本地。默认由网页模型调用本地工具；只有你明确要求时才委托本地 Codex。

**[点这里，从零开始安装和连接（带截图）](docs/GETTING-STARTED.zh-CN.md)** · [English](README.md)

## 三步开始

1. 安装 Node.js 22 或更新版本，再从 GitHub 的固定版本安装本项目：

   ```sh
   npm install --global --ignore-scripts https://github.com/yyyqt/gpt-web-agent/archive/refs/tags/v0.5.5.tar.gz
   ```

2. 用自己的 OpenAI Platform 账户创建私有隧道和运行 key，在电脑上运行 `gpt-web-agent connect`。首次会询问隧道 ID、是否允许本机命令，以及 key；以后仍用同一条命令启动。
3. 在 ChatGPT 开启开发者模式，新增选择 **Tunnel** 的 MCP 应用，然后在聊天里选中自己的连接。

每个人都要在自己的电脑上安装，用自己的账户连接。本教程以**个人** ChatGPT 和 Platform 账户为例；公司或学校账户通常需要管理员开通开发者模式和隧道。当前是实验版，尚未发布到 npm 或 ChatGPT 插件商店。完整页面位置、成功标志和排错步骤见[上手教程](docs/GETTING-STARTED.zh-CN.md)；实现细节见[技术参考](docs/REFERENCE.zh-CN.md)、[安全说明](SECURITY.md)和[验证记录](docs/VALIDATION.md)。
