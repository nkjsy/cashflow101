# CASHFLOW 101 规则与边界调研

> 调研日期：2026-07-12  
> 目标版本：经典 `CASHFLOW 101`，并以可公开读取的 2020 版说明和财务表补足细节  
> 用途：个人学习型电子原型的规则引擎设计，不作为官方规则书替代品

## 1. 结论摘要

游戏分为内圈 Rat Race 和外圈 Fast Track。玩家在内圈维护收入表与资产负债表，通过投资增加被动收入；当被动收入严格大于总支出时进入快车道。快车道有两种胜利路径：购买开局选择的 Dream，或把 Cashflow Day Income 从进入快车道时的基准提高 `$50,000`。

本轮扩大检索后，以下争议已得到较强证据解决：

- 快车道起始收入不是“内圈月现金流乘 100”，而是**退出内圈时的被动收入，先四舍五入到最近的 `$1,000`，再乘 100**。
- 快车道现金流胜利线是 `Beginning Cashflow Day Income + $50,000`，不是现金余额达到 `$50,000`。
- 开局现金为 `月现金流 + 储蓄`；储蓄只在开局发放一次，随后从财务表删除。
- Charity 支付总收入的 10%，换取接下来 3 个自己的回合可选 1 或 2 颗骰子。
- Baby 最多 3 个。
- Downsized 的经典规则效果是支付一个月总支出并失去 2 个回合；某些培训规则会修改它，不能混入经典模式。
- Payday 在经过或停留时触发，但玩家必须在自己的回合结束前向 Banker 领取，否则放弃该次收入。

以下仍没有取得可公开核验的官方完整段落：Market 是否明确允许所有玩家响应、玩家间交易的完整窗口、经典版破产清算顺序。电子版应把这些做成版本配置，并采用本文给出的保守默认值。

## 2. 证据等级

| 等级 | 定义 | 实现用途 |
| --- | --- | --- |
| A | 可读取的规则书扫描、官方版权财务表或官方组件文字 | 可作为默认正式规则 |
| B | 多份规则资料一致，或有规则书摘要加独立实现交叉支持 | 可作为默认规则，并保留版本字段 |
| C | 玩家培训材料、社区 FAQ 或两个独立实现形成共识 | 可作为兼容默认值，必须记录来源 |
| D | 单一非官方实现、家规或推断 | 只能作为可选规则或测试假设 |

注意：Scribd 上的文件由第三方上传，但其中 2020 快车道财务表带有 `© 2020 CASHFLOW Technologies, Inc.` 标记。本文仅记录短规则事实和公式，不复制卡牌、美术或大段文字。

## 3. 游戏目标

### 3.1 Rat Race

退出条件：

```text
Passive Income > Total Expenses
```

必须是严格大于，不是大于等于。证据等级：A。

### 3.2 Fast Track

满足任一条件即胜利：

1. 落在自己开局选择的 Dream，并完成购买。
2. 购买快车道企业，使当前 Cashflow Day Income 达到目标值。

```text
Fast Track Goal = Beginning Cashflow Day Income + 50,000
```

证据等级：A。`$50,000` 是快车道现金流增量，不是现金余额、总资产或内圈被动收入。

## 4. 开局设置

1. 选出 Banker。Banker 可以同时参赛，但必须把个人现金与银行现金分开。
2. 分别洗混 Big Deal、Small Deal、Market 和 Doodads 牌堆，放到对应位置。
3. 每人领取一张双面 Financial Statement。Rat Race 使用收入表/资产负债表面，Fast Track 使用 Congratulations 面。
4. 随机发职业卡，并把职业卡字段原样填入财务表。
5. 每名玩家开局无银行贷款、无银行贷款支出、无孩子。
6. 每名玩家右手边的玩家担任其 Auditor；每次财务表变化都应核对。
7. Banker 发放开局现金：

```text
Starting Cash = Monthly Cash Flow + Savings
Monthly Cash Flow = Total Income - Total Expenses
```

8. Savings 仅发放一次，发放后从财务表中删除。
9. 每人选择同色 Rat、Cheese 和标记物。Rat 放在 Rat Race 起点；Cheese 放在一个 Dream 上。2020 说明允许多人选择同一个 Dream。
10. 所有人掷 1 颗骰子，点数最高者先手；之后按左手方向轮流。并列重掷属于合理实现细节，但公开摘要未给出原文。

