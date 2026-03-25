import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Radar, Settings2, ShieldAlert } from "lucide-react";

import { useAnalyzeWallets } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { WalletDashboard } from "@/components/WalletDashboard";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  wallets: z.string().min(1, "Enter at least one wallet address"),
  timeWindows: z.string().regex(/^(\d+\s*,\s*)*\d+$/, "Must be comma-separated numbers (e.g. 3,7,30)"),
  mergeMinutes: z.coerce.number().min(0).max(60),
  myFeeRate: z.coerce.number().min(0).max(1),
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
    },
  });

  const onSubmit = (values: FormValues) => {
    const walletsList = values.wallets
      .split(/[\n,]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    if (walletsList.length === 0) {
      toast({ title: "Error", description: "No valid wallets found", variant: "destructive" });
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
            title: "Analysis Failed",
            description: error.error || "An unexpected error occurred",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col lg:flex-row">
      {/* SIDEBAR CONFIG */}
      <aside className="w-full lg:w-80 border-b lg:border-r border-panel-border bg-panel/30 p-6 flex flex-col shrink-0 lg:h-screen lg:sticky top-0 overflow-y-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-primary/10 rounded-lg border border-primary/30 shadow-[0_0_15px_rgba(51,210,255,0.2)]">
            <Radar className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-sans font-bold text-lg leading-tight tracking-tight text-foreground text-glow-primary">HL R.A.D.A.R.</h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Reverse Trading Terminal</p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 flex-1">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Target Wallets
            </label>
            <Textarea
              {...form.register("wallets")}
              placeholder="0x123...&#10;0xabc...&#10;(one per line or comma separated)"
              className="font-mono text-xs h-32 bg-background border-panel-border/50 focus-visible:ring-primary/50"
            />
            {form.formState.errors.wallets && (
              <p className="text-xs text-danger">{form.formState.errors.wallets.message}</p>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-panel-border/50">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Settings2 className="h-4 w-4" /> Parameters
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Time Windows (Days)</label>
              <Input
                {...form.register("timeWindows")}
                className="font-mono text-sm bg-background border-panel-border/50"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Merge Fills (Mins)</label>
                <Input
                  type="number"
                  step="0.1"
                  {...form.register("mergeMinutes")}
                  className="font-mono text-sm bg-background border-panel-border/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">My Fee Rate (%)</label>
                <Input
                  type="number"
                  step="0.001"
                  {...form.register("myFeeRate")}
                  className="font-mono text-sm bg-background border-panel-border/50"
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="w-full mt-4 bg-primary text-primary-foreground font-bold tracking-widest uppercase hover:bg-primary/90 transition-all duration-300"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <Radar className="h-4 w-4 animate-spin" /> Scanning...
              </span>
            ) : (
              "Initialize Scan"
            )}
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-panel-border/50 text-[10px] text-muted-foreground/60 leading-relaxed font-mono">
          SYSTEM: Reverse Copy Strategy Engine v2.0.<br/>
          WARNING: Past performance does not guarantee future results. High slippage and fee drag can invalidate theoretical edges.
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6 lg:p-8 overflow-x-hidden min-h-[50vh]">
        {isPending ? (
          <div className="h-full w-full flex flex-col items-center justify-center text-primary space-y-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping"></div>
              <div className="absolute inset-2 rounded-full border-2 border-primary/40 animate-ping" style={{ animationDelay: '0.2s' }}></div>
              <Radar className="h-16 w-16 animate-pulse text-glow-primary relative z-10" />
            </div>
            <div className="font-mono text-sm tracking-widest animate-pulse">EXTRACTING ON-CHAIN LOGS...</div>
          </div>
        ) : data?.results ? (
          <div className="space-y-8 max-w-6xl mx-auto">
            {data.results.map((result, idx) => (
              <motion.div
                key={result.wallet + idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <WalletDashboard result={result} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground/50 space-y-4">
            <ShieldAlert className="h-16 w-16 opacity-20" />
            <h2 className="text-xl font-sans tracking-tight">System Standby</h2>
            <p className="text-sm font-mono max-w-md text-center">
              Input target wallet addresses in the config panel to begin behavioral analysis and locate reverse-copy opportunities.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
