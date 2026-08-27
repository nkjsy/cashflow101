# 测试策略与多人联机扩展架构

> 适用范围：[网页版单机 MVP](web-mvp-product-spec.md)  
> 目标：首版保持开发简单，同时避免未来多人联机时重写规则引擎

## 1. 结论

后续扩展到多人联机是可行的，工作量属于**中等**，前提是单机版从一开始遵守以下边界：

1. 规则引擎是独立的 TypeScript 模块，不依赖 React、DOM、浏览器计时器或 `localStorage`。
2. UI 和 AI 只能提交命令，不能直接修改游戏状态。
3. 随机数由可注入、可保存的随机源产生。
4. 每个命令产生结构化事件，事件可记录、回放和同步。
5. 单机存档使用与未来服务器相同的可序列化游戏状态。
6. 玩家能看到的信息由独立投影视图产生，不直接暴露完整内部状态。

如果把规则、AI、动画和页面状态全部写在 React 组件里，多人联机时需要重新拆分状态归属、校验和同步，成本会显著增加。

## 2. 推荐架构

```text
┌─────────────────────────────────────────────┐
│ Web UI                                      │
│ 页面、表格、引导、动画、按钮                │
└──────────────────┬──────────────────────────┘
                   │ Command
┌──────────────────▼──────────────────────────┐
│ Game Application                           │
│ 回合编排、AI 调度、存档、事件日志           │
└──────────────────┬──────────────────────────┘
                   │ execute(state, command)
┌──────────────────▼──────────────────────────┐
│ Game Core                                   │
│ 规则、合法行动、财务计算、阶段与胜利检查   │
└──────────────────┬──────────────────────────┘
                   │ Events + New State
┌──────────────────▼──────────────────────────┐
│ Persistence / Transport                     │
│ MVP: IndexedDB    以后: Server + WebSocket  │
└─────────────────────────────────────────────┘
```

基础 AI 与真人 UI 使用同一个命令接口：

```text
真人点击 -> Command -> Game Core
AI 决策  -> Command -> Game Core
```

AI 不能调用“加钱”“添加资产”等内部函数，也不能绕过合法行动检查。

## 3. 核心状态与接口

### 3.1 可序列化状态

游戏核心状态只保存数据，不保存函数、DOM 对象或类实例引用。

```ts
type GameState = {
  schemaVersion: number;
  gameId: string;
  rulesetVersion: string;
  revision: number;
  phase: 'setup' | 'rat-race' | 'fast-track' | 'finished';
  currentPlayerId: string;
  turnNumber: number;
  players: PlayerState[];
  board: BoardState;
  decks: DeckState;
  pendingDecision: PendingDecision | null;
  rng: RandomState;
  winnerId: string | null;
};
```

引导模式或标准模式属于本地显示偏好，不应放入共享规则状态：

```ts
type LocalPreferences = {
  displayMode: 'guided' | 'standard';
  seenTutorials: string[];
};
```

这样多人游戏中每名玩家可以自行选择显示模式，而不会影响规则结果。

### 3.2 命令

命令表达玩家意图：

```ts
type GameCommand =
  | { type: 'ROLL_DICE'; actorId: string; diceCount: 1 | 2 }
  | { type: 'CHOOSE_DEAL_DECK'; actorId: string; deck: 'small' | 'big' }
  | { type: 'BUY_ASSET'; actorId: string; opportunityId: string }
  | { type: 'PASS_OPPORTUNITY'; actorId: string }
  | { type: 'TAKE_LOAN'; actorId: string; amount: number }
  | { type: 'REPAY_LOAN'; actorId: string; amount: number }
  | { type: 'RESPOND_TO_MARKET'; actorId: string; assetIds: string[] }
  | { type: 'CHOOSE_CHARITY'; actorId: string; donate: boolean }
  | { type: 'END_TURN'; actorId: string };
```

命令必须包含 `actorId`。规则引擎验证：

- 是否轮到该玩家。
- 当前是否允许此命令。
- 参数是否合法。
- 玩家是否有足够现金或资产。
- 命令是否与当前待决策事件匹配。

### 3.3 事件

事件表达已经发生的事实：

```ts
type GameEvent =
  | { type: 'DICE_ROLLED'; playerId: string; values: number[] }
  | { type: 'PLAYER_MOVED'; playerId: string; from: number; to: number }
  | { type: 'PAYDAY_SETTLED'; playerId: string; amount: number }
  | { type: 'ASSET_PURCHASED'; playerId: string; assetId: string; cost: number }
  | { type: 'LOAN_TAKEN'; playerId: string; amount: number }
  | { type: 'FINANCIALS_RECALCULATED'; playerId: string }
  | { type: 'PLAYER_ENTERED_FAST_TRACK'; playerId: string }
  | { type: 'PLAYER_WON'; playerId: string; reason: 'dream' | 'cashflow' };
```

