import { Router, type IRouter } from "express";
import { AnalyzeWalletsBody } from "@workspace/api-zod";

const router: IRouter = Router();

const MERGE_WINDOW_MS_DEFAULT = 2.0 * 60 * 1000;
const MY_FEE_RATE_DEFAULT = 0.035;
const TIME_WINDOWS_DEFAULT = [30, 7, 3];

interface Fill {
  coin: string;
  dir: string;
  sz: number;
  px: number;
  fee: number;
  closedPnl: number;
  time_start: number;
  time: number;
  merged_count: number;
}

interface RawFill {
  coin?: string;
  dir?: string;
  sz?: string | number;
  px?: string | number;
  fee?: string | number;
  closedPnl?: string | number;
  time?: number;
}

async function fetchUserFills(wallet: string): Promise<RawFill[]> {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "userFills", user: wallet }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<RawFill[]>;
}

function cleanAndMergeFills(rawFills: RawFill[], mergeWindowMs: number): Fill[] {
  if (!rawFills || rawFills.length === 0) return [];

  const sorted = [...rawFills].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  const mergedList: Fill[] = [];
  const lastFillByCoin: Record<string, Fill> = {};

  for (const f of sorted) {
    const coin = f.coin ?? "";
    const currTime = f.time ?? 0;
    const currDir = f.dir ?? "";
    const currPnl = parseFloat(String(f.closedPnl ?? 0));
    const currFee = parseFloat(String(f.fee ?? 0));
    const currSz = parseFloat(String(f.sz ?? 0));
    const currPx = parseFloat(String(f.px ?? 0));

    const prev = lastFillByCoin[coin];
    let canMerge = false;

    if (prev && (currTime - prev.time_start) <= mergeWindowMs) {
      if (prev.dir === currDir) canMerge = true;
    }

    if (canMerge && prev) {
      const totalSz = prev.sz + currSz;
      if (totalSz > 0) {
        prev.px = (prev.sz * prev.px + currSz * currPx) / totalSz;
      }
      prev.sz = totalSz;
      prev.fee += currFee;
      prev.closedPnl += currPnl;
      prev.time = currTime;
      prev.merged_count += 1;
    } else {
      const newFill: Fill = {
        coin, dir: currDir, sz: currSz, px: currPx,
        fee: currFee, closedPnl: currPnl,
        time_start: currTime, time: currTime, merged_count: 1,
      };
      mergedList.push(newFill);
      lastFillByCoin[coin] = newFill;
    }
  }

  return mergedList;
}

