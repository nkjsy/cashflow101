import type { DoodadCard, FastTrackBusiness, FastTrackRisk, FastTrackSpaceType, MarketCard, Opportunity, SpaceType } from './types'

export const BOARD: SpaceType[] = [
  'opportunity',
  'doodad',
  'opportunity',
  'charity',
  'opportunity',
  'payday',
  'opportunity',
  'market',
  'opportunity',
  'doodad',
  'opportunity',
  'downsized',
  'opportunity',
  'payday',
  'opportunity',
  'market',
  'opportunity',
  'doodad',
  'opportunity',
  'baby',
  'opportunity',
  'payday',
  'opportunity',
  'market',
]

export const FAST_TRACK_BOARD: FastTrackSpaceType[] = [
  'cashflow-day',
  'business',
  'risk',
  'dream',
  'cashflow-day',
  'dream',
  'business',
  'risk',
  'cashflow-day',
  'dream',
  'dream',
  'risk',
  'business',
  'cashflow-day',
  'dream',
  'business',
  'risk',
  'dream',
  'cashflow-day',
  'dream',
  'business',
  'risk',
  'business',
  'dream',
]

export const FAST_TRACK_BUSINESSES: FastTrackBusiness[] = [
  {
    id: 'fast-track-clean-energy',
    name: '社区清洁能源网络',
    description: '为多个街区提供分布式能源服务。',
    cost: 180000,
    cashFlow: 14000,
    sector: 'infrastructure',
  },
  {
    id: 'fast-track-logistics',
    name: '区域物流中心',
    description: '连接本地商户与城市配送网络。',
    cost: 260000,
    cashFlow: 16000,
    sector: 'logistics',
  },
  {
    id: 'fast-track-learning',
    name: '职业教育平台',
    description: '面向新职业提供实训和就业服务。',
    cost: 420000,
    cashFlow: 18000,
    sector: 'education',
  },
  {
    id: 'fast-track-healthcare',
    name: '城市健康管理网络',
    description: '连接诊所、体检与企业健康服务。',
    cost: 230000,
    cashFlow: 15000,
    sector: 'healthcare',
  },
  {
    id: 'fast-track-food-network',
    name: '区域食品供应链',
    description: '连接农场、仓储和社区门店。',
    cost: 320000,
    cashFlow: 17000,
    sector: 'community',
  },
  {
    id: 'fast-track-software',
    name: '企业软件服务平台',
    description: '向中小企业提供订阅制运营软件。',
    cost: 360000,
    cashFlow: 20000,
    sector: 'technology',
  },
  {
    id: 'fast-track-water',
    name: '城市节水基础设施',
    description: '通过长期合约运营节水设施。',
    cost: 480000,
    cashFlow: 22000,
    sector: 'infrastructure',
  },
  {
    id: 'fast-track-media',
    name: '数字内容版权库',
    description: '持有并授权教育与娱乐内容版权。',
    cost: 550000,
    cashFlow: 24000,
    sector: 'technology',
  },
]

const LEGACY_FAST_TRACK_BUSINESS_CASH_FLOWS = [20000, 30000, 50000, 25000, 35000, 40000, 55000, 65000]
const INCOME_SCALED_FAST_TRACK_BUSINESS_CASH_FLOWS = [8000, 10000, 12000, 9000, 11000, 13000, 14000, 15000]

const fastTrackBusinessWithCashFlow = (business: FastTrackBusiness, cashFlows: number[]): FastTrackBusiness => ({
  ...business,
  cashFlow: cashFlows[FAST_TRACK_BUSINESSES.findIndex((candidate) => candidate.id === business.id)] ?? business.cashFlow,
})

export const legacyFastTrackBusiness = (business: FastTrackBusiness) =>
  fastTrackBusinessWithCashFlow(business, LEGACY_FAST_TRACK_BUSINESS_CASH_FLOWS)

export const incomeScaledFastTrackBusiness = (business: FastTrackBusiness) =>
  fastTrackBusinessWithCashFlow(business, INCOME_SCALED_FAST_TRACK_BUSINESS_CASH_FLOWS)

export const FAST_TRACK_DREAM_COST = 250000

