import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Radar, Settings2, ShieldAlert, Trophy } from "lucide-react";

import { useAnalyzeWallets } from "@workspace/api-client-react";
import { WalletResult } from "@workspace/api-client-react/src/generated/api.schemas";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { WalletDashboard } from "@/components/WalletDashboard";
import { useToast } from "@/hooks/use-toast";

function computeRefProfit(result: WalletResult, myMaxPos: number): number {
  if (result.error) return -Infinity;
  const ws = result.windowStats?.[0];
  if (!ws) return -Infinity;
  const maxPos = ws.maxPosition ?? 0;
  const followRatio = myMaxPos > 0 && maxPos > 0 ? myMaxPos / maxPos : 1;
  return (ws.reverseNetPnl ?? 0) * followRatio;
}

function fmt(v: number) {
  return (v >= 0 ? "+" : "") + "$" + Math.abs(v).toFixed(2);
}

const formSchema = z.object({
  wallets: z.string().min(1, "请输入至少一个钱包地址"),
  timeWindows: z.string().regex(/^(\d+\s*,\s*)*\d+$/, "请输入逗号分隔的天数，例如 3,7,30"),
  mergeMinutes: z.coerce.number().min(0).max(60),
  myFeeRate: z.coerce.number().min(0).max(1),
  myMaxPosition: z.coerce.number().min(0),
});

type FormValues = z.infer<typeof formSchema>;

