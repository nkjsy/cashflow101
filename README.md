# Ratrace

一个以文字和财务报表为主的单机个人理财策略游戏。目前支持引导/标准模式，以及一名玩家与 1–3 名基础 AI 对战。

## 快速运行

运行前需要安装 [Node.js](https://nodejs.org/) 20 或更高版本。

在 PowerShell 中进入 Web 项目并安装依赖：

```powershell
cd C:\Users\SJ\game\web
npm install
```

启动开发服务器：

```powershell
npm run dev
```

终端出现 `Local` 地址后，在浏览器打开：

<http://localhost:5173/>

开发服务器运行期间不要关闭该终端。按 `Ctrl+C` 可以停止服务器。

## 常用命令

以下命令均需在 `web` 目录执行：

```powershell
# 运行单元测试和组件测试
npm test

# 运行桌面端和移动端浏览器测试
npm run test:e2e

# 批量运行无界面自动对局
npm run simulate -- --games 10000 --max-rounds 100 --seed 1 --ai 3

# 批量模拟快速局（用于校准 QUICK_PACE 参数）
npm run simulate -- --games 2000 --seed 1 --ai 1 --pace quick

# 静态检查
npm run lint

# 创建生产构建
npm run build

# 本地预览生产构建
npm run preview
```

更多项目结构和测试说明参见 [web/README.md](web/README.md)。批量测试的完整步骤参见 [大规模自动对局测试指南](docs/mass-simulation-testing-guide.md)，其他规则与产品文档位于 [docs](docs)。

## 发布打包

```powershell
# CrazyGames 上传包：动态加载 CrazyGames SDK v3，存档走 Data 模块，在自然断点插播插屏广告
npm run build:crazygames      # 输出 release/ratrace-crazygames.zip

# 通用网页包（itch.io / 自托管）：无 SDK、无广告
npm run build:web             # 输出 release/ratrace-web.zip

# 本地验证 CrazyGames 包：在 127.0.0.1 上 SDK 自动进入 local 模式并播放演示广告
npm run preview:crazygames -- --host 127.0.0.1
```

- 平台由构建变量 `VITE_PLATFORM` 决定（见 `web/.env.crazygames`），适配代码在 `web/src/platform/`。
- 插屏广告只在两个自然断点出现：进入自由快道、开始本次会话的第二局及以后；两次广告至少间隔 3 分钟，广告播放期间暂停 AI 并静音。
- CrazyGames SDK 加载失败或域名不受支持时，游戏自动退回普通网页模式，不影响游玩。
- 界面支持英文和中文，默认跟随平台 locale 或浏览器语言；英文文案在 `web/src/i18n/`，缺少翻译会导致 TypeScript 编译失败。

## 常见问题

### 提示找不到 package.json

说明命令在仓库根目录执行了。先运行：

```powershell
cd C:\Users\SJ\game\web
```

然后重新执行 npm 命令。

### 5173 端口已被占用

Vite 会自动选择其他端口。请打开终端中 `Local` 后显示的实际地址。

### 浏览器测试找不到 Edge

当前 Playwright 配置使用 Windows 自带的 Microsoft Edge。请先确认 Edge 已安装，或者修改 `web/playwright.config.ts` 中的浏览器通道。