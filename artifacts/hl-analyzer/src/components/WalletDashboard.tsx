import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WalletResult } from "@workspace/api-client-react/src/generated/api.schemas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatBox } from "@/components/StatBox";
import { formatCurrency, formatPercent, formatCompact, getColorForValue, cn } from "@/lib/utils";
import { Activity, AlertTriangle, CheckCircle2, Skull, Target, Zap, Droplets } from "lucide-react";

interface WalletDashboardProps {
  result: WalletResult;
}

export function WalletDashboard({ result }: WalletDashboardProps) {
  const [activeTab, setActiveTab] = useState<number>(
    result.windowStats && result.windowStats.length > 0 ? result.windowStats[0].days : 0
  );

  if (result.error) {
    return (
      <Card className="border-danger/50 bg-danger/5">
        <CardHeader>
          <CardTitle className="text-danger flex items-center gap-2 font-mono">
            <AlertTriangle className="h-5 w-5" />
            {result.wallet}
          </CardTitle>
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

  return (
    <Card className="overflow-hidden border-panel-border/80 shadow-2xl glass-panel">
      {/* 头部摘要 */}
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
        {/* 全历史总览 */}
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

        {/* 时间窗口选项卡 */}
        {result.windowStats && result.windowStats.length > 0 && (
          <div className="p-6">
            <div className="flex flex-wrap gap-2 mb-6">
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
                  
                  {/* AI 诊断标签 */}
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

                  {/* 反向跟单模拟 */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-widest border-b border-panel-border pb-2">
                      <Zap className="h-4 w-4 text-primary" />
                      反向跟单模拟盈亏（1:1 镜像）
                    </h3>
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
                        highlight={activeStats.reverseNetPnl && activeStats.reverseNetPnl > 0 ? true : false}
                        value={<span className={getColorForValue(activeStats.reverseNetPnl)}>{formatCurrency(activeStats.reverseNetPnl)}</span>}
                        subtext={
                           <span className="flex items-center gap-1">
                             {activeStats.reverseNetPnl && activeStats.reverseNetPnl > 0 ? <CheckCircle2 className="h-3 w-3 text-success"/> : <Skull className="h-3 w-3 text-danger"/>}
                             {activeStats.reverseNetPnl && activeStats.reverseNetPnl > 0 ? "策略可行，正收益" : "手续费吃掉优势"}
                           </span>
                        }
                      />
                      <StatBox 
                        label="盈亏平衡费率" 
                        value={<span className="text-foreground">{activeStats.breakevenFeeRate ? `${activeStats.breakevenFeeRate.toFixed(4)}%` : '不适用'}</span>}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* 基础交易数据 */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-widest border-b border-panel-border pb-2">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        基础交易数据
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
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
                          label="单笔数学期望" 
                          value={<span className={getColorForValue(activeStats.expectValue)}>{formatCurrency(activeStats.expectValue)}</span>}
                        />
                        <StatBox 
                          label="手续费侵蚀率" 
                          value={<span className={cn(activeStats.feeDrag && activeStats.feeDrag > 50 ? "text-danger text-glow-danger" : "text-warning")}>{activeStats.feeDrag?.toFixed(1)}%</span>}
                          subtext="占毛利润的比例"
                        />
                      </div>
                    </div>

                    {/* 韭菜心理画像 */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-widest border-b border-panel-border pb-2">
                        <Skull className="h-4 w-4 text-muted-foreground" />
                        韭菜心理画像
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <StatBox 
                          label="盈亏持仓时长" 
                          value={
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-success">{activeStats.avgHoldWinH?.toFixed(1)}h</span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-danger">{activeStats.avgHoldLossH?.toFixed(1)}h</span>
                            </div>
                          }
                          subtext={activeStats.avgHoldLossH && activeStats.avgHoldWinH && activeStats.avgHoldLossH > activeStats.avgHoldWinH * 2 ? "🔴 截断利润、死扛亏损" : "持仓模式正常"}
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
                          label="仓位规模变异系数" 
                          value={
                            <span className={cn(activeStats.posCv && activeStats.posCv > 1.5 ? "text-danger" : "text-foreground")}>
                              {activeStats.posCv?.toFixed(2)}
                            </span>
                          }
                          subtext={activeStats.posCv && activeStats.posCv > 1.5 ? "🔴 仓位极度混乱" : "仓位较稳定"}
                        />
                        <StatBox 
                          label="马丁格尔信号次数" 
                          value={
                            <span className={cn(activeStats.martingaleSignals && activeStats.martingaleSignals >= 3 ? "text-danger text-glow-danger font-bold" : "text-foreground")}>
                              {activeStats.martingaleSignals} 次
                            </span>
                          }
                          subtext={activeStats.martingaleSignals && activeStats.martingaleSignals >= 3 ? "🔴 高爆仓风险" : "未发现倍投行为"}
                        />
                      </div>
                    </div>
                  </div>

                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