export function Dashboard() {
  const { toast } = useToast();
  const { mutate, isPending, data } = useAnalyzeWallets();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      wallets: "",
      timeWindows: "3, 7, 30",
      mergeMinutes: 2.0,
      myFeeRate: 0.035,
      myMaxPosition: 0,
    },
  });

  const myMaxPosition = form.watch("myMaxPosition");

  const onSubmit = (values: FormValues) => {
    const walletsList = values.wallets
      .split(/[\n,]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    if (walletsList.length === 0) {
      toast({ title: "错误", description: "未找到有效的钱包地址", variant: "destructive" });
      return;
    }

    const timeWindowsList = values.timeWindows
      .split(",")
      .map((t) => parseInt(t.trim(), 10))
      .filter((n) => !isNaN(n));

    mutate(
      {
        data: {
          wallets: walletsList,
          timeWindows: timeWindowsList.length > 0 ? timeWindowsList : undefined,
          mergeMinutes: values.mergeMinutes,
          myFeeRate: values.myFeeRate,
        },
      },
      {
        onError: (error) => {
          toast({
            title: "分析失败",
            description: error.error || "发生未知错误",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col lg:flex-row">
      {/* 左侧配置面板 */}
      <aside className="w-full lg:w-80 border-b lg:border-r border-panel-border bg-panel/30 p-6 flex flex-col shrink-0 lg:h-screen lg:sticky top-0 overflow-y-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-primary/10 rounded-lg border border-primary/30 shadow-[0_0_15px_rgba(51,210,255,0.2)]">
            <Radar className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-sans font-bold text-lg leading-tight tracking-tight text-foreground text-glow-primary">HL 韭菜雷达</h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">反向跟单分析终端</p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 flex-1">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              目标钱包地址
            </label>
            <Textarea
              {...form.register("wallets")}
              placeholder={"0x123...\n0xabc...\n（每行一个，或用逗号分隔）"}
              className="font-mono text-xs h-32 bg-background border-panel-border/50 focus-visible:ring-primary/50"
            />
            {form.formState.errors.wallets && (
              <p className="text-xs text-danger">{form.formState.errors.wallets.message}</p>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-panel-border/50">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Settings2 className="h-4 w-4" /> 参数配置
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">时间窗口（天）</label>
              <Input
                {...form.register("timeWindows")}
                className="font-mono text-sm bg-background border-panel-border/50"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">碎单合并（分钟）</label>
                <Input
                  type="number"
                  step="0.1"
                  {...form.register("mergeMinutes")}
                  className="font-mono text-sm bg-background border-panel-border/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">我方费率（%）</label>
                <Input
                  type="number"
                  step="0.001"
                  {...form.register("myFeeRate")}
                  className="font-mono text-sm bg-background border-panel-border/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                我能接受的最大仓位（USDC，0 = 不设定）
              </label>
              <Input
                type="number"
                step="100"
                min="0"
                {...form.register("myMaxPosition")}
                placeholder="如：5000"
                className="font-mono text-sm bg-background border-panel-border/50"
              />
              <p className="text-[10px] text-muted-foreground/60">
                用于计算：我的最大仓 ÷ 目标最大仓，作为参考跟单比例
              </p>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="w-full mt-4 bg-primary text-primary-foreground font-bold tracking-widest uppercase hover:bg-primary/90 transition-all duration-300"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <Radar className="h-4 w-4 animate-spin" /> 扫描中...
              </span>
            ) : (
              "开始扫描"
            )}
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-panel-border/50 text-[10px] text-muted-foreground/60 leading-relaxed font-mono">
          系统：反向跟单策略引擎 v2.0<br/>
          警告：历史数据不代表未来收益。实际跟单存在滑点与延迟，结果偏乐观，仅供参考。
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 p-6 lg:p-8 overflow-x-hidden min-h-[50vh]">
        {isPending ? (
          <div className="h-full w-full flex flex-col items-center justify-center text-primary space-y-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping"></div>
              <div className="absolute inset-2 rounded-full border-2 border-primary/40 animate-ping" style={{ animationDelay: '0.2s' }}></div>
              <Radar className="h-16 w-16 animate-pulse text-glow-primary relative z-10" />
            </div>
            <div className="font-mono text-sm tracking-widest animate-pulse">正在抓取链上数据...</div>
          </div>
        ) : data?.results ? (
          (() => {
            const myMaxPos = Number(myMaxPosition) || 0;
            const ranked = [...data.results]
              .map((r) => ({ result: r, refProfit: computeRefProfit(r, myMaxPos) }))
              .sort((a, b) => b.refProfit - a.refProfit);

            return (
              <div className="space-y-8 max-w-6xl mx-auto">
                {/* ── 多钱包排行榜 ── */}
                {ranked.length > 1 && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="rounded-xl border border-primary/30 bg-panel/40 overflow-hidden shadow-[0_0_20px_rgba(51,210,255,0.08)]">
                      <div className="flex items-center gap-2 px-5 py-3 border-b border-panel-border/60 bg-primary/5">
                        <Trophy className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-widest text-primary">
                          反向跟单参考净收益排行（{ranked[0].result.windowStats?.[0]?.days ?? "?"} 天窗口）
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-panel-border/40">
                              <th className="text-left px-4 py-2 w-8">排名</th>
                              <th className="text-left px-4 py-2">钱包地址</th>
                              <th className="text-right px-4 py-2">跟单净盈亏</th>
                              <th className="text-right px-4 py-2">跟单比例</th>
                              <th className="text-right px-4 py-2 text-primary">参考净收益</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ranked.map(({ result, refProfit }, i) => {
                              const ws = result.windowStats?.[0];
                              const maxPos = ws?.maxPosition ?? 0;
                              const ratio = myMaxPos > 0 && maxPos > 0 ? myMaxPos / maxPos : 1;
                              const reverseNetPnl = ws?.reverseNetPnl ?? 0;
                              const isTop = i === 0;
                              return (
                                <tr key={result.wallet} className={`border-t border-panel-border/30 transition-colors hover:bg-panel/30 ${isTop ? "bg-primary/5" : ""}`}>
                                  <td className="px-4 py-2.5 font-bold">
                                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                                  </td>
                                  <td className="px-4 py-2.5 text-muted-foreground">
                                    {result.error
                                      ? <span className="text-danger">❌ 获取失败</span>
                                      : <span className="font-mono">{result.wallet.slice(0, 10)}…{result.wallet.slice(-6)}</span>
                                    }
                                  </td>
                                  <td className={`px-4 py-2.5 text-right ${reverseNetPnl >= 0 ? "text-success" : "text-danger"}`}>
                                    {result.error ? "—" : fmt(reverseNetPnl)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                                    {result.error ? "—" : ratio.toFixed(5)}
                                  </td>
                                  <td className={`px-4 py-2.5 text-right font-bold ${refProfit >= 0 ? "text-success" : "text-danger"} ${isTop && refProfit > 0 ? "text-glow-success" : ""}`}>
                                    {result.error ? "—" : fmt(refProfit)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── 钱包详情卡片 ── */}
                {ranked.map(({ result, refProfit }, idx) => (
                  <motion.div
                    key={result.wallet + idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <WalletDashboard
                      result={result}
                      myMaxPosition={myMaxPos}
                      rank={ranked.length > 1 ? idx + 1 : undefined}
                      defaultRefProfit={refProfit}
                    />
                  </motion.div>
                ))}
              </div>
            );
          })()
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground/50 space-y-4">
            <ShieldAlert className="h-16 w-16 opacity-20" />
            <h2 className="text-xl font-sans tracking-tight">系统待机中</h2>
            <p className="text-sm font-mono max-w-md text-center">
              在左侧输入目标钱包地址，开始行为分析，寻找反向跟单机会。
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
