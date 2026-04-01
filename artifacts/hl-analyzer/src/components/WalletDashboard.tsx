import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend,
} from "recharts";
import { WalletResult } from "@workspace/api-client-react/src/generated/api.schemas";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatBox } from "@/components/StatBox";
import { formatCurrency, formatPercent, formatCompact, getColorForValue, cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, CheckCircle2, Skull, Target, Zap,
  Droplets, BarChart2, TrendingUp,
} from "lucide-react";

interface WalletDashboardProps {
  result: WalletResult;
  myMaxPosition?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PositionTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-panel border border-panel-border rounded-lg p-3 text-xs font-mono shadow-xl space-y-1">
      <div>第 {d.idx + 1} 笔</div>
      <div className="text-muted-foreground">{d.date}</div>
      <div className={d.win ? "text-success" : "text-danger"}>
        仓位：{formatCurrency(d.notional)}
      </div>
      <div className="text-[10px] text-muted-foreground">{d.win ? "✅ 盈利" : "❌ 亏损"}</div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PnlTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-panel border border-panel-border rounded-lg p-3 text-xs font-mono shadow-xl space-y-1">
      <div>第 {d.idx + 1} 笔</div>
      <div className={d.pnl >= 0 ? "text-success" : "text-danger"}>
        单笔: {formatCurrency(d.pnl)}
      </div>
      <div className={d.cumulative >= 0 ? "text-success" : "text-danger"}>
        累计: {formatCurrency(d.cumulative)}
      </div>
    </div>
  );
}