export const FAST_TRACK_RISKS: FastTrackRisk[] = [
  { id: 'risk-tax-audit', name: '税务审计', description: '补缴税款与专业服务费。', effect: 'cash-percent', amount: 0.2 },
  { id: 'risk-lawsuit', name: '商业诉讼', description: '支付和解金与律师费。', effect: 'cash-fixed', amount: 150000 },
  { id: 'risk-divorce', name: '离婚财产分割', description: '可动用现金减少一半。', effect: 'cash-percent', amount: 0.5 },
  { id: 'risk-bad-partner', name: '合伙人违约', description: '收益日收入永久下降。', effect: 'income-percent', amount: 0.1 },
  { id: 'risk-maintenance', name: '重大维护', description: '基础设施需要紧急维护。', effect: 'cash-fixed', amount: 75000 },
  { id: 'risk-business-loss', name: '经营损失', description: '一次性承担业务损失。', effect: 'cash-fixed', amount: 100000 },
]

export const SMALL_DEALS: Opportunity[] = [
  {
    id: 'asset-neighborhood-laundry',
    name: '社区洗衣店',
    kind: 'business',
    dealSize: 'small',
    description: '稳定的社区服务生意，设备已经完成更新。',
    downPayment: 4000,
    mortgage: 16000,
    cashFlow: 560,
  },
  {
    id: 'asset-studio-apartment',
    name: '单身公寓',
    kind: 'real-estate',
    dealSize: 'small',
    description: '靠近地铁的小户型，出租需求稳定。',
    downPayment: 6000,
    mortgage: 44000,
    cashFlow: 850,
  },
  {
    id: 'asset-vending-route',
    name: '自动售货机路线',
    kind: 'business',
    dealSize: 'small',
    description: '一组已有固定点位的自动售货机。',
    downPayment: 2500,
    mortgage: 7500,
    cashFlow: 380,
  },
  {
    id: 'asset-small-warehouse',
    name: '小型仓储单元',
    kind: 'real-estate',
    dealSize: 'small',
    description: '为周边商户提供短租仓储空间。',
    downPayment: 8500,
    mortgage: 61500,
    cashFlow: 1200,
  },
  { id: 'stock-nova', name: 'NOVA 科技股', kind: 'stock', dealSize: 'small', symbol: 'NOVA', quantity: 100, costPerUnit: 10, description: '价格低位的成长型公司股票。', downPayment: 1000, mortgage: 0, cashFlow: 0 },
  { id: 'stock-harbor', name: 'HARB 港口股', kind: 'stock', dealSize: 'small', symbol: 'HARB', quantity: 100, costPerUnit: 20, description: '周期性港口运营公司股票。', downPayment: 2000, mortgage: 0, cashFlow: 0 },
  { id: 'fund-index', name: '城市指数基金', kind: 'fund', dealSize: 'small', symbol: 'CITY', quantity: 50, costPerUnit: 40, description: '分散持有本地龙头企业。', downPayment: 2000, mortgage: 0, cashFlow: 40 },
  { id: 'cd-community', name: '社区银行存单', kind: 'cd', dealSize: 'small', symbol: 'CD12', quantity: 1, costPerUnit: 3000, description: '提供稳定利息收入的一年期存单。', downPayment: 3000, mortgage: 0, cashFlow: 90 },
  { id: 'asset-parking', name: '社区停车位', kind: 'real-estate', dealSize: 'small', description: '住宅区内长期出租的停车位。', downPayment: 3500, mortgage: 11500, cashFlow: 430 },
  { id: 'asset-coffee-cart', name: '移动咖啡车', kind: 'business', dealSize: 'small', description: '办公区内已有固定客群的咖啡车。', downPayment: 5000, mortgage: 10000, cashFlow: 620 },
]

export const BIG_DEALS: Opportunity[] = [
  { id: 'asset-apartment-8', name: '8 户公寓楼', kind: 'real-estate', dealSize: 'big', description: '入住率稳定的小型公寓楼。', downPayment: 18000, mortgage: 142000, cashFlow: 2600 },
  { id: 'asset-apartment-16', name: '16 户公寓楼', kind: 'real-estate', dealSize: 'big', description: '需要专业管理的中型公寓楼。', downPayment: 32000, mortgage: 288000, cashFlow: 4300 },
  { id: 'asset-office', name: '社区办公楼', kind: 'real-estate', dealSize: 'big', description: '与多家本地企业签订长期租约。', downPayment: 25000, mortgage: 225000, cashFlow: 3500 },
  { id: 'asset-carwash', name: '自动洗车场', kind: 'business', dealSize: 'big', description: '设备自动化程度高，人工成本较低。', downPayment: 22000, mortgage: 78000, cashFlow: 3000 },
  { id: 'asset-clinic', name: '社区诊所合伙份额', kind: 'business', dealSize: 'big', description: '成熟诊所的少数合伙权益。', downPayment: 30000, mortgage: 70000, cashFlow: 3900 },
  { id: 'asset-storage', name: '自助仓储中心', kind: 'real-estate', dealSize: 'big', description: '拥有多种尺寸单元的自助仓储中心。', downPayment: 28000, mortgage: 172000, cashFlow: 3800 },
  { id: 'asset-solar', name: '商业屋顶光伏组合', kind: 'business', dealSize: 'big', description: '通过长期购电协议产生收入。', downPayment: 40000, mortgage: 160000, cashFlow: 5200 },
  { id: 'asset-franchise', name: '连锁餐饮加盟店', kind: 'business', dealSize: 'big', description: '成熟品牌的新区域门店。', downPayment: 35000, mortgage: 115000, cashFlow: 4500 },
]

