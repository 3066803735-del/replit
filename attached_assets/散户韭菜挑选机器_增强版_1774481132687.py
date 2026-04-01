import requests
import time
import os
import sys
from collections import defaultdict
import statistics

# ================= 环境变量配置 =================
ENV_WALLETS = os.getenv('TARGET_WALLETS', '0x2d143520a601068ed5046a943ab4b05edd459768,0x95f036ffcd2f8a58a415733176cbcd2e4cec2bce')
TARGET_WALLETS = [w.strip() for w in ENV_WALLETS.split(',') if w.strip()]

ENV_DAYS = os.getenv('TIME_WINDOWS', '3,7,30')
TIME_WINDOWS = sorted([int(d.strip()) for d in ENV_DAYS.split(',') if d.strip()], reverse=True)

# 🌟 数据脱水时间窗口（分钟），默认 2 分钟内的同向碎单全合并
ENV_MERGE_MINUTES = float(os.getenv('MERGE_MINUTES', 2.0))
MERGE_WINDOW_MS = int(ENV_MERGE_MINUTES * 60 * 1000)

# 💰 反向跟单者自身的手续费率（%），默认 Hyperliquid taker 费率 0.035%
MY_TAKER_FEE_RATE = float(os.getenv('MY_FEE_RATE', 0.035))

# ================= 数据拉取与清洗引擎 =================
def fetch_user_fills(wallet_address):
    url = "https://api.hyperliquid.xyz/info"
    payload = {"type": "userFills", "user": wallet_address}
    try:
        r = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=10)
        return r.json()
    except Exception as e:
        print(f"❌ 获取 {wallet_address[:8]} 数据失败: {e}")
        return []

def clean_and_merge_fills(raw_fills):
    """核心：前置数据脱水引擎，清洗交易所产生的滑点碎单"""
    if not raw_fills: return []

    sorted_fills = sorted(raw_fills, key=lambda x: x.get('time', 0))
    merged_list = []
    last_fill_by_coin = {}

    for f in sorted_fills:
        coin      = f.get('coin')
        curr_time = f.get('time', 0)
        curr_dir  = f.get('dir', '')
        curr_pnl  = float(f.get('closedPnl', 0))
        curr_fee  = float(f.get('fee', 0))
        curr_sz   = float(f.get('sz', 0))
        curr_px   = float(f.get('px', 0))

        prev = last_fill_by_coin.get(coin)

        can_merge = False
        if prev and (curr_time - prev['time_start']) <= MERGE_WINDOW_MS:
            if prev['dir'] == curr_dir:
                can_merge = True

        if can_merge:
            total_sz = prev['sz'] + curr_sz
            if total_sz > 0:
                prev['px'] = (prev['sz'] * prev['px'] + curr_sz * curr_px) / total_sz
            prev['sz']          = total_sz
            prev['fee']        += curr_fee
            prev['closedPnl']  += curr_pnl
            prev['time']        = curr_time
            prev['merged_count'] += 1
        else:
            new_fill = {
                'coin': coin, 'dir': curr_dir, 'sz': curr_sz, 'px': curr_px,
                'fee': curr_fee, 'closedPnl': curr_pnl,
                'time_start': curr_time, 'time': curr_time, 'merged_count': 1
            }
            merged_list.append(new_fill)
            last_fill_by_coin[coin] = new_fill

    return merged_list

# ================= 全局成交量统计 =================
def compute_global_volume_stats(cleaned_fills):
    """统计钱包有史以来全部成交量与手续费（脱水后）"""
    total_volume   = 0.0
    total_fees     = 0.0
    total_pnl      = 0.0
    coin_volume    = defaultdict(float)
    coin_fees      = defaultdict(float)

    for f in cleaned_fills:
        notional = float(f.get('sz', 0)) * float(f.get('px', 0))
        fee      = float(f.get('fee', 0))
        pnl      = float(f.get('closedPnl', 0))
        coin     = f.get('coin', '?')

        # ✅ 开+平全部累加（双边）
        total_volume      += notional
        total_fees        += fee
        coin_volume[coin] += notional
        coin_fees[coin]   += fee
        total_pnl         += pnl

    top_coins = sorted(coin_volume.items(), key=lambda x: x[1], reverse=True)[:5]
    fee_rate = (total_fees / total_volume * 100) if total_volume > 0 else 0

    return {
        "total_volume": total_volume,
        "total_fees":   total_fees,
        "total_pnl":    total_pnl,
        "fee_rate":     fee_rate,
        "top_coins":    top_coins,
        "coin_fees":    dict(coin_fees),
    }