证据等级：A。

## 5. 财务模型

### 5.1 派生值

```text
Passive Income = Interest + Dividends + Real Estate Cash Flow + Business Cash Flow
Total Income = Salary + Passive Income
Total Expenses = 固定支出 + Child Expenses + Bank Loan Payment + 其他持续支出
Monthly Cash Flow = Total Income - Total Expenses
Child Expenses = Number of Children × Per Child Expense
```

资产、负债、收入和支出应保存为基础状态；上述合计值应由规则引擎重算，不能让客户端任意写入。

### 5.2 Auditor

桌游中的 Auditor 是玩家右手边的人。电子版应改为自动校验：

- 购买房地产时同步登记资产、抵押负债和现金流。
- 出售房地产时同步移除资产、对应负债和现金流。
- 借还银行贷款时同步更新现金、贷款余额和银行贷款支出。
- 每次状态变化后重新计算退出 Rat Race 的条件。

## 6. Rat Race 回合流程

建议按以下状态机实现：

```text
TURN_START
  -> SKIP_CHECK
  -> CHOOSE_DICE_COUNT
  -> ROLL
  -> MOVE_STEPWISE
  -> PAYDAY_PATH_TRIGGERS
  -> RESOLVE_LANDING_SPACE
  -> RECOMPUTE_FINANCIALS
  -> INSOLVENCY_CHECK
  -> FAST_TRACK_CHECK
  -> TURN_END
```

### 6.1 掷骰和移动

- Rat Race 默认掷 1 颗骰子。
- Charity 有效期间，每个有效回合可选择掷 1 或 2 颗骰子。
- 顺时针移动。
- 多个玩家可以停在同一格，彼此不受影响。
- 即使已有玩家进入 Fast Track，轮序仍不改变。

证据等级：A。

### 6.2 Payday

- 经过或停在 Payday 都结算当前 Monthly Cash Flow。
- Monthly Cash Flow 为正则增加现金；为负则减少现金。
- 经典桌游要求玩家在自己的回合结束前主动向 Banker 领取；忘记则失去该次收入。
- 电子版不应要求玩家记忆点击。建议自动结算，并在事件日志中保留 `payday_triggered`。
- 移动应逐段检查路径上的每个 Payday，而不是只比较起点和终点。

关于一次移动跨越多个 Payday：公开说明使用“经过或停在一个 Payday”而未说明每回合上限。双骰最多 12 点，而内圈 Payday 间距可能小于 12，因此规则引擎应按**每个被跨越的 Payday 各结算一次**。这是与棋盘语义最一致的默认解释，证据等级：B；可增加 `paydayOncePerTurn` 兼容开关。

## 7. Rat Race 格子与卡牌

### 7.1 Small Deal / Big Deal

- 落在 Deal/Opportunity 后选择相应牌堆，阅读卡牌，再决定是否购买。
- 购买不是强制行为。
- Big Deal 与 Small Deal 的准确资金分界在不同资料中存在 `$5,000` / `$6,000` 的表述差异。不要按数值动态分类，直接由牌堆类型决定。
- 股票、基金、存单通常记录代码、持有数量和每股成本。
- 房地产/企业通常记录首付、总成本、抵押或相关负债及月现金流。

证据等级：B。

### 7.2 Market

- 落在 Market 时抽牌并执行报价或全局市场效果。
- 市场出售房地产时，净收入通常为销售价减去对应抵押贷款；随后移除该资产、抵押负债和月现金流。
- 拆股和反向拆股应影响所有持有该证券的玩家，而不只当前玩家。两个公开实现中至少一个明确遍历所有持有者，且这符合全局市场事件的语义。证据等级：C。
- `cashflow-holmes` 将房地产和贵金属 Market 卡设为 group response，允许所有玩家响应；`CashFlowJs` 只检查当前玩家。由于实现冲突且未取得官方完整段落，Market 出售参与者仍为未决项。

建议默认：所有符合卡牌条件的玩家都可响应，按当前玩家开始、顺时针依次决定；每人独立出售，不争夺有限买方额度。配置项：

```text
marketEligiblePlayers = ALL_MATCHING | ACTIVE_ONLY
marketResolutionOrder = TURN_ORDER | SIMULTANEOUS
```