事件用于：

- 更新状态。
- 生成游戏日志。
- 驱动动画和教学说明。
- 保存和回放游戏。
- 未来通过 WebSocket 同步到其他玩家。

## 4. 确定性是测试基础

同样的初始状态、随机种子和命令序列必须得到完全相同的事件与最终状态：

```text
run(initialState, seed, commands)
  -> identical events
  -> identical final state
```

禁止规则核心直接调用：

- `Math.random()`
- `Date.now()`
- `setTimeout()`
- 浏览器存储
- 网络请求

随机骰子、洗牌、AI 同分选择都通过注入的随机源完成。动画延时只存在于 UI 层。

每个事件使用稳定 ID，测试中不要依赖随机 UUID。可以使用游戏内递增序号：

```text
eventId = gameId + ':' + revision
```

## 5. 测试分层

### 5.0 大规模无界面对局

除单条规则测试外，项目提供确定性批量模拟器：

```powershell
npm run simulate -- --games 10000 --max-rounds 100 --seed 1 --ai 3
```

模拟器直接提交 `GameCommand`，不绕过规则引擎。它在每条命令后检查状态不变量，并汇总完成率、轮数分位数、职业胜率、破产数和出圈情况。基础种子与局号共同确定每局随机序列，失败可精确重放。

CI 冒烟层运行 500 个固定种子，并固定以下平衡回归门槛：

- 100 轮内完成率至少 `95%`。
- 完成局中位轮数不超过 `50`。
- 完成局 P90 不超过 `70`。

这些指标不是官方规则，而是当前电子原型的节奏目标；修改卡牌数值、AI 策略或棋盘分布后必须重新评估。

完整操作步骤参见 [大规模自动对局测试指南](mass-simulation-testing-guide.md)。

### 5.1 规则单元测试

数量最多、运行最快，直接测试纯函数。

重点覆盖：

- 总收入、被动收入、总支出和月现金流计算。
- 孩子支出上限。
- 银行贷款与月支出变化。
- 房地产买入和卖出的资产、负债、现金流同步。
- 被动收入严格大于总支出才出圈。
- 快车道被动收入按最近千位取整后乘 100。
- 快车道目标为起始值加 `$50,000`。
- 现金不足、清算和破产。
- 非法命令拒绝且状态不变。

推荐采用表驱动测试：

```ts
it.each([
  { passive: 3000, expenses: 3000, expected: false },
  { passive: 3001, expenses: 3000, expected: true },
])('checks Rat Race exit', ({ passive, expenses, expected }) => {
  expect(canEnterFastTrack(passive, expenses)).toBe(expected);
});
```

### 财务不变量

每次状态变化后自动检查：

- 现金、股数、贷款余额不能出现非法小数或 `NaN`。
- 银行贷款必须是 `$1,000` 的整数倍。
- 银行贷款支出等于贷款余额的 10%。
- 已出售资产不能继续提供现金流。
- 资产与其对应抵押关系一致。
- `currentPlayerId` 必须指向仍在游戏中的玩家。
- 游戏结束后不能接受普通行动命令。

### 5.2 状态机和命令测试

验证“什么时点允许做什么”，而不只测试计算公式。

典型场景：

1. 未掷骰前可以 `ROLL_DICE`，不能 `BUY_ASSET`。
2. 抽出机会后可以购买或放弃，不能重复掷骰。
3. Market 多人响应时，仅当前响应者可以提交决定。
4. Downsized 跳过回合时不生成移动和 Payday 事件。
5. 待处理强制付款时不能直接结束回合。
6. 进入快车道后不能再提交银行借款命令。
7. 胜利后所有非查看类命令都被拒绝。

每个非法命令应返回结构化错误，而不是抛出无法识别的字符串：

```ts
type CommandError = {
  code: 'NOT_YOUR_TURN' | 'COMMAND_NOT_ALLOWED' | 'INSUFFICIENT_CASH';
  messageKey: string;
};
```

### 5.3 场景测试

场景测试从预设状态开始，执行一串命令并检查事件顺序。

必须覆盖：

- 一次移动跨过多个 Payday，逐个结算。
- Charity 后遇到 Downsized，跳过回合消耗 Charity 次数。
- 买入资产后立即满足出圈条件。
- 还清贷款、降低支出后立即满足出圈条件。
- Market 中多名玩家依次出售。
- 强制支出导致借款、清算和最终破产。
- 进入快车道时初始化收入并领取一次起始收入。
- 购买企业恰好达到 `$50,000` 增量后获胜。
- 落在自己的 Dream 并购买后获胜。

