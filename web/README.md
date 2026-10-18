# 现金流实验室 Web 应用

这是项目的 React + TypeScript 前端和游戏核心，使用 Vite 开发与构建。

## 环境要求

- Windows 10/11（macOS、Linux 也可以运行）
- Node.js 20 或更高版本
- npm 10 或更高版本
- 运行 E2E 测试时：Windows 需要 Microsoft Edge，其他系统使用 Playwright 的 Chromium 或 `PW_CHROMIUM_PATH`

检查本机版本：

```powershell
node --version
npm --version
```

## 安装与启动

从仓库根目录执行：

```powershell
cd web
npm install
npm run dev
```

默认开发地址为 <http://localhost:5173/>。如果端口被占用，以终端输出的 `Local` 地址为准。

## 测试与检查

```powershell
# Vitest 规则核心和 React 组件测试
npm test

# 监听文件变化并重复运行测试
npm run test:watch

# Playwright 桌面端和移动端测试
npm run test:e2e

# 运行 1,000 局无界面自动对局
npm run simulate

# 指定局数、轮数上限、基础种子和 AI 数量
npm run simulate -- --games 10000 --max-rounds 100 --seed 1 --ai 3

# 默认使用新规则（living-v1）；--economy legacy 模拟旧规则
npm run simulate -- --games 2000 --economy legacy

# Oxlint 静态检查
npm run lint

# TypeScript 检查和生产构建
npm run build
```

## 批量自动对局

`npm run simulate` 使用与浏览器完全相同的 `game-core`，但不启动 React 或浏览器。每局使用可复现的递增种子，并自动检查：

- 每条命令必须合法且推进 `revision`。
- 当前玩家、待决策玩家和财务数字始终有效。
- 被动收入必须等于资产现金流合计。
- 银行贷款、孩子数量和玩家阶段不能越界。
- 对局不能陷入命令死锁。

报告包含完成率、首次进入快车道轮数、中位轮数、P90 轮数、破产率、平均命令数、各职业胜局，以及按资产类型和 Small/Big Deal 划分的购买量。出现异常时，错误会带上种子和 revision，可用同一个 `--seed` 重现。

当前平衡回归门槛使用 500 个固定种子：100 轮完成率至少 95%，完成局中位数不超过 50 轮、P90 不超过 70 轮，首次进入快车道中位数不超过 28 轮、P90 不超过 45 轮，固定样本中必须出现破产且发生破产的对局占比不超过 35%。下限用于捕获“绝对不会破产”的规则漏洞；500 局小样本不设置易受单局波动影响的百分比下限，也不要求 AI 为维持破产率而接受明显亏损。该门槛会随 `npm test` 自动执行。

参数说明、玩家数量矩阵、失败种子复现、指标解读和标准调优流程参见 [大规模自动对局测试指南](../docs/mass-simulation-testing-guide.md)。

Playwright 在 Windows 上使用已安装的 Microsoft Edge，因此首次运行 E2E 测试不需要额外下载 Chromium；其他系统使用 Playwright 的 Chromium，或通过 `PW_CHROMIUM_PATH` 指定可执行文件。

## 生产预览

```powershell
npm run build
npm run preview
```

默认预览地址通常为 <http://localhost:4173/>。生产输出位于 `dist` 目录。

## 项目结构

```text
web/
├── e2e/                 # Playwright 浏览器测试
├── src/
│   ├── game-core/       # 与 React 和浏览器无关的确定性规则核心
│   │   ├── report.ts        # 回放操作历史生成局后报告
│   │   └── achievements.ts  # 回放操作历史判定成就
│   ├── App.tsx          # 开始页和游戏主界面
│   ├── GameReport.tsx   # 局后报告图表
│   ├── Achievements.tsx # 成就面板与结算
│   ├── daily.ts         # 每日挑战种子、成绩与连胜
│   ├── board-motion.ts  # 棋子逐格移动动画
│   ├── App.css          # 响应式界面样式
│   ├── game-polish.css  # 棋盘配色、动画与新功能样式
│   └── App.test.tsx     # React 用户路径测试
├── package.json
└── playwright.config.ts
```

游戏状态可以序列化并保存在浏览器 `localStorage` 中。UI 和基础 AI 都通过 `GameCommand` 调用同一规则核心，后续多人服务器可以复用这一层。

当前版本包含 24 格 Rat Race、独立 Small Deal/Big Deal/Doodad/Market 牌堆、证券与拆股、8 种职业（另有 2 种可通过成就解锁）、8 个梦想、随机先手、梦想选择、慈善单双骰、灵活借还款、局内模式切换、AI 快进和破产后旁观。旧版存档会在加载时补齐新增牌堆与资产字段。

新对局使用 `living-v1` 经济规则（`setup.economyRulesVersion`）：额外支出可刷信用卡、证券价格每轮变动并可按市价卖出、地产和企业机会可转让给其他玩家，并使用扩充后的牌堆（扩充卡见 `EXPANSION_CARD_IDS`）。旧对局不受影响，回放保持一致。每日挑战成绩和成就分别保存在 `cashflow-lab-daily-results` 和 `cashflow-lab-achievements`。

棋盘核验与官方资料边界见 [规则与边界调研](../docs/cashflow-101-rules-research.md#20-棋盘核验结论)。Rat Race 使用公开资料交叉支持的 24 格规则重建；Fast Track 是机制一致的原创编排，不宣称逐格复制官方棋盘。

## 清除本地存档

可以在游戏右上角点击重新开始按钮。调试时也可以打开浏览器开发者工具，在 Application/Storage 中删除以下项目：

- `cashflow-lab-save-v1`
- `cashflow-lab-mode`
- `cashflow-lab-daily-results`（每日挑战成绩）
- `cashflow-lab-achievements`（已解锁成就）