默认 `ALL_MATCHING + TURN_ORDER`，证据等级：C。

### 7.3 Doodads

- Doodads 是强制支出，不可选择拒付。
- 现金不足时可以向银行借款支付。
- 某些 Doodad 具有条件，例如只对有孩子的玩家生效；具体条件由卡牌效果定义。

证据等级：A。

### 7.4 Charity

落在 Charity 后可选择：

```text
Donation = Total Income × 10%
Benefit = 接下来 3 个自己的回合可选掷 1 或 2 颗骰子
```

- 捐赠可选，不捐则无效果。
- 若现金不足，不能捐赠；是否允许先借款再捐没有公开官方段落。建议默认不允许为 Charity 借款。
- 两个实现都在轮到该玩家时消耗 Charity 计数；`cashflow-holmes` 在 Downsized 跳过回合时也减少计数。因此 Charity 的“next 3 turns”应包含被跳过的回合。证据等级：C。
- 再次捐赠是否叠加没有官方公开段落。实现采用 `+3`。建议默认叠加，但上限可配置。

### 7.5 Baby

- 增加孩子数量 1。
- 按职业卡的 Per Child Expense 增加每月支出。
- 最多 3 个孩子；已有 3 个时落在 Baby 不再增加。

证据等级：A。

### 7.6 Downsized

语义上这是失业期间继续承担家庭开支，不是向公司缴纳罚款。核验到的经典手册和 2020 说明材料均未写入 severance pay、compensation 或领取遣散费；若加入裁员补偿，应明确标为自定义规则。

经典规则效果：

```text
立即支付 Total Expenses
失去接下来的 2 个自己的回合
```