# ================= 核心分析逻辑 =================
def analyze_time_window(cleaned_fills, days_ago):
    cutoff_time = (time.time() - (days_ago * 24 * 3600)) * 1000

    trades_count, win_count, loss_count = 0, 0, 0
    gross_profit, gross_loss, total_fees = 0.0, 0.0, 0.0
    total_roi        = 0.0
    total_volume     = 0.0  

    long_trades, long_wins   = 0, 0
    short_trades, short_wins = 0, 0

    max_single_win, max_single_loss = 0.0, 0.0

    current_loss_streak, max_loss_streak = 0, 0
    current_win_streak,  max_win_streak  = 0, 0

    last_open_time        = {}
    last_open_sz          = {}   
    total_hold_time_win_ms  = 0
    total_hold_time_loss_ms = 0

    close_sizes          = []          
    notional_values      = []          
    large_loss_events    = 0           
    night_trades         = 0           
    coin_stats           = defaultdict(lambda: {"trades": 0, "wins": 0, "volume": 0.0, "pnl": 0.0})

    martingale_signals   = 0
    last_was_loss        = False
    last_close_sz        = 0.0

    pnl_series           = []          

    for fill in cleaned_fills:
        fill_time = fill.get('time', 0)
        if fill_time < cutoff_time: continue

        coin     = fill.get('coin')
        side     = fill.get('dir')
        pnl      = float(fill.get('closedPnl', 0))
        fee      = float(fill.get('fee', 0))
        sz       = float(fill.get('sz', 0))
        px       = float(fill.get('px', 0))
        notional = sz * px

        utc_hour = (fill_time // 1000 // 3600) % 24
        if 0 <= utc_hour < 6:
            night_trades += 1

        # ✅ 【修正 1】确保全局双边数据（开仓+平仓）全部在此累加
        total_volume += notional
        total_fees   += fee
        coin_stats[coin]["volume"] += notional  # 移出平仓逻辑块，真实记录单个币种的开+平成交量

        # 开仓记录 (pnl == 0 代表开仓或加仓)
        if pnl == 0:
            if coin not in last_open_time:
                last_open_time[coin] = fill_time
                last_open_sz[coin]   = sz

        # 平仓结算 (pnl != 0 代表产生了盈亏结算)
        if pnl != 0:
            trades_count += 1
            close_sizes.append(sz)
            notional_values.append(notional)
            pnl_series.append(pnl)

            coin_stats[coin]["trades"] += 1
            coin_stats[coin]["pnl"]    += pnl

            roi = (pnl / notional * 100) if notional > 0 else 0
            total_roi += roi

            is_long_close = ('Long' in side) if side else (pnl > 0)
            if is_long_close:
                long_trades += 1
                if pnl > 0: long_wins += 1
            else:
                short_trades += 1
                if pnl > 0: short_wins += 1

            hold_duration = fill_time - last_open_time.get(coin, fill_time)

            if pnl > 0:
                win_count       += 1
                gross_profit    += pnl
                max_single_win   = max(max_single_win, pnl)
                coin_stats[coin]["wins"] += 1
                current_win_streak  += 1
                max_win_streak       = max(max_win_streak, current_win_streak)
                current_loss_streak  = 0
                if coin in last_open_time: total_hold_time_win_ms += hold_duration
                last_was_loss  = False
                last_close_sz  = sz
            else:
                loss_count     += 1
                abs_loss        = abs(pnl)
                gross_loss     += abs_loss
                max_single_loss = max(max_single_loss, abs_loss)
                current_loss_streak += 1
                max_loss_streak      = max(max_loss_streak, current_loss_streak)
                current_win_streak   = 0
                if coin in last_open_time: total_hold_time_loss_ms += hold_duration
                if last_was_loss and last_close_sz > 0 and sz > last_close_sz * 1.5:
                    martingale_signals += 1
                last_was_loss = True
                last_close_sz = sz

            if coin in last_open_time: del last_open_time[coin]
            if coin in last_open_sz:   del last_open_sz[coin]

    if trades_count == 0:
        return {"days": days_ago, "trades": 0}

    win_rate       = win_count  / trades_count * 100
    avg_win        = gross_profit / win_count    if win_count  > 0 else 0
    avg_loss       = gross_loss   / loss_count   if loss_count > 0 else 0
    pnl_ratio      = avg_win / avg_loss          if avg_loss   > 0 else 999
    profit_factor  = gross_profit / gross_loss   if gross_loss > 0 else 999
    net_pnl        = gross_profit - gross_loss - total_fees
    avg_roi        = total_roi / trades_count
    daily_freq     = trades_count / days_ago

    avg_hold_win_h   = (total_hold_time_win_ms  / win_count  / 1000 / 3600) if win_count  > 0 else 0
    avg_hold_loss_h  = (total_hold_time_loss_ms / loss_count / 1000 / 3600) if loss_count > 0 else 0
    avg_hold_total_h = ((total_hold_time_win_ms + total_hold_time_loss_ms) / trades_count / 1000 / 3600)

    # ✅ 【修正 2】均仓位价值：由于 total_volume 是双边，计算单边平均仓位需除以 (trades_count * 2)
    avg_notional     = (total_volume / 2) / trades_count if trades_count > 0 else 0
    fee_drag         = (total_fees / gross_profit * 100) if gross_profit > 0 else 999  

    sz_mean = statistics.mean(close_sizes)  if close_sizes else 0
    sz_std  = statistics.stdev(close_sizes) if len(close_sizes) > 1 else 0
    pos_cv  = (sz_std / sz_mean) if sz_mean > 0 else 0  

    if avg_loss > 0:
        large_loss_events = sum(1 for p in pnl_series if p < 0 and abs(p) > avg_loss * 2)

    night_ratio = night_trades / trades_count * 100
    recovery_factor = net_pnl / max_single_loss if max_single_loss > 0 else 999
    expect_value = (win_rate / 100 * avg_win) - ((1 - win_rate / 100) * avg_loss)

    top3_coins = sorted(coin_stats.items(), key=lambda x: x[1]["volume"], reverse=True)[:3]
    top3_volume = sum(c[1]["volume"] for c in top3_coins)
    concentration_ratio = (top3_volume / total_volume * 100) if total_volume > 0 else 0

    # 反向跟单模拟
    reverse_gross_profit = gross_loss    
    reverse_gross_loss   = gross_profit  
    my_fees              = total_volume * (MY_TAKER_FEE_RATE / 100) 
    reverse_net_pnl      = reverse_gross_profit - reverse_gross_loss - my_fees
    reverse_win_rate     = (loss_count / trades_count * 100)  
    reverse_avg_win      = avg_loss                           
    reverse_avg_loss     = avg_win                            
    reverse_pnl_ratio    = (reverse_avg_win / reverse_avg_loss) if reverse_avg_loss > 0 else 999
    raw_edge             = reverse_gross_profit - reverse_gross_loss
    breakeven_fee_rate   = (raw_edge / total_volume * 100) if total_volume > 0 else 0  

    return {
        "days": days_ago, "trades": trades_count, "win_rate": win_rate,
        "net_pnl": net_pnl, "profit_factor": profit_factor, "avg_roi": avg_roi,
        "freq": daily_freq,
        "long_wr":  (long_wins  / long_trades  * 100) if long_trades  > 0 else 0,
        "short_wr": (short_wins / short_trades * 100) if short_trades > 0 else 0,
        "avg_win": avg_win, "avg_loss": avg_loss, "pnl_ratio": pnl_ratio,
        "max_win": max_single_win, "max_loss": max_single_loss,
        "max_loss_streak": max_loss_streak, "max_win_streak": max_win_streak,
        "fees": total_fees,
        "avg_hold_total_h": avg_hold_total_h,
        "avg_hold_win_h":   avg_hold_win_h,
        "avg_hold_loss_h":  avg_hold_loss_h,
        "total_volume":       total_volume,
        "avg_notional":       avg_notional,
        "fee_drag":           fee_drag,
        "pos_cv":             pos_cv,
        "martingale_signals": martingale_signals,
        "night_ratio":        night_ratio,
        "large_loss_events":  large_loss_events,
        "recovery_factor":    recovery_factor,
        "expect_value":        expect_value,
        "concentration_ratio": concentration_ratio,
        "top3_coins":          top3_coins,
        "reverse_net_pnl":     reverse_net_pnl,
        "reverse_win_rate":    reverse_win_rate,
        "reverse_avg_win":     reverse_avg_win,
        "reverse_avg_loss":    reverse_avg_loss,
        "reverse_pnl_ratio":   reverse_pnl_ratio,
        "my_fees":             my_fees,
        "raw_edge":            raw_edge,
        "breakeven_fee_rate":  breakeven_fee_rate,
    }

# ================= 报告输出 =================
def print_report(wallet, raw_fills):
    print(f"\n" + "═"*70)
    print(f"🕵️  深度透视目标: {wallet}")

    cleaned_fills = clean_and_merge_fills(raw_fills)
    raw_len   = len(raw_fills)
    clean_len = len(cleaned_fills)
    water_ratio = ((raw_len - clean_len) / raw_len * 100) if raw_len > 0 else 0

    print(f"   [数据脱水] 原始底层记录: {raw_len} 条  →  有效动作: {clean_len} 笔  "
          f"(💧 挤干水分率 {water_ratio:.1f}%)")
    print("═"*70)

    if not cleaned_fills: return

    gvs = compute_global_volume_stats(cleaned_fills)
    print(f"\n 💰 【全历史成交量 & 手续费总览 (含开仓与平仓双边)】")
    print(f"  ➤ 总名义成交量  : ${gvs['total_volume']:>14,.2f}")
    print(f"  ➤ 累计手续费    : ${gvs['total_fees']:>14,.2f}  (综合费率 {gvs['fee_rate']:.4f}%/笔)")
    print(f"  ➤ 累计已实现PnL : ${gvs['total_pnl']:>14,.2f}")
    print(f"  ➤ 净盈亏(扣费后): ${gvs['total_pnl'] - gvs['total_fees']:>14,.2f}")
    print(f"\n  🏆 成交量 Top 5 币种:")
    for rank, (coin, vol) in enumerate(gvs['top_coins'], 1):
        fee_c = gvs['coin_fees'].get(coin, 0)
        pct   = vol / gvs['total_volume'] * 100 if gvs['total_volume'] > 0 else 0
        print(f"     {rank}. {coin:<10} 成交量 ${vol:>12,.2f}  ({pct:.1f}%)  |  手续费 ${fee_c:,.2f}")
    print("─"*70)

    for days in TIME_WINDOWS:
        stats = analyze_time_window(cleaned_fills, days)
        if stats.get('trades', 0) == 0:
            print(f"\n[{days} 天内] 无平仓记录。")
            continue

        print(f"\n📅 【近 {days} 天 数据切片】")

        print(f"\n 💹 成交量 & 费用:")
        print(f"  ➤ 区间双边成交量: ${stats['total_volume']:>12,.2f}  "
              f"(单边均仓位价值 ${stats['avg_notional']:,.2f})")
        print(f"  ➤ 区间手续费    : ${stats['fees']:>12,.2f}  "
              f"(手续费侵蚀率: {stats['fee_drag']:.1f}% of 毛利润)"
              + ("  ⚠️ 严重侵蚀" if stats['fee_drag'] > 50 else ""))

        print(f"\n 📊 基础交易数据:")
        print(f"  ➤ 真实平仓频次: {stats['trades']} 笔 (约 {stats['freq']:.1f} 笔/天)")
        print(f"  ➤ 净 盈 亏    : ${stats['net_pnl']:.2f}")
        print(f"  ➤ 纯净收益率  : {stats['avg_roi']:.2f}% / 笔")
        ev_tag = "🔴 负期望，长期必亏" if stats['expect_value'] < 0 else "🟢 正期望"
        print(f"  ➤ 单笔数学期望: ${stats['expect_value']:.2f}  [{ev_tag}]")

        print(f"\n ⚖️  真实胜负与多空特征:")
        print(f"  ➤ 整体胜率    : {stats['win_rate']:.1f}%  "
              f"(多头 {stats['long_wr']:.1f}% | 空头 {stats['short_wr']:.1f}%)")
        print(f"  ➤ 盈 亏 比    : {stats['pnl_ratio']:.2f}  "
              f"(均赢 ${stats['avg_win']:.2f} / 均亏 ${stats['avg_loss']:.2f})")
        print(f"  ➤ 盈利因子    : {stats['profit_factor']:.2f} "
              + ("(🩸 超级血包)" if stats['profit_factor'] < 0.6 else "(✅ 正常)"))
        print(f"  ➤ 连胜 / 连败 : 最多 {stats['max_win_streak']} 连胜  /  最多 {stats['max_loss_streak']} 连败")

        print(f"\n 🧠 韭菜心理学画像:")
        print(f"  ➤ 单笔最大亏损: -${stats['max_loss']:.2f}  |  单笔最大盈利: +${stats['max_win']:.2f}")
        rf_tag = "⚠️ 极低，亏损未能覆盖" if stats['recovery_factor'] < 1 else "✅ 尚可"
        print(f"  ➤ 回撤恢复因子: {stats['recovery_factor']:.2f}  [{rf_tag}]")
        print(f"  ➤ 超额亏损事件: {stats['large_loss_events']} 次 (单笔亏损 > 均亏×2，无止损特征)"
              + ("  🚨" if stats['large_loss_events'] >= 3 else ""))
        hold_tag = "⚠️ 极其畸形 (死扛亏损)" if stats['avg_hold_loss_h'] > (stats['avg_hold_win_h'] * 2 + 1) else "正常"
        print(f"  ➤ 盈利/亏损持仓: {stats['avg_hold_win_h']:.1f}h / {stats['avg_hold_loss_h']:.1f}h  [{hold_tag}]")

        print(f"\n 🔬 深度行为指标 (新):")
        cv_tag = "🚨 极度情绪化，仓位毫无纪律" if stats['pos_cv'] > 1.5 \
            else ("⚠️ 仓位波动较大" if stats['pos_cv'] > 0.8 else "✅ 仓位较稳定")
        print(f"  ➤ 仓位规模变异系数: {stats['pos_cv']:.2f}  [{cv_tag}]")

        mg_tag = "🎰 高度疑似倍投/马丁格尔，跟他反向可吃大爆仓！" if stats['martingale_signals'] >= 3 \
            else ("⚠️ 有加仓迹象" if stats['martingale_signals'] >= 1 else "✅ 未发现")
        print(f"  ➤ 马丁格尔信号次数: {stats['martingale_signals']} 次  [{mg_tag}]")

        nt_tag = "🌙 高度夜间情绪交易" if stats['night_ratio'] > 30 \
            else ("⚠️ 有一定夜间交易" if stats['night_ratio'] > 15 else "✅ 正常")
        print(f"  ➤ 深夜交易占比(UTC0-6): {stats['night_ratio']:.1f}%  [{nt_tag}]")

        cc_tag = "♟️  高集中，孤注一掷" if stats['concentration_ratio'] > 80 \
            else ("⚠️ 偏集中" if stats['concentration_ratio'] > 60 else "✅ 较分散")
        print(f"  ➤ Top3币种成交集中度: {stats['concentration_ratio']:.1f}%  [{cc_tag}]")
        for rank, (coin, cdata) in enumerate(stats['top3_coins'], 1):
            cwr = (cdata['wins'] / cdata['trades'] * 100) if cdata['trades'] > 0 else 0
            print(f"     {rank}. {coin:<8} {cdata['trades']} 笔  胜率 {cwr:.0f}%  PnL ${cdata['pnl']:.2f}")

        r = stats
        print(f"\n 🔄 反向跟单模拟盈亏 (假设 1:1 镜像跟单，手续费率 {MY_TAKER_FEE_RATE}%):")
        print(f"  ➤ 扣费前毛利润  : ${r['raw_edge']:>10,.2f}  "
              f"(吃到他的亏损 ${r['reverse_gross_profit']:,.2f} - 跟输他的盈利 ${r['reverse_gross_loss']:,.2f})")
        print(f"  ➤ 我方手续费    : -${r['my_fees']:>9,.2f}  (双边成交量 ${r['total_volume']:,.0f} × {MY_TAKER_FEE_RATE:.3f}%)")

        net_tag = "✅ 正收益！值得跟" if r['reverse_net_pnl'] > 0 else "❌ 负收益，手续费吃掉优势"
        print(f"  ➤ 反向跟单净盈亏: ${r['reverse_net_pnl']:>10,.2f}  [{net_tag}]")

        print(f"  ➤ 反向胜率      : {r['reverse_win_rate']:.1f}%  "
              f"(均赢 ${r['reverse_avg_win']:.2f} / 均亏 ${r['reverse_avg_loss']:.2f}，盈亏比 {r['reverse_pnl_ratio']:.2f})")

        if r['breakeven_fee_rate'] > 0:
            be_tag = "⚠️ 低于我方费率，跟单已不划算" if r['breakeven_fee_rate'] < MY_TAKER_FEE_RATE else "✅ 高于我方费率，有安全垫"
            print(f"  ➤ 盈亏平衡费率  : {r['breakeven_fee_rate']:.4f}%/笔  [{be_tag}]")
        else:
            print(f"  ➤ 盈亏平衡费率  : N/A（毛利润本身已为负，反向跟单无意义）")

        print(f"\n 🤖 AI 最终诊断结论 (含反向跟单可行性):")
        leek_score = 0
        diagnoses  = []

        if stats['avg_hold_loss_h'] > stats['avg_hold_win_h'] * 2 and stats['avg_hold_win_h'] > 0:
            diagnoses.append("  [绝佳猎物🏆] 截断利润、让亏损奔跑！一赚钱就跑，亏钱死扛，反向跟单绝佳！")
            leek_score += 3
        if stats['max_loss'] > stats['avg_win'] * 5 and stats['avg_win'] > 0:
            diagnoses.append("  [定时炸弹💣] 单次巨亏远超平时利润，跟他反向可吃大爆仓利润！")
            leek_score += 2
        if stats['max_loss_streak'] >= 6:
            diagnoses.append("  [情绪大师😡] 连亏超6次，极易上头逆势加仓，连亏期反向跟单效果极佳。")
            leek_score += 2
        if stats['martingale_signals'] >= 3:
            diagnoses.append("  [自爆机器🎰] 高度马丁格尔行为，正在用倍投策略加速爆仓。")
            leek_score += 3
        if stats['fee_drag'] > 60:
            diagnoses.append(f"  [手续费黑洞💸] 手续费侵蚀毛利润 {stats['fee_drag']:.0f}%，过度交易自我消耗，净值必然长期下滑。")
            leek_score += 1
        if stats['pos_cv'] > 1.5:
            diagnoses.append("  [无纪律选手📏] 仓位管理极度混乱，情绪主导开仓大小，爆仓风险极高。")
            leek_score += 2
        if stats['night_ratio'] > 30:
            diagnoses.append(f"  [夜猫子🌙] {stats['night_ratio']:.0f}%的交易发生在凌晨，情绪失控概率大幅上升。")
            leek_score += 1
        if stats['expect_value'] < 0:
            diagnoses.append(f"  [数学必亏📉] 单笔数学期望为负(${stats['expect_value']:.2f})，不需要运气，持续交易就是持续亏损。")
            leek_score += 2
        if stats['large_loss_events'] >= 3:
            diagnoses.append(f"  [无止损裸奔🚫] {stats['large_loss_events']}次超额亏损事件，从不设止损，等待系统强平。")
            leek_score += 2
        if stats['reverse_net_pnl'] > 0:
            diagnoses.append(f"  [反向跟单可行✅] 扣除手续费后，本周期反向跟单净盈利 ${stats['reverse_net_pnl']:.2f}，数据验证有效！")
            leek_score += 2
        elif stats['raw_edge'] > 0:
            diagnoses.append(f"  [反向跟单受阻⚠️] 毛利润为正(${stats['raw_edge']:.2f})但手续费吃掉收益，需降低费率或选更频繁的亏损期。")

        if diagnoses:
            for d in diagnoses:
                print(d)
            print(f"\n  ⭐ 综合韭菜评分: {'★' * min(leek_score, 10)}  {leek_score}/10+ 分")
            if leek_score >= 7:
                print("  🎯 结论：顶级反向跟单标的，强烈建议盯紧！")
            elif leek_score >= 4:
                print("  🎯 结论：优质反向跟单候选，值得持续观察。")
            else:
                print("  🎯 结论：有一定特征，但不够极端，谨慎跟单。")
        else:
            if stats['net_pnl'] > 0:
                print("  [⚠️ 危险] 该钱包处于盈利状态，不建议作为反向跟单目标。")
            else:
                print("  [观望] 普通亏损散户，特征不够极端，手续费磨损风险高。")

        print("─"*70)

# ================= 运行入口 =================
if __name__ == "__main__":
    print("⚙️" + "❤️"*35)
    print(f"   启动 [脱水纯净版·增强X光雷达]  正在扫描 {len(TARGET_WALLETS)} 个目标钱包...")
    print("⚙️" + "❤️"*35)
    for wallet in TARGET_WALLETS:
        fills_data = fetch_user_fills(wallet)
        print_report(wallet, fills_data)
        time.sleep(1)