export const OPPORTUNITIES: Opportunity[] = [...SMALL_DEALS, ...BIG_DEALS]

export const DOODADS: DoodadCard[] = [
  { id: 'doodad-phone', name: '更换手机', description: '旧手机损坏，需要立即更换。', cost: 600 },
  { id: 'doodad-car-repair', name: '汽车维修', description: '车辆需要一次计划外维修。', cost: 900 },
  { id: 'doodad-holiday', name: '家庭假期', description: '安排一次短途家庭旅行。', cost: 1200, perChild: 150 },
  { id: 'doodad-appliance', name: '家电故障', description: '重要家电需要更换。', cost: 750 },
  { id: 'doodad-school', name: '课外活动', description: '为孩子支付本期活动费用。', cost: 0, perChild: 400 },
  { id: 'doodad-wedding', name: '参加婚礼', description: '旅行、礼物与住宿支出。', cost: 1000 },
  { id: 'doodad-subscription', name: '年度会员续费', description: '多个服务集中到期。', cost: 450 },
  { id: 'doodad-dental', name: '牙科治疗', description: '保险未覆盖的治疗费用。', cost: 1400 },
  { id: 'doodad-furniture', name: '更换家具', description: '必要的家具更新。', cost: 800 },
  { id: 'doodad-course', name: '职业进修', description: '参加一次职业技能课程。', cost: 1100 },
]

export const MARKETS: MarketCard[] = [
  { id: 'market-laundry', type: 'asset-offer', name: '服务业整合', description: '连锁集团收购社区洗衣店。', assetId: 'asset-neighborhood-laundry', salePrice: 28000 },
  { id: 'market-apartment', type: 'asset-offer', name: '住宅需求上涨', description: '投资者按投入权益的 4 倍收购所有住宅类资产。', assetKind: 'real-estate', equityMultiple: 4 },
  { id: 'market-business', type: 'asset-offer', name: '本地企业收购潮', description: '买方按投入权益的 3 倍收购成熟小企业。', assetKind: 'business', equityMultiple: 3 },
  { id: 'market-nova-high', type: 'asset-offer', name: 'NOVA 发布新品', description: 'NOVA 股价上涨至每股 35。', assetId: 'stock-nova', pricePerUnit: 35 },
  { id: 'market-nova-low', type: 'asset-offer', name: 'NOVA 盈利预警', description: '市场恐慌，NOVA 跌至每股 4。', assetId: 'stock-nova', pricePerUnit: 4 },
  { id: 'market-harbor-high', type: 'asset-offer', name: '港口吞吐量创新高', description: 'HARB 股价上涨至每股 45。', assetId: 'stock-harbor', pricePerUnit: 45 },
  { id: 'market-harbor-low', type: 'asset-offer', name: '港口需求萎缩', description: 'HARB 跌至每股 8。', assetId: 'stock-harbor', pricePerUnit: 8 },
  { id: 'market-city-high', type: 'asset-offer', name: '指数基金上涨', description: 'CITY 基金价格升至每份 55。', assetId: 'fund-index', pricePerUnit: 55 },
  { id: 'market-city-low', type: 'asset-offer', name: '市场全面回调', description: 'CITY 基金跌至每份 25。', assetId: 'fund-index', pricePerUnit: 25 },
  { id: 'market-nova-split', type: 'security-split', name: 'NOVA 一拆二', description: '持股数量翻倍，每股成本减半。', symbol: 'NOVA', multiplier: 2 },
  { id: 'market-harbor-reverse', type: 'security-split', name: 'HARB 二合一', description: '持股数量减半，每股成本翻倍。', symbol: 'HARB', multiplier: 0.5 },
  { id: 'market-property-boom', type: 'asset-offer', name: '商业地产繁荣', description: '买方收购大型商业地产。', assetId: 'asset-office', salePrice: 320000 },
  { id: 'market-storage-boom', type: 'asset-offer', name: '仓储需求激增', description: '基金收购自助仓储中心。', assetId: 'asset-storage', salePrice: 250000 },
]