证据等级：B。公开的 [Guide to Cashflow 101 Training](https://www.scribd.com/document/84035868/Guide-to-Cashflow-101-Training) 明确把“不再失去 2 回合”标为 modified rule，反向证明经典规则包含失去 2 回合；[CASHFLOW Board Game Instructions 2020](https://www.scribd.com/document/748086209/CASHFLOW-Board-Game-Instructions-2020) 及公开旧版手册未出现裁员补偿条款。

边界处理建议：

- 现金不足时必须先借款或进入资不抵债处理，不能直接忽略事件。
- 跳过的回合仍算“自己的回合”，因此 Charity 计数递减。
- 跳过回合不掷骰、不移动、不触发 Payday 和落点事件。
- 记录 `skippedTurns = 2`。不要因回合切换实现细节而把领域状态写成 3。

## 8. 贷款和偿还

### 8.1 银行贷款

经典常见规则：

```text
Loan Unit = 1,000
Monthly Bank Loan Payment = Outstanding Bank Loan × 10%
```

即每借 `$1,000`，现金增加 `$1,000`，负债增加 `$1,000`，月支出增加 `$100`。偿还时反向更新。证据等级：B。

### 8.2 时点

公开规则摘要确认 Doodad 不足时可借款，但未取得“任何时候均可借还”或“只能在掷骰前借款”的官方完整段落。现有可读取材料也没有要求玩家在看到 Deal 之前预判贷款。培训家规写明“只能在回合结束时偿还负债”，说明偿还窗口经常被组织者修改。

建议默认：

- 借款：在 Rat Race 自己回合的决策阶段，或解决强制支付时可进行。看到 Small/Big Deal 后可以借款补足首付，再决定购买；不能把借款入口只限制在掷骰之前。
- 偿还：在自己的行动和落点决策完成后、结束回合前进行。它不是掷骰动作的一部分，也不要求在掷骰前偿还。
- Fast Track：不可再向银行借款；培训材料明确如此，但当前只达到 C 级证据。
- 不能借款绕过已经触发的负现金流限制；每次借款后立即重算支出和偿债能力。

配置项：

```text
loanTiming = OWN_TURN_AND_MANDATORY_PAYMENT | ANY_TIME
repaymentTiming = END_OF_OWN_TURN | ANY_OWN_TURN
fastTrackLoansAllowed = false
```

电子版据此在两个位置提供银行操作：回合开始时可主动规划借还款；Deal 展示后若现金不足，则直接显示补足首付的借款操作。借款不会关闭当前 Deal，玩家借款后仍可购买或放弃。

## 9. 股票与资产边界

- 股票可按卡牌报价买入或卖出部分数量。
- 拆股：持有数量乘 2，每股成本除以 2。
- 反向拆股：持有数量除以 2，每股成本乘 2。
- 奇数股反向拆分的取整方式未取得官方段落。公开实现一个使用向上取整，另一个直接除 2，存在冲突。应由卡牌文字或版本配置决定。
- 房地产出售时必须清掉对应抵押，不应只删除资产。
- 市场成交价低于抵押余额时，差额应从现金扣除；若无法支付，进入资不抵债流程。
- 不应允许部分出售单套房地产；股票可以部分出售。

## 10. 退出 Rat Race

每次会改变被动收入或总支出的原子事务完成后检查：

```text
if Passive Income > Total Expenses:
    eligibleForFastTrack = true
```

退出应在当前卡牌/交易完整结算后发生，不能在资产与负债只更新一半时发生。公开实现会在买入房地产或偿还贷款后立即检查，证据等级：B。

建议流程：完成当前事件，重算财务表，自动 Auditor 通过后立即进入 Fast Track，不再等待下一次 Payday。

## 11. Fast Track 初始化

2020 快车道财务表直接给出：

```text
Rounded Passive Income = round(Passive Income to nearest 1,000)
Beginning Cashflow Day Income = Rounded Passive Income × 100
Goal Cashflow Day Income = Beginning Cashflow Day Income + 50,000
```

例：退出时被动收入为 `$12,600`，取整为 `$13,000`：

```text
Beginning Cashflow Day Income = 13,000 × 100 = 1,300,000
Goal = 1,300,000 + 50,000 = 1,350,000
```

证据等级：A。

进入快车道时：

1. 切换到 Fast Track 财务表。
2. 计算 Beginning Cashflow Day Income 与 Goal。
3. 将 Rat 移到 Fast Track 的 Enter Here。
4. 默认使用 2 颗骰子。
5. 不再使用 Rat Race 的工资、支出和 Payday 结算。
6. 是否立即从 Banker 领取一次 Beginning Cashflow Day Income：培训材料称进入时领取，但 2020 财务表公开文字只明确它是 Cashflow Day 收入。建议作为版本配置，默认进入时领取一次，证据等级：C。

配置项：

```text
collectFastTrackIncomeOnEntry = true
```

## 12. Fast Track 回合与格子

- 默认掷 2 颗骰子。
- 经过或停在 Cashflow Day 时领取当前 Cashflow Day Income。
- 购买绿色 Business 后，把该企业月现金流加到 Cashflow Day Income，并立即检查 `$50,000` 增量胜利。
- 落在自己选定的 Dream 并支付其价格后立即获胜。未找到经典规则要求额外掷骰；`CashFlowJs` 的梦想成功判定是自创扩展，不应采用。
- 典型风险格包括 Lawsuit、Tax Audit、Divorce、Bad Partner 和维修类事件。部分公开实现将前三者处理为失去一半现金；这与棋盘文字相符，但完整格子数值仍应由所使用的实体棋盘/原创内容数据驱动。
- 快车道 Charity 可按快车道 Cashflow Day Income 的 10% 捐赠，换取 3 回合双骰选择；当前为 C 级证据。

快车道移动也应逐格检查所有 Cashflow Day。公开 `CashFlowJs` 使用 `else if`，一次移动最多结算一次，且双骰实现错误地把单颗骰点乘以骰数；这些是代码缺陷，不应当作规则。

## 13. 破产与资不抵债

公开可读的 2020 说明确认强制 Doodad 可以借款，但没有暴露完整破产章节。两个开源实现采用不同、且并不完全可靠的判断：

- `cashflow-holmes`：当 `cash + monthlyCashFlow < 0` 时标记即将破产；清算房地产按首付一半、股票按成本一半，之后仍满足条件则出局。
- `CashFlowJs`：当月现金流为负且现金为负时触发；主要只允许房地产按首付一半出售，其他资产处理不完整。

因此“半价清算所有资产”只能达到 C 级，不能标为官方确认。

建议电子版采用明确、可测试的兼容规则：

1. 强制支付或负 Payday 使现金不足时，暂停事件结算。
2. 玩家可借款，前提是借款后的月现金流仍不触发贷款限制。
3. 玩家可选择出售流动资产，或按清算规则出售资产。
4. 清算房地产/企业的回收额为首付的 50%；股票按记录成本的 50%。
5. 对应资产、负债和现金流全部移除。
6. 若清算后仍无法完成当前强制支付，玩家破产并退出游戏。

配置项：

```text
insolvencyTrigger = CANNOT_PAY_MANDATORY_OBLIGATION
liquidationRate = 0.5
liquidationBasis = DOWN_PAYMENT_OR_COST_BASIS
bankruptcyEliminatesPlayer = true
```

这比简单判断现金小于 0 更稳定，也避免把“资产负债表上负债大于资产”误当作立即破产。取得特定版次实体规则书后，应替换这一兼容规则。

## 14. 玩家间交易

本轮仍未取得官方规则书中完整的玩家交易段落。社区常见玩法允许把抽到但不购买的 Deal 转卖给其他玩家，或协商资产交易；但开放任意时点交易会显著改变平衡和多人同步复杂度。

首版建议：

- 不开放任意资产交易。
- 可选开放“当前 Opportunity 转让”：当前玩家在放弃购买前，可向一名其他玩家出售购买权，价格双方协商；交易必须在当前卡牌结算内完成。
- 不允许玩家间贷款。

配置项：

```text
playerAssetTrading = DISABLED | OWN_TURN | ANY_TIME
dealRightTransfer = false
playerToPlayerLoans = false
```

以上均为 D 级兼容设计，不应写成经典官方规则。

## 15. 边界规则决策表

| 问题 | 调研结论 | 证据 | 建议默认值 |
| --- | --- | --- | --- |
| 出圈比较符 | 被动收入严格大于总支出 | A | `>` |
| 快车道起始公式 | 被动收入取整到最近千位后乘 100 | A | `round1000(passive) * 100` |
| 快车道现金流胜利 | 起始 Cashflow Day Income 加 50,000 | A | `baseline + 50000` |
| Dream 胜利 | 落在所选 Dream 并购买 | A/B | 购买后立即胜利 |
| Payday | 经过或停在时结算 | A | 自动结算 |
| 遗漏领取 Payday | 桌游中回合结束前未领取则失去 | A | 电子版自动领取 |
| 多个 Payday | 官方摘要未给每回合上限 | B | 每个经过的格子各触发 |
| Charity | 总收入 10%，持续下 3 个自己回合 | A | 允许选择 1/2 骰 |
| 跳过回合是否消耗 Charity | 两实现一致消耗 | C | 消耗 |
| Charity 是否叠加 | 实现采用 `+3` | C/D | 叠加，可配置上限 |
| Baby | 最多 3 个 | A | 上限 3 |
| Downsized | 支付总支出并失去 2 回合 | B | `skippedTurns = 2` |
| Market 响应者 | 实现冲突 | C | 所有匹配玩家，顺时针 |
| 拆股作用范围 | 应作用所有持有者 | C | 所有持有者 |
| 反向拆股奇数取整 | 未决 | D | 由卡牌/版本指定 |
| 银行贷款 | 1,000 单位，月支出 10% | B | 强制 1,000 步进 |
| Fast Track 借款 | 培训规则称不允许 | C | 不允许 |
| 进入快车道立即领收入 | 培训材料支持 | C | 领取一次，可配置 |
| 半价清算 | 两实现部分支持 | C | 作为兼容规则 |
| 破产触发 | 官方完整段落缺失 | C/D | 无法支付强制义务 |
| 玩家间任意交易 | 官方段落缺失 | D | 首版关闭 |

## 16. 不应从开源实现照抄的行为

### `Sleighs/CashFlowJs`

该项目 README 明确称其包含额外玩法和规则自定义，并声明是非官方 fan creation。以下行为不是经典规则依据：

- 保险、动态税率、Fast Track Mode、Hard Mode、Speed Start。
- 梦想购买后还要掷骰决定成功。
- 进入快车道的代码使用内圈 `payday`，与其“被动收入乘 100”的注释冲突。
- 把 `cashFlowDay` 初始化为 `payday + 50,000`，与官方财务表不符。
- 双骰实现为“一颗骰子的点数乘 2”，而不是两颗独立骰子之和。
- Payday/Cashflow Day 路径判断使用 `else if`，可能漏掉一次移动跨越的第二个结算点。
- Downsized 内部写入 3，依赖 UI 回合切换抵消，不适合作为领域规则。

### `step-8/cashflow-holmes`

该项目有单元测试，适合验证局部状态变化，但没有实现完整 Fast Track。注意：

- 它允许任意贷款数值，测试甚至使用 100，而经典规则应限制 1,000 单位。
- 被动收入模型主要计算房地产，未覆盖所有经典资产类型。
- 破产公式 `cash + cashFlow < 0` 是项目选择，不是已确认官方规则。
- Market group response 是有价值的参考，但仍不是官方证据。

## 17. 电子版规则引擎建议

### 17.1 版本配置

```json
{
  "ruleset": "classic-101-compatible",
  "passiveIncomeComparison": "strict-greater-than",
  "fastTrackPassiveIncomeRounding": 1000,
  "fastTrackInvestmentMultiple": 100,
  "fastTrackCashflowGoalDelta": 50000,
  "collectFastTrackIncomeOnEntry": true,
  "marketEligiblePlayers": "all-matching",
  "marketResolutionOrder": "turn-order",
  "paydayOncePerTurn": false,
  "charitySkippedTurnsConsumeDuration": true,
  "maxChildren": 3,
  "downsizedSkippedTurns": 2,
  "loanUnit": 1000,
  "loanMonthlyPaymentRate": 0.1,
  "fastTrackLoansAllowed": false,
  "liquidationRate": 0.5,
  "playerAssetTrading": "disabled"
}
```

### 17.2 事务顺序

每个效果按以下顺序提交：

1. 校验触发者、时点和目标。
2. 计算现金需求和贷款选择。
3. 原子更新现金、资产、负债、收入和支出。
4. 重算所有派生值。
5. 自动 Auditor 校验。
6. 检查资不抵债。
7. 检查退出 Rat Race 或 Fast Track 胜利。
8. 写入可回放事件日志。

## 18. 必测场景

- 开局现金等于月现金流加储蓄，且储蓄不进入后续 Payday。
- 正、零、负 Monthly Cash Flow 的 Payday。
- 双骰移动一次跨过两个 Payday，两个都结算。
- Charity 支付总收入 10%，连续 3 个自己的回合有效。
- Charity 后立刻 Downsized，两个跳过回合消耗 Charity 计数。
- 第 3 个 Baby 增加支出，第 4 次不变化。
- Downsized 支付总支出并准确跳过两个回合。
- 贷款只能按 1,000 单位，借还后支出同步变化。
- 被动收入等于总支出时不出圈，大于时出圈。
- 快车道被动收入按最近千位取整后乘 100。
- 快车道现金流达到基准加 49,999 不胜，达到加 50,000 获胜。
- Market 的所有匹配玩家按轮序响应。
- 房地产出售后资产、抵押和现金流同时移除。
- 现金不足时进入资不抵债流程，清算失败后出局。
- 相同随机种子和玩家选择序列可完全回放。

## 19. 来源

### A 级：规则书与官方组件扫描

1. [CASHFLOW Board Game Instructions 2020](https://www.scribd.com/document/748086209/CASHFLOW-Board-Game-Instructions-2020)  
   可公开读取目标、设置、轮序、Payday、Doodads、Charity、Baby 等文字。第三方上传的官方说明扫描。
2. [CASHFLOW Fast Track Financial Statement 2020](https://www.scribd.com/document/690699828/CASHFLOW-Fast-Track-Financial-Statement-2020)  
   带 2020 官方版权标记，直接确认被动收入取整、乘 100 和 `$50,000` 目标公式。
3. [Cashflow 101 Manual: Awaken Your Financial Genius](https://www.scribd.com/doc/78845529/Cashflow-101-Manual-Awaken-Your)  
   16 页经典规则书扫描；公开页面可读取 Quick Start、Banker、Auditor 和开局现金等内容。
4. [Kiyosaki Robert - Cashflow The Board Game Manual](https://www.scribd.com/doc/6949982/Kiyosaki-Robert-Cashflow-The-Board-Game-Manual)  
   16 页较早规则书扫描，主要页面为图像，公开 OCR 有限。
5. [Cashflow Player Package Final](https://www.scribd.com/document/327097650/Cashflow-Player-Package-Final)  
   可读取 Rat Race 和 Fast Track 财务表字段及公式。

### C/D 级：培训材料与实现

6. [Guide to Cashflow 101 Training](https://www.scribd.com/document/84035868/Guide-to-Cashflow-101-Training)  
   明确标注 Modified Game Rules，适合识别经典规则与活动家规的差异，不可当作官方规则。
7. [step-8/cashflow-holmes](https://github.com/step-8/cashflow-holmes)  
   多人 Node.js 实现，包含局部单元测试；核心逻辑见 [`player.js`](https://github.com/step-8/cashflow-holmes/blob/main/src/models/player.js)、[`turn.js`](https://github.com/step-8/cashflow-holmes/blob/main/src/models/turn.js) 和 [`game.js`](https://github.com/step-8/cashflow-holmes/blob/main/src/models/game.js)。
8. [Sleighs/CashFlowJs](https://github.com/Sleighs/CashFlowJs)  
   完整度较高但包含大量自定义规则的 fan adaptation；规则参考价值低于官方组件。

### 访问受限或失效

- [Rich Dad 官方经典规则页](https://www.richdad.com/classic-board-game-rules)：当前无法稳定提取正文。
- [BoardGameGeek CASHFLOW 101](https://boardgamegeek.com/boardgame/1552/cashflow-101)：FAQ/文件页在本环境受到访问限制。
- [Cashflow 101 Game Instructions Guide](https://www.scribd.com/doc/257661027/Cashflow-101-Game-Instructions-Home-Pages-1-to-30)：保存了 2014 年网页打印件，但正文多为图像，公开 OCR 有限。

## 20. 棋盘核验结论

经典 Rat Race 公开资料一致支持 Deal/Opportunity、Doodad、Charity、Payday、Market、Downsized 和 Baby 这些格子类型。公开实现 `step-8/cashflow-holmes` 还提供了一个 24 格序列：

```text
Deal, Doodad, Deal, Charity,
Deal, Payday, Deal, Market,
Deal, Doodad, Deal, Downsized,
Deal, Payday, Deal, Market,
Deal, Doodad, Deal, Baby,
Deal, Payday, Deal, Market
```

项目曾使用的 12 格内圈是简化设计，不符合这份 24 格经典结构，现已改为上述分布；界面中的 `Opportunity` 对应 `Deal`，落格后再选择 Small Deal 或 Big Deal。

需要严格区分“规则一致”和“官方逐格复刻”：目前无法从可公开读取的官方棋盘或规则书中独立核验每一格的精确顺序，因此 24 格内圈属于有公开实现交叉支持的规则重建，不应标成官方棋盘复制。Fast Track 的公开资料能确认 Cashflow Day、Business、Dream 和风险类格子，但没有可靠提取到指定版次的完整外圈顺序；项目当前 24 格外圈是机制一致的原创编排，更不能声称与官方逐格相同。

项目不复制官方棋盘美术、卡牌原文或完整组件数据，所有名称、数值、文字和视觉均使用原创内容。

## 21. 仍需实体规则书复核

在把规则集标记为“经典 101 精确复刻”前，还需要对指定发行版次的实体规则书和棋盘确认：

1. Market 报价是否明确对所有玩家开放，以及响应顺序。
2. 玩家间购买权、资产交易和借贷的允许范围与时点。
3. 经典破产触发条件、清算资产范围、价格基准和负债处理顺序。
4. 进入 Fast Track 时是否立即领取一次 Beginning Cashflow Day Income。
5. 一次移动跨过多个 Payday/Cashflow Day 是否逐个领取。
6. 反向拆股遇到奇数股的取整方式。
7. Charity 再次捐赠能否叠加，以及 Downsized 跳过回合是否消耗持续时间。

在取得这些材料前，本文的配置默认值足以支持一个逻辑自洽、可测试的个人学习原型，但不应宣称与所有 `CASHFLOW 101` 发行版完全一致。

## 22. 知识产权边界

- 游戏机制、数学关系和抽象流程可以作为原创规则引擎的参考。
- `CASHFLOW`、`Rich Dad`、角色标志等可能涉及商标。
- 官方卡牌原文、职业数值表、棋盘布局、美术和完整组件数据不应直接复制到公开或商业产品。
- 原型应使用原创名称、职业、数值、卡牌文案、图标和视觉资产；规则内容也应使用自己的表达。