场景测试应检查完整事件序列，例如：

```text
DICE_ROLLED
PLAYER_MOVED
PAYDAY_SETTLED
OPPORTUNITY_DRAWN
ASSET_PURCHASED
FINANCIALS_RECALCULATED
PLAYER_ENTERED_FAST_TRACK
```

### 5.4 属性测试

使用属性测试库随机生成大量合法状态和命令，寻找手写案例遗漏的组合。

推荐属性：

- 执行任意合法命令后，财务不变量始终成立。
- 借入再立即偿还相同金额后，除事件日志外财务状态恢复。
- 买入再按原价卖出资产后，净现金变化符合抵押规则。
- 相同种子和命令序列始终产生相同结果。
- AI 从合法行动集合中选择的动作永远合法。

TypeScript 可使用 `fast-check`。

### 5.5 AI 测试

AI 测试不要求它每次做出“最佳选择”，而要求它稳定、合法且不会卡住。

测试内容：

- 任何状态下，AI 返回的命令都属于合法行动集合。
- 没有可选决策时，AI 能推进强制流程。
- 现金不足时借款金额向上取整到 `$1,000`。
- AI 不借款购买普通股票。
- AI 保留至少一个月总支出后再购买普通资产。
- 满足条件时优先购买能立即出圈的资产。
- 快车道落在自己的 Dream 且现金足够时购买。
- AI 完整运行数千局，不出现死循环、非法状态或未处理决策。

大规模模拟只输出统计摘要：

```text
模拟局数       10,000
正常结束率     100%
非法命令数     0
死循环局数     0
平均回合数     84
最长回合数     291
```

为避免无限局，测试环境设置很高但明确的最大回合数；达到上限应视为测试失败并保存种子。

### 5.6 存档与迁移测试

必须验证：

- 保存后读取的状态与原状态深度相等。
- 在任意待决策节点刷新页面都能继续。
- AI 回合中刷新不会重复执行已经提交的命令。
- 旧 `schemaVersion` 存档能迁移到当前结构。
- 损坏或不完整存档显示可恢复错误，不让页面白屏。
- 已完成游戏的存档只能查看或重新开始。

不要直接把 React store 原样写入浏览器。定义明确的 `SaveGame` 格式和迁移函数。

### 5.7 UI 组件测试

组件测试只关注显示与交互，不重复验证规则计算：

- 引导模式首次机制出现时显示教学，之后不重复。
- 标准模式不显示强制教学。
- 两种模式显示相同的成本、现金流和合法操作。
- 投资前后预览正确映射规则引擎结果。
- AI 摘要正确显示 Rat Race 或 Fast Track 进度。
- 键盘可操作按钮、抽屉和对话框。
- 金额过长时不溢出容器。

### 5.8 浏览器端到端测试

使用 Playwright 覆盖少量高价值完整流程：

1. 引导模式加 1 个 AI，从开始页进入游戏并看到首次教学。
2. 标准模式加 3 个 AI，不出现教学弹窗。
3. 真人完成掷骰、Payday、投资、借款和回合结束。
4. AI 自动完成回合，玩家可跳过 AI 动画。
5. 刷新后恢复到同一待决策状态。
6. 真人进入快车道并通过现金流获胜。
7. AI 通过 Dream 获胜并显示结算页。
8. 桌面与移动视口中，事件、操作按钮和关键金额无重叠。

E2E 测试使用固定卡组、固定骰子序列和测试专用场景，不依赖碰运气走到目标格。

## 6. 推荐测试比例

```text
规则单元与状态机测试     约 70%
场景、属性、AI 模拟测试  约 20%
组件与浏览器 E2E         约 10%
```

最重要的是规则核心，不应把主要信心建立在截图或大量慢速浏览器测试上。

## 7. 开发阶段质量门槛

每次提交执行：

- 类型检查
- 规则单元测试
- 状态机测试
- 组件测试
- 格式和 lint

合并主分支前执行：

- 全部场景测试
- 属性测试
- 至少 1,000 局 AI 模拟
- Playwright 核心路径

发布候选版本执行：

- 10,000 局 AI 模拟
- 全量桌面和移动 E2E
- 存档升级与损坏恢复测试
- 固定种子回放一致性测试

## 8. 多人联机为什么可以复用

单机版和联机版的主要区别应只在命令传输与状态保存位置：

```text
单机：UI -> Local Game Host -> Game Core -> IndexedDB
联机：UI -> WebSocket Server -> Game Core -> Database
```

规则核心、命令类型、事件类型、AI 和大部分 UI 都可以复用。

未来服务器成为权威主机：