export const PROFESSIONS = [
  {
    title: '教师',
    salary: 3300,
    expenses: 2550,
    savings: 2200,
    perChildExpense: 180,
    fixedExpenses: { taxes: 630, mortgage: 500, educationLoan: 60, carLoan: 100, creditCard: 90, living: 1170 },
    summary: '收支均衡，适合熟悉现金流基础。',
  },
  {
    title: '工程师',
    salary: 4900,
    expenses: 3860,
    savings: 3300,
    perChildExpense: 250,
    fixedExpenses: { taxes: 1050, mortgage: 700, educationLoan: 120, carLoan: 140, creditCard: 100, living: 1750 },
    summary: '收入与月结余较高，但家庭支出也较高。',
  },
  {
    title: '护士',
    salary: 3100,
    expenses: 2380,
    savings: 2000,
    perChildExpense: 170,
    fixedExpenses: { taxes: 580, mortgage: 450, educationLoan: 80, carLoan: 90, creditCard: 80, living: 1100 },
    summary: '支出较低，现金储备需要谨慎管理。',
  },
  {
    title: '维修技师',
    salary: 2500,
    expenses: 1880,
    savings: 1600,
    perChildExpense: 140,
    fixedExpenses: { taxes: 430, mortgage: 350, educationLoan: 40, carLoan: 80, creditCard: 60, living: 920 },
    summary: '收入最低，但支出和育儿成本也最低。',
  },
  {
    title: '会计师',
    salary: 4000,
    expenses: 3060,
    savings: 2600,
    perChildExpense: 210,
    fixedExpenses: { taxes: 820, mortgage: 600, educationLoan: 100, carLoan: 120, creditCard: 80, living: 1340 },
    summary: '现金储备较多，月结余处于中等水平。',
  },
  {
    title: '警员',
    salary: 3600,
    expenses: 2780,
    savings: 2400,
    perChildExpense: 190,
    fixedExpenses: { taxes: 700, mortgage: 540, educationLoan: 60, carLoan: 130, creditCard: 80, living: 1270 },
    summary: '收入、储蓄与家庭支出较为均衡。',
  },
  {
    title: '医生',
    salary: 7600,
    expenses: 6000,
    savings: 5100,
    perChildExpense: 380,
    fixedExpenses: { taxes: 1900, mortgage: 1100, educationLoan: 700, carLoan: 280, creditCard: 150, living: 1870 },
    summary: '收入很高，但教育贷款和固定支出压力最大。',
  },
  {
    title: '律师',
    salary: 6200,
    expenses: 4900,
    savings: 4200,
    perChildExpense: 320,
    fixedExpenses: { taxes: 1450, mortgage: 900, educationLoan: 420, carLoan: 230, creditCard: 140, living: 1760 },
    summary: '月结余与初始储蓄较高，但债务支出较重。',
  },
] as const

const LEGACY_PROFESSION_SAVINGS: Record<string, number> = {
  教师: 1800,
  工程师: 3500,
  护士: 1800,
  维修技师: 1900,
  会计师: 2200,
  警员: 2000,
  医生: 7500,
  律师: 5500,
}

export const legacyProfessionSavings = (profession: string, fallback: number) =>
  LEGACY_PROFESSION_SAVINGS[profession] ?? fallback

export const professionByTitle = (title: string) =>
  PROFESSIONS.find((profession) => profession.title === title)

export const DREAMS = [
  '开一家社区图书馆',
  '环游世界一年',
  '建立青年创业基金',
  '拥有一间山中小屋',
  '资助一所乡村学校',
  '制作一部独立电影',
  '建立社区健康中心',
  '创办一座公益艺术馆',
]

export const FAST_TRACK_DREAM_COSTS = Object.fromEntries(
  DREAMS.map((dream, index) => [dream, [200000, 300000, 250000, 450000, 350000, 500000, 275000, 400000][index]]),
) as Record<string, number>

export const fastTrackDreamCost = (dream: string, beginningIncome: number, incomeMultiple = 12) =>
  Math.max(FAST_TRACK_DREAM_COSTS[dream] ?? FAST_TRACK_DREAM_COST, beginningIncome * incomeMultiple)

export const FAST_TRACK_DREAM_BY_POSITION = Object.fromEntries(
  FAST_TRACK_BOARD
    .map((space, position) => ({ space, position }))
    .filter(({ space }) => space === 'dream')
    .map(({ position }, index) => [position, DREAMS[index]]),
) as Record<number, string>