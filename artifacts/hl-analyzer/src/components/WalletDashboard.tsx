import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WalletResult, WindowStats } from "@workspace/api-client-react/src/generated/api.schemas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatBox } from "@/components/StatBox";
import { formatCurrency, formatPercent, formatCompact, getColorForValue, cn } from "@/lib/utils";
import { Activity, AlertTriangle, CheckCircle2, Skull, Target, TrendingDown, TrendingUp, Zap, Clock, BoxSelect, Droplets } from "lucide-react";

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
          <p className="text-muted-foreground">{result.error}</p>
        </CardContent>
      </Card>
    );
  }

  const activeStats = result.windowStats?.find((w) => w.days === activeTab);

  // Determine overall Leek Score and styling from the active window (if available)
  const leekScore = activeStats?.leekScore || 0;
  let scoreColor = "text-success";
  if (leekScore >= 7) scoreColor = "text-danger text-glow-danger";
  else if (leekScore >= 4) scoreColor = "text-warning text-glow-warning";

  return (
    <Card className="overflow-hidden border-panel-border/80 shadow-2xl glass-panel">
      {/* HEADER SECTION */}
      <div className="bg-panel/50 border-b border-panel-border p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-mono font-bold tracking-tight text-foreground truncate max-w-[200px] sm:max-w-md">
              {result.wallet}
            </h2>
            <Badge variant="outline" className="font-mono text-[10px] bg-background">
              <Droplets className="h-3 w-3 mr-1 text-primary" />
              {(result.waterRatio || 0).toFixed(1)}% Noise Filtered
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
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Leek Rating</div>
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
        {/* GLOBAL STATS BANNER */}
        {result.globalStats && (
          <div className="bg-background/50 grid grid-cols-2 md:grid-cols-4 gap-px border-b border-panel-border">
            <div className="p-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Lifetime Vol</div>
              <div className="font-mono text-lg">{formatCompact(result.globalStats.totalVolume)}</div>
            </div>
            <div className="p-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Lifetime Fees</div>
              <div className="font-mono text-lg text-warning">{formatCompact(result.globalStats.totalFees)}</div>
            </div>
            <div className="p-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gross PnL</div>
              <div className={cn("font-mono text-lg", getColorForValue(result.globalStats.totalPnl))}>
                {formatCompact(result.globalStats.totalPnl)}
              </div>
            </div>
            <div className="p-4 bg-panel/30">
              <div className="text-[10px] text-primary uppercase tracking-wider mb-1">Net PnL</div>
              <div className={cn("font-mono text-xl font-bold", getColorForValue(result.globalStats.netPnl))}>
                {formatCurrency(result.globalStats.netPnl)}
              </div>
            </div>
          </div>
        )}

        {/* TIME WINDOW TABS */}
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
                  {stat.days} Days
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
                  
                  {/* AI DIAGNOSIS TAGS */}
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

                  {/* REVERSE COPY SIMULATION - THE MOST IMPORTANT PART */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-widest border-b border-panel-border pb-2">
                      <Zap className="h-4 w-4 text-primary" />
                      Reverse Copy Simulation (1:1)
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <StatBox 
                        label="Raw Edge (Pre-fee)" 
                        value={<span className={getColorForValue(activeStats.rawEdge)}>{formatCurrency(activeStats.rawEdge)}</span>}
                      />
                      <StatBox 
                        label="Est. Fees to Follow" 
                        value={<span className="text-warning">-{formatCurrency(activeStats.myFees)}</span>}
                      />
                      <StatBox 
                        label="Reverse Net PnL" 
                        highlight={activeStats.reverseNetPnl && activeStats.reverseNetPnl > 0 ? true : false}
                        value={<span className={getColorForValue(activeStats.reverseNetPnl)}>{formatCurrency(activeStats.reverseNetPnl)}</span>}
                        subtext={
                           <span className="flex items-center gap-1">
                             {activeStats.reverseNetPnl && activeStats.reverseNetPnl > 0 ? <CheckCircle2 className="h-3 w-3 text-success"/> : <Skull className="h-3 w-3 text-danger"/>}
                             {activeStats.reverseNetPnl && activeStats.reverseNetPnl > 0 ? "Profitable Strategy" : "Fees kill the edge"}
                           </span>
                        }
                      />
                      <StatBox 
                        label="Breakeven Fee Rate" 
                        value={<span className="text-foreground">{activeStats.breakevenFeeRate ? `${activeStats.breakevenFeeRate.toFixed(4)}%` : 'N/A'}</span>}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* TRADING PERFORMANCE */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-widest border-b border-panel-border pb-2">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        Base Performance
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <StatBox 
                          label="Win Rate" 
                          value={
                            <span className={cn(activeStats.winRate && activeStats.winRate < 40 ? "text-danger" : "text-foreground")}>
                              {formatPercent(activeStats.winRate)}
                            </span>
                          }
                          subtext={`L: ${formatPercent(activeStats.longWr)} | S: ${formatPercent(activeStats.shortWr)}`}
                        />
                        <StatBox 
                          label="Net PnL" 
                          value={<span className={getColorForValue(activeStats.netPnl)}>{formatCurrency(activeStats.netPnl)}</span>}
                          subtext={`${activeStats.trades} trades (${activeStats.freq?.toFixed(1)}/day)`}
                        />
                        <StatBox 
                          label="Expected Value / Trade" 
                          value={<span className={getColorForValue(activeStats.expectValue)}>{formatCurrency(activeStats.expectValue)}</span>}
                        />
                        <StatBox 
                          label="Fee Drag on Profits" 
                          value={<span className={cn(activeStats.feeDrag && activeStats.feeDrag > 50 ? "text-danger text-glow-danger" : "text-warning")}>{activeStats.feeDrag?.toFixed(1)}%</span>}
                          subtext="How much of gross goes to fees"
                        />
                      </div>
                    </div>

                    {/* LEEK PSYCHOLOGY */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-widest border-b border-panel-border pb-2">
                        <Skull className="h-4 w-4 text-muted-foreground" />
                        Trader Psychology
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <StatBox 
                          label="Avg Hold (Win vs Loss)" 
                          value={
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-success">{activeStats.avgHoldWinH?.toFixed(1)}h</span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-danger">{activeStats.avgHoldLossH?.toFixed(1)}h</span>
                            </div>
                          }
                          subtext={activeStats.avgHoldLossH && activeStats.avgHoldWinH && activeStats.avgHoldLossH > activeStats.avgHoldWinH * 2 ? "🔴 Cuts profits, holds losses" : "Normal hold patterns"}
                        />
                        <StatBox 
                          label="Max Win / Max Loss" 
                          value={
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-success">{formatCompact(activeStats.maxWin)}</span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-danger">-{formatCompact(Math.abs(activeStats.maxLoss || 0))}</span>
                            </div>
                          }
                          subtext={`${activeStats.largeLossEvents} massive loss events`}
                        />
                        <StatBox 
                          label="Position Volatility (CV)" 
                          value={
                            <span className={cn(activeStats.posCv && activeStats.posCv > 1.5 ? "text-danger" : "text-foreground")}>
                              {activeStats.posCv?.toFixed(2)}
                            </span>
                          }
                          subtext={activeStats.posCv && activeStats.posCv > 1.5 ? "🔴 Erratic sizing" : "Stable position sizes"}
                        />
                        <StatBox 
                          label="Martingale / Add to Loser" 
                          value={
                            <span className={cn(activeStats.martingaleSignals && activeStats.martingaleSignals >= 3 ? "text-danger text-glow-danger font-bold" : "text-foreground")}>
                              {activeStats.martingaleSignals} signals
                            </span>
                          }
                          subtext={activeStats.martingaleSignals && activeStats.martingaleSignals >= 3 ? "🔴 High liquidation risk" : "No extreme averaging"}
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