function computeGlobalStats(fills: Fill[]) {
  let totalVolume = 0, totalFees = 0, totalPnl = 0;
  const coinVolume: Record<string, number> = {};
  const coinFees: Record<string, number> = {};

  for (const f of fills) {
    const notional = f.sz * f.px;
    totalVolume += notional;
    totalFees += f.fee;
    totalPnl += f.closedPnl;
    coinVolume[f.coin] = (coinVolume[f.coin] ?? 0) + notional;
    coinFees[f.coin] = (coinFees[f.coin] ?? 0) + f.fee;
  }

  const topCoins = Object.entries(coinVolume)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([coin, volume]) => ({
      coin,
      volume,
      fees: coinFees[coin] ?? 0,
      pct: totalVolume > 0 ? (volume / totalVolume) * 100 : 0,
    }));

  return {
    totalVolume,
    totalFees,
    totalPnl,
    netPnl: totalPnl - totalFees,
    feeRate: totalVolume > 0 ? (totalFees / totalVolume) * 100 : 0,
    topCoins,
  };
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function analyzeWindow(fills: Fill[], daysAgo: number, myFeeRate: number) {
  const cutoffTime = (Date.now() / 1000 - daysAgo * 24 * 3600) * 1000;

  let tradesCount = 0, winCount = 0, lossCount = 0;
  let grossProfit = 0, grossLoss = 0, totalFees = 0;
  let totalRoi = 0, totalVolume = 0;
  let longTrades = 0, longWins = 0, shortTrades = 0, shortWins = 0;
  let maxSingleWin = 0, maxSingleLoss = 0;
  let currentLossStreak = 0, maxLossStreak = 0;
  let currentWinStreak = 0, maxWinStreak = 0;
  let nightTrades = 0;
  let martingaleSignals = 0, lastWasLoss = false, lastCloseSz = 0;
  let totalHoldTimeWinMs = 0, totalHoldTimeLossMs = 0;
  const closeSizes: number[] = [];
  const pnlSeries: number[] = [];
  const pnlPoints: { time: number; pnl: number }[] = [];
  const positionPoints: { time: number; notional: number; win: boolean }[] = [];
  const coinStats: Record<string, { trades: number; wins: number; volume: number; pnl: number }> = {};
  const lastOpenTime: Record<string, number> = {};

  for (const f of fills) {
    const fillTime = f.time;
    if (fillTime < cutoffTime) continue;

    const coin = f.coin;
    const pnl = f.closedPnl;
    const fee = f.fee;
    const sz = f.sz;
    const px = f.px;
    const notional = sz * px;

    const utcHour = Math.floor((fillTime / 1000 / 3600) % 24);
    if (utcHour >= 0 && utcHour < 6) nightTrades++;

    if (pnl === 0) {
      if (!(coin in lastOpenTime)) lastOpenTime[coin] = fillTime;
    }

    if (pnl !== 0) {
      tradesCount++;
      totalFees += fee;
      totalVolume += notional;
      closeSizes.push(sz);
      pnlSeries.push(pnl);
      pnlPoints.push({ time: fillTime, pnl });
      positionPoints.push({ time: fillTime, notional, win: pnl > 0 });
      if (!coinStats[coin]) coinStats[coin] = { trades: 0, wins: 0, volume: 0, pnl: 0 };
      coinStats[coin].trades++;
      coinStats[coin].volume += notional;
      coinStats[coin].pnl += pnl;

      const roi = notional > 0 ? (pnl / notional) * 100 : 0;
      totalRoi += roi;

      const isLongClose = f.dir ? f.dir.includes("Long") : pnl > 0;
      if (isLongClose) { longTrades++; if (pnl > 0) longWins++; }
      else { shortTrades++; if (pnl > 0) shortWins++; }

      const holdDuration = fillTime - (lastOpenTime[coin] ?? fillTime);

      if (pnl > 0) {
        winCount++;
        grossProfit += pnl;
        maxSingleWin = Math.max(maxSingleWin, pnl);
        coinStats[coin].wins++;
        currentWinStreak++;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
        currentLossStreak = 0;
        if (coin in lastOpenTime) totalHoldTimeWinMs += holdDuration;
        lastWasLoss = false;
        lastCloseSz = sz;
      } else {
        lossCount++;
        const absLoss = Math.abs(pnl);
        grossLoss += absLoss;
        maxSingleLoss = Math.max(maxSingleLoss, absLoss);
        currentLossStreak++;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
        currentWinStreak = 0;
        if (coin in lastOpenTime) totalHoldTimeLossMs += holdDuration;
        if (lastWasLoss && lastCloseSz > 0 && sz > lastCloseSz * 1.5) martingaleSignals++;
        lastWasLoss = true;
        lastCloseSz = sz;
      }

      delete lastOpenTime[coin];
    }
  }

  if (tradesCount === 0) return { days: daysAgo, trades: 0 };

  const winRate = (winCount / tradesCount) * 100;
  const avgWin = winCount > 0 ? grossProfit / winCount : 0;
  const avgLoss = lossCount > 0 ? grossLoss / lossCount : 0;
  const pnlRatio = avgLoss > 0 ? avgWin / avgLoss : 999;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 999;
  const netPnl = grossProfit - grossLoss - totalFees;
  const avgRoi = totalRoi / tradesCount;
  const freq = tradesCount / daysAgo;
  const avgNotional = totalVolume / tradesCount;
  const feeDrag = grossProfit > 0 ? (totalFees / grossProfit) * 100 : 999;

  const szMean = closeSizes.length > 0 ? closeSizes.reduce((a, b) => a + b, 0) / closeSizes.length : 0;
  const szStd = stddev(closeSizes);
  const posCv = szMean > 0 ? szStd / szMean : 0;

  const largeLossEvents = avgLoss > 0 ? pnlSeries.filter(p => p < 0 && Math.abs(p) > avgLoss * 2).length : 0;
  const nightRatio = (nightTrades / tradesCount) * 100;
  const recoveryFactor = maxSingleLoss > 0 ? netPnl / maxSingleLoss : 999;
  const expectValue = (winRate / 100) * avgWin - ((1 - winRate / 100) * avgLoss);

  const top5Coins = Object.entries(coinStats)
    .sort((a, b) => b[1].volume - a[1].volume)
    .slice(0, 5)
    .map(([coin, data]) => ({
      coin,
      trades: data.trades,
      wins: data.wins,
      volume: data.volume,
      pnl: data.pnl,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
    }));

  const top5Volume = top5Coins.reduce((sum, c) => sum + c.volume, 0);
  const concentrationRatio = totalVolume > 0 ? (top5Volume / totalVolume) * 100 : 0;

  const reverseGrossProfit = grossLoss;
  const reverseGrossLoss = grossProfit;
  const myFees = totalVolume * 2 * (myFeeRate / 100);
  const reverseNetPnl = reverseGrossProfit - reverseGrossLoss - myFees;
  const reverseWinRate = (lossCount / tradesCount) * 100;
  const reverseAvgWin = avgLoss;
  const reverseAvgLoss = avgWin;
  const reversePnlRatio = reverseAvgLoss > 0 ? reverseAvgWin / reverseAvgLoss : 999;
  const rawEdge = reverseGrossProfit - reverseGrossLoss;
  const breakevenFeeRate = totalVolume > 0 ? (rawEdge / (totalVolume * 2)) * 100 : 0;

  let leekScore = 0;
  const diagnoses: string[] = [];

  const avgHoldWinH = winCount > 0 ? totalHoldTimeWinMs / winCount / 1000 / 3600 : 0;
  const avgHoldLossH = lossCount > 0 ? totalHoldTimeLossMs / lossCount / 1000 / 3600 : 0;
  const avgHoldTotalH = (totalHoldTimeWinMs + totalHoldTimeLossMs) / tradesCount / 1000 / 3600;

  if (avgHoldLossH > avgHoldWinH * 2 && avgHoldWinH > 0) {
    diagnoses.push("[绝佳猎物🏆] 截断利润、让亏损奔跑！一赚钱就跑，亏钱死扛，反向跟单绝佳！");
    leekScore += 3;
  }
  if (maxSingleLoss > avgWin * 5 && avgWin > 0) {
    diagnoses.push("[定时炸弹💣] 单次巨亏远超平时利润，跟他反向可吃大爆仓利润！");
    leekScore += 2;
  }
  if (maxLossStreak >= 6) {
    diagnoses.push("[情绪大师😡] 连亏超6次，极易上头逆势加仓，连亏期反向跟单效果极佳。");
    leekScore += 2;
  }
  if (martingaleSignals >= 3) {
    diagnoses.push("[自爆机器🎰] 高度马丁格尔行为，正在用倍投策略加速爆仓。");
    leekScore += 3;
  }
  if (feeDrag > 60) {
    diagnoses.push(`[手续费黑洞💸] 手续费侵蚀毛利润 ${feeDrag.toFixed(0)}%，过度交易自我消耗，净值必然长期下滑。`);
    leekScore += 1;
  }
  if (posCv > 1.5) {
    diagnoses.push("[无纪律选手📏] 仓位管理极度混乱，情绪主导开仓大小，爆仓风险极高。");
    leekScore += 2;
  }
  if (nightRatio > 30) {
    diagnoses.push(`[夜猫子🌙] ${nightRatio.toFixed(0)}%的交易发生在凌晨，情绪失控概率大幅上升。`);
    leekScore += 1;
  }
  if (expectValue < 0) {
    diagnoses.push(`[数学必亏📉] 单笔数学期望为负($${expectValue.toFixed(2)})，不需要运气，持续交易就是持续亏损。`);
    leekScore += 2;
  }
  if (largeLossEvents >= 3) {
    diagnoses.push(`[无止损裸奔🚫] ${largeLossEvents}次超额亏损事件，从不设止损，等待系统强平。`);
    leekScore += 2;
  }
  if (reverseNetPnl > 0) {
    diagnoses.push(`[反向跟单可行✅] 扣除手续费后，本周期反向跟单净盈利 $${reverseNetPnl.toFixed(2)}，数据验证有效！`);
    leekScore += 2;
  } else if (rawEdge > 0) {
    diagnoses.push(`[反向跟单受阻⚠️] 毛利润为正($${rawEdge.toFixed(2)})但手续费($${myFees.toFixed(2)})吃掉收益，需降低费率或选更频繁的亏损期。`);
  }

  let conclusion = "";
  if (diagnoses.length === 0) {
    conclusion = netPnl > 0 ? "⚠️ 该钱包处于盈利状态，不建议作为反向跟单目标。" : "观望：普通亏损散户，特征不够极端，手续费磨损风险高。";
  } else if (leekScore >= 7) {
    conclusion = "🎯 顶级反向跟单标的，强烈建议盯紧！";
  } else if (leekScore >= 4) {
    conclusion = "🎯 优质反向跟单候选，值得持续观察。";
  } else {
    conclusion = "🎯 有一定特征，但不够极端，谨慎跟单。";
  }

  return {
    days: daysAgo,
    trades: tradesCount,
    winRate,
    netPnl,
    profitFactor,
    avgRoi,
    freq,
    longWr: longTrades > 0 ? (longWins / longTrades) * 100 : 0,
    shortWr: shortTrades > 0 ? (shortWins / shortTrades) * 100 : 0,
    avgWin,
    avgLoss,
    pnlRatio,
    maxWin: maxSingleWin,
    maxLoss: maxSingleLoss,
    maxLossStreak,
    maxWinStreak,
    fees: totalFees,
    avgHoldTotalH,
    avgHoldWinH,
    avgHoldLossH,
    totalVolume,
    avgNotional,
    feeDrag,
    posCv,
    martingaleSignals,
    nightRatio,
    largeLossEvents,
    recoveryFactor,
    expectValue,
    concentrationRatio,
    top5Coins,
    reverseNetPnl,
    reverseWinRate,
    reverseAvgWin,
    reverseAvgLoss,
    reversePnlRatio,
    myFees,
    rawEdge,
    breakevenFeeRate,
    leekScore,
    diagnoses,
    conclusion,
    pnlSeries: (() => {
      let cum = 0;
      return pnlPoints.map((p) => {
        cum += p.pnl;
        return { time: p.time, pnl: p.pnl, cumulative: cum };
      });
    })(),
    positionSeries: positionPoints,
    maxPosition: positionPoints.length > 0 ? Math.max(...positionPoints.map((p) => p.notional)) : 0,
    avgPosition: positionPoints.length > 0 ? positionPoints.reduce((s, p) => s + p.notional, 0) / positionPoints.length : 0,
  };
}