export function WalletDashboard({ result, myMaxPosition = 0 }: WalletDashboardProps) {
  const [activeTab, setActiveTab] = useState<number>(
    result.windowStats && result.windowStats.length > 0 ? result.windowStats[0].days : 0
  );

  if (result.error) {
    return (
      <Card className="border-danger/50 bg-danger/5">
        <CardHeader>
          <div className="text-danger flex items-center gap-2 font-mono font-bold">
            <AlertTriangle className="h-5 w-5" />
            {result.wallet}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">获取数据失败：{result.error}</p>
        </CardContent>
      </Card>
    );
  }

  const activeStats = result.windowStats?.find((w) => w.days === activeTab);
  const leekScore = activeStats?.leekScore || 0;
  let scoreColor = "text-success";
  if (leekScore >= 7) scoreColor = "text-danger text-glow-danger";
  else if (leekScore >= 4) scoreColor = "text-warning text-glow-warning";

  const chartData = (activeStats?.pnlSeries ?? []).map((p, idx) => ({
    idx,
    pnl: p.pnl,
    cumulative: p.cumulative,
    date: new Date(p.time).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
  }));

  const positionData = (activeStats?.positionSeries ?? []).map((p, idx) => ({
    idx,
    notional: p.notional,
    win: p.win,
    date: new Date(p.time).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
  }));

  const maxPosition = activeStats?.maxPosition ?? 0;
  const avgPosition = activeStats?.avgPosition ?? 0;
  const followRatio = myMaxPosition > 0 && maxPosition > 0 ? myMaxPosition / maxPosition : null;

  return (
    <Card className="overflow-hidden border-panel-border/80 shadow-2xl glass-panel">
      {/* ── 头部摘要 ── */}
      <div className="bg-panel/50 border-b border-panel-border p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-mono font-bold tracking-tight text-foreground truncate max-w-[200px] sm:max-w-md">
              {result.wallet}
            </h2>
            <Badge variant="outline" className="font-mono text-[10px] bg-background">
              <Droplets className="h-3 w-3 mr-1 text-primary" />
              已脱水 {(result.waterRatio || 0).toFixed(1)}%
            </Badge>
          </div>
          {activeStats?.conclusion && (
            <div className="flex items-center gap-2">
              <Target className={cn("h-4 w-4", leekScore >= 7 ? "text-danger" : leekScore >= 4 ? "text-warning" : "text-success")} />
              <span className="text-sm font-medium text-muted-foreground">{activeStats.conclusion}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">韭菜评分</div>
          <div className="flex items-center gap-1">
            {[...Array(10)].map((_, i) => (
              <svg key={i} className={cn("w-5 h-5", i < leekScore ? scoreColor : "text-muted/30")} fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
            <span className={cn("ml-2 font-mono font-bold text-lg", scoreColor)}>{leekScore}/10</span>
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        {/* ── 全历史总览 ── */}
        {result.globalStats && (
          <div className="bg-background/50 grid grid-cols-2 md:grid-cols-4 gap-px border-b border-panel-border">
            <div className="p-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">历史总成交量</div>
              <div className="font-mono text-lg">{formatCompact(result.globalStats.totalVolume)}</div>
            </div>
            <div className="p-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">历史累计手续费</div>
              <div className="font-mono text-lg text-warning">{formatCompact(result.globalStats.totalFees)}</div>
            </div>
            <div className="p-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">毛盈亏</div>
              <div className={cn("font-mono text-lg", getColorForValue(result.globalStats.totalPnl))}>
                {formatCompact(result.globalStats.totalPnl)}
              </div>
            </div>
            <div className="p-4 bg-panel/30">
              <div className="text-[10px] text-primary uppercase tracking-wider mb-1">净盈亏（扣费后）</div>
              <div className={cn("font-mono text-xl font-bold", getColorForValue(result.globalStats.netPnl))}>
                {formatCurrency(result.globalStats.netPnl)}
              </div>
            </div>
          </div>
        )}

        {/* ── 时间窗口 Tabs ── */}
        {result.windowStats && result.windowStats.length > 0 && (
          <div className="p-6 space-y-8">
            <div className="flex flex-wrap gap-2">
              {result.windowStats.map((stat) => (
                <button
                  key={stat.days}
                  onClick={() => setActiveTab(stat.days)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-mono font-medium transition-all duration-200 border",
                    activeTab === stat.days
                      ? "bg-primary/10 text-primary border-primary/50 shadow-[0_0_10px_rgba(51,210,255,0.2)]"
                      : "bg-background text-muted-foreground border-panel-border hover:bg-panel hover:text-foreground"
                  )}
                >
                  近 {stat.days} 天
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {activeStats && (
                <motion.div
                  key={activeStats.days}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >

                  {/* ── AI 诊断标签 ── */}
                  {activeStats.diagnoses && activeStats.diagnoses.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-4 rounded-lg bg-danger/5 border border-danger/20">
                      {activeStats.diagnoses.map((diag, i) => {
                        const isExtreme = diag.includes("绝佳猎物") || diag.includes("定时炸弹") || diag.includes("自爆机器");
                        return (
                          <Badge key={i} variant={isExtreme ? "destructive" : "secondary"} className="text-xs px-3 py-1 font-sans">
                            {diag}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {/* ── 反向跟单模拟 ── */}
                  <div className="space-y-3">
                    <SectionTitle icon={<Zap className="h-4 w-4 text-primary" />} title="反向跟单模拟盈亏（1:1 镜像）" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <StatBox
                        label="扣费前毛利润"
                        value={<span className={getColorForValue(activeStats.rawEdge)}>{formatCurrency(activeStats.rawEdge)}</span>}
                      />
                      <StatBox
                        label="我方手续费预估"
                        value={<span className="text-warning">-{formatCurrency(activeStats.myFees)}</span>}
                      />
                      <StatBox
                        label="反向跟单净盈亏"
                        highlight={!!(activeStats.reverseNetPnl && activeStats.reverseNetPnl > 0)}
                        value={<span className={getColorForValue(activeStats.reverseNetPnl)}>{formatCurrency(activeStats.reverseNetPnl)}</span>}
                        subtext={
                          <span className="flex items-center gap-1">
                            {activeStats.reverseNetPnl && activeStats.reverseNetPnl > 0
                              ? <><CheckCircle2 className="h-3 w-3 text-success" /> 策略可行，正收益</>
                              : <><Skull className="h-3 w-3 text-danger" /> 手续费吃掉优势</>}
                          </span>
                        }
                      />
                      <StatBox
                        label="盈亏平衡费率"
                        value={<span className="text-foreground">{activeStats.breakevenFeeRate ? `${activeStats.breakevenFeeRate.toFixed(4)}%` : '不适用'}</span>}
                      />
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <StatBox
                        label="反向胜率"
                        value={<span className={getColorForValue(activeStats.reverseWinRate)}>{formatPercent(activeStats.reverseWinRate)}</span>}
                        subtext="他亏 = 我赢"
                      />
                      <StatBox
                        label="反向均赢 / 均亏"
                        value={
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-success">{formatCurrency(activeStats.reverseAvgWin)}</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-danger">{formatCurrency(activeStats.reverseAvgLoss)}</span>
                          </div>
                        }
                      />
                      <StatBox
                        label="反向盈亏比"
                        value={<span className={getColorForValue((activeStats.reversePnlRatio ?? 0) - 1)}>{activeStats.reversePnlRatio?.toFixed(2)}</span>}
                      />
                    </div>
                  </div>

                  {/* ── 基础交易数据 ── */}
                  <div className="space-y-3">
                    <SectionTitle icon={<Activity className="h-4 w-4 text-muted-foreground" />} title="基础交易数据" />
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <StatBox
                        label="胜率"
                        value={
                          <span className={cn(activeStats.winRate && activeStats.winRate < 40 ? "text-danger" : "text-foreground")}>
                            {formatPercent(activeStats.winRate)}
                          </span>
                        }
                        subtext={`多头 ${formatPercent(activeStats.longWr)} | 空头 ${formatPercent(activeStats.shortWr)}`}
                      />
                      <StatBox
                        label="净盈亏"
                        value={<span className={getColorForValue(activeStats.netPnl)}>{formatCurrency(activeStats.netPnl)}</span>}
                        subtext={`共 ${activeStats.trades} 笔（${activeStats.freq?.toFixed(1)} 笔/天）`}
                      />
                      <StatBox
                        label="总手续费"
                        value={<span className="text-warning">{formatCurrency(activeStats.fees)}</span>}
                        subtext={`侵蚀率 ${activeStats.feeDrag?.toFixed(1)}%${activeStats.feeDrag && activeStats.feeDrag > 50 ? " ⚠️严重" : ""}`}
                      />
                      <StatBox
                        label="纯净收益率/笔"
                        value={<span className={getColorForValue(activeStats.avgRoi)}>{activeStats.avgRoi?.toFixed(3)}%</span>}
                        subtext="无杠杆价格波动捕捉"
                      />
                      <StatBox
                        label="单笔数学期望"
                        value={<span className={getColorForValue(activeStats.expectValue)}>{formatCurrency(activeStats.expectValue)}</span>}
                        subtext={activeStats.expectValue && activeStats.expectValue < 0 ? "🔴 负期望，长期必亏" : "🟢 正期望"}
                      />
                      <StatBox
                        label="均赢 / 均亏"
                        value={
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-success">{formatCurrency(activeStats.avgWin)}</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-danger">{formatCurrency(activeStats.avgLoss)}</span>
                          </div>
                        }
                      />
                      <StatBox
                        label="盈亏比"
                        value={<span className={getColorForValue((activeStats.pnlRatio ?? 0) - 1)}>{activeStats.pnlRatio?.toFixed(2)}</span>}
                        subtext="均赢 ÷ 均亏"
                      />
                      <StatBox
                        label="盈利因子"
                        value={
                          <span className={cn(activeStats.profitFactor && activeStats.profitFactor < 1 ? "text-danger" : "text-foreground")}>
                            {activeStats.profitFactor === 999 ? "∞" : activeStats.profitFactor?.toFixed(2)}
                          </span>
                        }
                        subtext={activeStats.profitFactor && activeStats.profitFactor < 0.6 ? "🩸 超级血包" : "毛盈 ÷ 毛亏"}
                      />
                      <StatBox
                        label="最大连胜 / 连败"
                        value={
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-success">{activeStats.maxWinStreak} 连</span>
                            <span className="text-muted-foreground">/</span>
                            <span className={cn(activeStats.maxLossStreak && activeStats.maxLossStreak >= 6 ? "text-danger font-bold" : "text-danger")}>
                              {activeStats.maxLossStreak} 连
                            </span>
                          </div>
                        }
                        subtext={activeStats.maxLossStreak && activeStats.maxLossStreak >= 6 ? "🔴 情绪失控指数极高" : ""}
                      />
                      <StatBox
                        label="总成交量"
                        value={<span className="text-foreground">{formatCompact(activeStats.totalVolume)}</span>}
                      />
                      <StatBox
                        label="均仓位价值"
                        value={<span className="text-foreground">{formatCurrency(activeStats.avgNotional)}</span>}
                      />
                    </div>
                  </div>

                  {/* ── 韭菜心理画像 ── */}
                  <div className="space-y-3">
                    <SectionTitle icon={<Skull className="h-4 w-4 text-muted-foreground" />} title="韭菜心理画像" />
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <StatBox
                        label="总体平均持仓"
                        value={<span className="text-foreground">{activeStats.avgHoldTotalH?.toFixed(1)}h</span>}
                      />
                      <StatBox
                        label="盈利单 / 亏损单持仓"
                        value={
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-success">{activeStats.avgHoldWinH?.toFixed(1)}h</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-danger">{activeStats.avgHoldLossH?.toFixed(1)}h</span>
                          </div>
                        }
                        subtext={
                          activeStats.avgHoldLossH && activeStats.avgHoldWinH && activeStats.avgHoldLossH > activeStats.avgHoldWinH * 2
                            ? "🔴 截断利润、死扛亏损"
                            : "持仓模式正常"
                        }
                      />
                      <StatBox
                        label="最大盈利 / 亏损"
                        value={
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-success">{formatCompact(activeStats.maxWin)}</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-danger">-{formatCompact(Math.abs(activeStats.maxLoss || 0))}</span>
                          </div>
                        }
                        subtext={`${activeStats.largeLossEvents} 次超额亏损事件`}
                      />
                      <StatBox
                        label="回撤恢复因子"
                        value={
                          <span className={cn(activeStats.recoveryFactor && activeStats.recoveryFactor < 1 ? "text-danger" : "text-foreground")}>
                            {activeStats.recoveryFactor === 999 ? "∞" : activeStats.recoveryFactor?.toFixed(2)}
                          </span>
                        }
                        subtext={activeStats.recoveryFactor && activeStats.recoveryFactor < 1 ? "⚠️ 亏损未能覆盖" : "净盈亏 ÷ 最大单笔亏"}
                      />
                      <StatBox
                        label="仓位规模变异系数"
                        value={
                          <span className={cn(activeStats.posCv && activeStats.posCv > 1.5 ? "text-danger text-glow-danger font-bold" : "text-foreground")}>
                            {activeStats.posCv?.toFixed(2)}
                          </span>
                        }
                        subtext={activeStats.posCv && activeStats.posCv > 1.5 ? "🔴 仓位极度混乱" : activeStats.posCv && activeStats.posCv > 0.8 ? "⚠️ 波动较大" : "✅ 仓位较稳定"}
                      />
                      <StatBox
                        label="马丁格尔信号次数"
                        value={
                          <span className={cn(activeStats.martingaleSignals && activeStats.martingaleSignals >= 3 ? "text-danger text-glow-danger font-bold" : "text-foreground")}>
                            {activeStats.martingaleSignals} 次
                          </span>
                        }
                        subtext={activeStats.martingaleSignals && activeStats.martingaleSignals >= 3 ? "🔴 高爆仓风险" : activeStats.martingaleSignals && activeStats.martingaleSignals >= 1 ? "⚠️ 有加仓迹象" : "✅ 未发现"}
                      />
                      <StatBox
                        label="深夜交易占比 (UTC 0-6)"
                        value={
                          <span className={cn(activeStats.nightRatio && activeStats.nightRatio > 30 ? "text-danger" : "text-foreground")}>
                            {activeStats.nightRatio?.toFixed(1)}%
                          </span>
                        }
                        subtext={activeStats.nightRatio && activeStats.nightRatio > 30 ? "🌙 高度夜间情绪交易" : activeStats.nightRatio && activeStats.nightRatio > 15 ? "⚠️ 有一定夜间交易" : "✅ 正常"}
                      />
                      <StatBox
                        label="Top3 币种集中度"
                        value={
                          <span className={cn(activeStats.concentrationRatio && activeStats.concentrationRatio > 80 ? "text-warning" : "text-foreground")}>
                            {activeStats.concentrationRatio?.toFixed(1)}%
                          </span>
                        }
                        subtext={activeStats.concentrationRatio && activeStats.concentrationRatio > 80 ? "♟️ 孤注一掷" : activeStats.concentrationRatio && activeStats.concentrationRatio > 60 ? "⚠️ 偏集中" : "✅ 较分散"}
                      />
                    </div>

                    {/* Top3 币种明细表 */}
                    {activeStats.top3Coins && activeStats.top3Coins.length > 0 && (
                      <div className="rounded-lg border border-panel-border overflow-hidden">
                        <div className="bg-panel/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex">
                          <span className="w-24">币种</span>
                          <span className="w-16 text-right">笔数</span>
                          <span className="w-20 text-right">胜率</span>
                          <span className="flex-1 text-right">成交量</span>
                          <span className="flex-1 text-right">盈亏</span>
                        </div>
                        {activeStats.top3Coins.map((c) => (
                          <div key={c.coin} className="px-4 py-2 text-xs font-mono flex items-center border-t border-panel-border/50 hover:bg-panel/20 transition-colors">
                            <span className="w-24 text-primary font-bold">{c.coin}</span>
                            <span className="w-16 text-right text-muted-foreground">{c.trades}</span>
                            <span className="w-20 text-right">{formatPercent(c.winRate)}</span>
                            <span className="flex-1 text-right text-muted-foreground">{formatCompact(c.volume)}</span>
                            <span className={cn("flex-1 text-right font-semibold", getColorForValue(c.pnl))}>{formatCurrency(c.pnl)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── 仓位分析 ── */}
                  {positionData.length > 0 && (
                    <div className="space-y-3">
                      <SectionTitle icon={<BarChart2 className="h-4 w-4 text-muted-foreground" />} title="逐笔仓位大小分布" />

                      {/* 仓位统计 + 跟单比例 */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <StatBox
                          label="最大仓位"
                          value={<span className="text-warning font-bold">{formatCurrency(maxPosition)}</span>}
                          subtext="单笔最大名义价值"
                        />
                        <StatBox
                          label="平均仓位"
                          value={<span className="text-foreground">{formatCurrency(avgPosition)}</span>}
                          subtext="所有平仓笔均值"
                        />
                        {followRatio !== null ? (
                          <>
                            <StatBox
                              label="我能接受的最大仓"
                              value={<span className="text-primary">{formatCurrency(myMaxPosition)}</span>}
                            />
                            <StatBox
                              label="参考跟单比例"
                              highlight
                              value={
                                <span className={followRatio >= 1 ? "text-success font-bold" : followRatio >= 0.5 ? "text-warning font-bold" : "text-danger font-bold"}>
                                  {(followRatio * 100).toFixed(1)}%
                                </span>
                              }
                              subtext={
                                followRatio >= 1
                                  ? "✅ 可 1:1 全额跟单"
                                  : followRatio >= 0.5
                                  ? `⚠️ 建议缩小至 ${(followRatio * 100).toFixed(0)}%`
                                  : `🔴 仓位差距大，仅跟 ${(followRatio * 100).toFixed(0)}%`
                              }
                            />
                          </>
                        ) : (
                          <div className="lg:col-span-2 flex items-center justify-center rounded-lg border border-dashed border-panel-border/50 p-3 text-[10px] text-muted-foreground/60 font-mono">
                            在左侧填写"我能接受的最大仓位"以显示跟单比例
                          </div>
                        )}
                      </div>

                      {/* 仓位 K 线柱状图 */}
                      <div className="rounded-lg border border-panel-border bg-background/50 p-4">
                        <div className="flex items-center gap-6 mb-4 text-[10px] font-mono text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm bg-[#22c55e] inline-block" />盈利笔
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm bg-[#ef4444] inline-block" />亏损笔
                          </span>
                          {myMaxPosition > 0 && (
                            <span className="flex items-center gap-1.5">
                              <span className="w-6 border-t-2 border-dashed border-primary inline-block" />
                              我的上限
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <span className="w-6 border-t border-warning inline-block" />
                            均值
                          </span>
                        </div>
                        <ResponsiveContainer width="100%" height={240}>
                          <ComposedChart data={positionData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis
                              dataKey="idx"
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v) => `#${v + 1}`}
                              interval={Math.max(0, Math.floor(positionData.length / 8) - 1)}
                            />
                            <YAxis
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "K" : v.toFixed(0)}`}
                              width={55}
                            />
                            <Tooltip content={<PositionTooltip />} />
                            {myMaxPosition > 0 && (
                              <ReferenceLine
                                y={myMaxPosition}
                                stroke="#33d2ff"
                                strokeDasharray="6 3"
                                strokeWidth={1.5}
                                label={{ value: "我的上限", fill: "#33d2ff", fontSize: 10, position: "insideTopRight" }}
                              />
                            )}
                            <ReferenceLine
                              y={avgPosition}
                              stroke="#f59e0b"
                              strokeWidth={1}
                              label={{ value: "均值", fill: "#f59e0b", fontSize: 10, position: "insideTopLeft" }}
                            />
                            <Bar dataKey="notional" maxBarSize={20} radius={[2, 2, 0, 0]}>
                              {positionData.map((entry, index) => (
                                <Cell key={index} fill={entry.win ? "#22c55e" : "#ef4444"} fillOpacity={0.8} />
                              ))}
                            </Bar>
                          </ComposedChart>
                        </ResponsiveContainer>
                        <div className="text-center text-[10px] text-muted-foreground/50 font-mono mt-1">
                          共 {positionData.length} 笔，最大 {formatCurrency(maxPosition)}，均值 {formatCurrency(avgPosition)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── PnL 盈亏图 ── */}
                  {chartData.length > 0 && (
                    <div className="space-y-3">
                      <SectionTitle icon={<BarChart2 className="h-4 w-4 text-muted-foreground" />} title="逐笔盈亏 & 累计净值曲线" />
                      <div className="rounded-lg border border-panel-border bg-background/50 p-4">
                        <div className="flex items-center gap-6 mb-4 text-[10px] font-mono text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm bg-[#22c55e] inline-block" />
                            盈利笔
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm bg-[#ef4444] inline-block" />
                            亏损笔
                          </span>
                          <span className="flex items-center gap-1.5">
                            <TrendingUp className="w-3 h-3 text-primary" />
                            累计净值
                          </span>
                        </div>
                        <ResponsiveContainer width="100%" height={260}>
                          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis
                              dataKey="idx"
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v) => `#${v + 1}`}
                              interval={Math.max(0, Math.floor(chartData.length / 8) - 1)}
                            />
                            <YAxis
                              yAxisId="bar"
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v) => `$${v >= 1000 || v <= -1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(0)}`}
                              width={55}
                            />
                            <YAxis
                              yAxisId="line"
                              orientation="right"
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v) => `$${v >= 1000 || v <= -1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(0)}`}
                              width={55}
                            />
                            <Tooltip content={<PnlTooltip />} />
                            <ReferenceLine yAxisId="bar" y={0} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
                            <ReferenceLine yAxisId="line" y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                            <Bar yAxisId="bar" dataKey="pnl" maxBarSize={20} radius={[2, 2, 0, 0]}>
                              {chartData.map((entry, index) => (
                                <Cell key={index} fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.85} />
                              ))}
                            </Bar>
                            <Line
                              yAxisId="line"
                              type="monotone"
                              dataKey="cumulative"
                              stroke="#33d2ff"
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4, fill: "#33d2ff" }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                        <div className="text-center text-[10px] text-muted-foreground/50 font-mono mt-1">
                          共 {chartData.length} 笔平仓记录
                        </div>
                      </div>
                    </div>
                  )}

                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-widest border-b border-panel-border pb-2">
      {icon}
      {title}
    </h3>
  );
}