1. 客户端发送命令，不发送修改后的状态。
2. 服务器验证命令并执行规则引擎。
3. 服务器保存新 revision 和事件。
4. 服务器向所有相关客户端广播各自可见的事件和状态投影。
5. 客户端只渲染服务器确认后的结果。

## 9. 现在必须预留的多人能力

### 9.1 稳定身份

所有玩家、资产、卡牌和待决策都使用稳定 ID，不使用数组索引作为身份。

```text
player-01
asset-0042
decision-0088
```

### 9.2 状态 revision

每次成功命令后 `revision + 1`。命令携带客户端看到的 revision：

```ts
type CommandEnvelope = {
  commandId: string;
  gameId: string;
  actorId: string;
  expectedRevision: number;
  command: GameCommand;
};
```

服务器发现 revision 过期时拒绝命令并要求客户端同步，避免重复点击或并发响应覆盖状态。

### 9.3 幂等命令

每个命令有唯一 `commandId`。同一命令因断线重发时，只执行一次。

### 9.4 玩家视图投影

不要让 UI 直接读取完整 `GameState`。提供：

```ts
projectGameView(state, viewerId): PlayerGameView
```

即使首版所有财务信息公开，也要隐藏：

- 未抽取的牌堆顺序。
- 随机源内部状态。
- AI 内部评分。
- 其他玩家尚未提交的选择。

### 9.5 待决策队列

Market 可能要求多名玩家依次响应。不要通过页面弹窗顺序隐式控制，应在状态中明确保存：

```ts
type PendingDecision = {
  id: string;
  kind: 'market-response' | 'opportunity' | 'charity';
  eligiblePlayerIds: string[];
  currentResponderId: string;
  responses: Record<string, unknown>;
};
```

这能直接支持未来不同设备上的玩家异步响应。

### 9.6 时间不是规则核心

首版 AI 动画的 400 至 800 毫秒等待不能写进规则状态。未来联机的回合倒计时也应由服务器应用层管理，再通过“超时自动提交命令”进入核心。

## 10. 未来多人扩展步骤

### 阶段一：本地权威主机

- 浏览器内运行 Game Core。
- 真人与 AI 都提交命令。
- IndexedDB 保存快照和事件。
- 完成确定性回放。

### 阶段二：本地多席位测试

- 在开发模式下让多个浏览器标签连接同一个本地游戏主机。
- 验证玩家视图、轮序、Market 多人响应和重复命令。
- 暂不做账号与匹配。

### 阶段三：私密房间联机

- 增加服务器权威 Game Core。
- 使用房间码加入。
- WebSocket 同步命令和事件。
- 支持断线重连和服务器快照恢复。
- AI 由服务器运行，用于空位或掉线托管。

### 阶段四：完整多人产品

- 用户账号。
- 公共匹配。
- 房主权限和踢人。
- 回合计时与超时处理。
- 观战、聊天、举报和运营功能。

## 11. 多人扩展的新增难点

即使规则核心可复用，联机仍会新增以下工作：

- 房间创建、加入和离开。
- 断线重连与状态追赶。
- 命令重复、乱序和并发冲突。
- 服务器持久化和版本迁移。
- 回合超时与挂机处理。
- 隐藏信息与反作弊。
- 部署、监控和故障恢复。
- 账号、聊天和内容治理。

因此“方便扩展”不等于只加一个 WebSocket。合理预期是：规则和大部分 UI 可复用，但联机基础设施仍是一个独立开发阶段。

## 12. 建议目录结构

```text
src/
  game-core/
    commands/
    events/
    rules/
    state/
    projections/
    random/
    replay/
  game-app/
    local-game-host.ts
    ai-controller.ts
    save-game.ts
  ui/
    components/
    pages/
    tutorials/
  test-support/
    builders/
    fixed-random.ts
    scenarios/
```

未来增加：

```text
server/
  game-host/
  rooms/
  transport/
  persistence/
```

服务器直接依赖共享的 `game-core`，不复制一套规则代码。

## 13. 首版验收补充

在现有 MVP 完成标准之外，增加：

1. `game-core` 可在 Node.js 测试环境运行，不依赖浏览器。
2. UI 和 AI 只能通过命令接口改变游戏状态。
3. 所有随机行为可由固定种子复现。
4. 任意时点保存、载入后继续执行，结果与未刷新一致。
5. 规则引擎拒绝非法命令且不产生部分状态修改。
6. 1 至 3 个 AI 连续模拟 10,000 局，无非法命令和死循环。
7. 同一事件日志可以重建相同最终状态。
8. `projectGameView` 不泄露牌堆顺序和随机源状态。
9. 每个状态变更都有递增 revision。
10. 命令具有唯一 ID，并为未来幂等执行保留接口。

满足这些条件后，从单机迁移到服务器权威多人模式不需要重写财务规则、回合状态机或基础 AI。