interface RawTransferEntry {
  time?: number;
  hash?: string;
  delta?: {
    type?: string;
    usdc?: string | number;
    amount?: string | number;
  };
}

async function fetchUserTransfers(wallet: string): Promise<RawTransferEntry[]> {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "userNonFundingLedgerUpdates", user: wallet }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<RawTransferEntry[]>;
}

function analyzeTransfers(entries: RawTransferEntry[], netPnl: number) {
  const deposits: { time: number; amount: number }[] = [];
  const withdrawals: { time: number; amount: number }[] = [];

  for (const e of entries) {
    const t = e.time ?? 0;
    const kind = e.delta?.type ?? "";
    const usdc = parseFloat(String(e.delta?.usdc ?? e.delta?.amount ?? 0));
    if (isNaN(usdc) || usdc <= 0) continue;
    if (kind === "deposit") deposits.push({ time: t, amount: usdc });
    else if (kind === "withdraw") withdrawals.push({ time: t, amount: usdc });
  }

  const totalDeposited = deposits.reduce((s, d) => s + d.amount, 0);
  const totalWithdrawn = withdrawals.reduce((s, w) => s + w.amount, 0);
  const netFlow = totalDeposited - totalWithdrawn;
  const depositTimes = deposits.map((d) => d.time).sort((a, b) => a - b);
  const withdrawTimes = withdrawals.map((w) => w.time).sort((a, b) => a - b);

  const lossConsumptionRate =
    netPnl < 0 && totalDeposited > 0
      ? Math.abs(netPnl) / totalDeposited
      : 0;

  return {
    depositCount: deposits.length,
    withdrawCount: withdrawals.length,
    totalDeposited,
    totalWithdrawn,
    netFlow,
    avgDeposit: deposits.length > 0 ? totalDeposited / deposits.length : 0,
    avgWithdraw: withdrawals.length > 0 ? totalWithdrawn / withdrawals.length : 0,
    maxDeposit: deposits.length > 0 ? Math.max(...deposits.map((d) => d.amount)) : 0,
    maxWithdraw: withdrawals.length > 0 ? Math.max(...withdrawals.map((w) => w.amount)) : 0,
    cashoutRatio: totalDeposited > 0 ? totalWithdrawn / totalDeposited : 0,
    firstDepositTime: depositTimes[0] ?? 0,
    lastDepositTime: depositTimes[depositTimes.length - 1] ?? 0,
    firstWithdrawTime: withdrawTimes[0] ?? 0,
    lastWithdrawTime: withdrawTimes[withdrawTimes.length - 1] ?? 0,
    lossConsumptionRate,
  };
}

router.post("/analyze", async (req, res) => {
  const parsed = AnalyzeWalletsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { wallets, timeWindows, mergeMinutes, myFeeRate } = parsed.data;

  if (wallets.length === 0) {
    res.status(400).json({ error: "At least one wallet address is required" });
    return;
  }

  const windows = timeWindows && timeWindows.length > 0
    ? [...timeWindows].sort((a, b) => b - a)
    : TIME_WINDOWS_DEFAULT;
  const mergeWindowMs = (mergeMinutes ?? 2.0) * 60 * 1000;
  const feeRate = myFeeRate ?? MY_FEE_RATE_DEFAULT;

  const results = await Promise.all(
    wallets.map(async (wallet) => {
      try {
        const [rawFills, rawTransfers] = await Promise.all([
          fetchUserFills(wallet),
          fetchUserTransfers(wallet).catch(() => [] as RawTransferEntry[]),
        ]);
        const cleanedFills = cleanAndMergeFills(rawFills, mergeWindowMs);
        const rawLen = rawFills.length;
        const cleanLen = cleanedFills.length;
        const waterRatio = rawLen > 0 ? ((rawLen - cleanLen) / rawLen) * 100 : 0;

        const globalStats = computeGlobalStats(cleanedFills);
        const windowStats = windows.map(days => analyzeWindow(cleanedFills, days, feeRate));
        const transferStats = analyzeTransfers(rawTransfers, globalStats.netPnl);

        return {
          wallet,
          rawFillCount: rawLen,
          cleanFillCount: cleanLen,
          waterRatio,
          globalStats,
          windowStats,
          transferStats,
        };
      } catch (err) {
        req.log.error({ wallet, err }, "Failed to analyze wallet");
        return {
          wallet,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    })
  );

  res.json({ results });
});

export default router;
