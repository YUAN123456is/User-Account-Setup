import { useState } from "react";
import { useGetDashboardSummary, useGetSpendByProvider, useGetSpendByPitcher, useGetDailyTrend } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Area, AreaChart,
} from "recharts";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { CreditCard, TrendingUp, AlertTriangle, Clock, CheckCircle, Ban, Wallet, DollarSign } from "lucide-react";

function KpiCard({
  title,
  value,
  icon: Icon,
  className,
  sub,
}: {
  title: string;
  value: string | number;
  icon: typeof CreditCard;
  className?: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            <p className={`text-xl font-bold leading-tight ${className ?? ""}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="rounded-lg bg-muted p-2 shrink-0 ml-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const tooltipStyle = {
  contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "hsl(var(--foreground))" },
};

export default function DashboardPage() {
  const [chartDateRange, setChartDateRange] = useState<DateRange>({ from: "", to: "" });

  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: trendData } = useGetDailyTrend({ days: 30 });

  const chartParams: Record<string, string> = {};
  if (chartDateRange.from) chartParams.dateFrom = chartDateRange.from;
  if (chartDateRange.to) chartParams.dateTo = chartDateRange.to;

  const { data: providerSpend } = useGetSpendByProvider(chartParams);
  const { data: pitcherSpend } = useGetSpendByPitcher(chartParams);

  const hasDateFilter = chartDateRange.from || chartDateRange.to;

  const providerChartData = Array.isArray(providerSpend)
    ? providerSpend.map((p) => ({ name: p.providerName ?? "", spend: Number(hasDateFilter ? p.totalSpend : p.todaySpend ?? 0) }))
    : [];

  const pitcherChartData = Array.isArray(pitcherSpend)
    ? pitcherSpend.map((p) => ({ name: p.pitcherName ?? "", spend: Number(hasDateFilter ? p.totalSpend : p.todaySpend ?? 0) }))
    : [];

  const trendChartData = Array.isArray(trendData)
    ? trendData.map((d) => ({ date: d.date.slice(5), spend: Number(d.totalSpend) }))
    : [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-16 bg-muted animate-pulse rounded" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const s = summary as Record<string, number | string> | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">数据看板</h1>
        <p className="text-sm text-muted-foreground mt-0.5">系统整体运营概况</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="账户总数" value={s?.totalAccounts ?? 0} icon={CreditCard} />
        <KpiCard title="运行中" value={s?.activeAccounts ?? 0} icon={CheckCircle} className="text-green-500" />
        <KpiCard title="空闲" value={s?.idleAccounts ?? 0} icon={Clock} className="text-amber-500" />
        <KpiCard title="已封禁" value={s?.bannedAccounts ?? 0} icon={Ban} className={(Number(s?.bannedAccounts) ?? 0) > 0 ? "text-red-500" : ""} />
        <KpiCard
          title="今日总消耗"
          value={`$${Number(s?.todayTotalSpend ?? 0).toFixed(2)}`}
          icon={TrendingUp}
          className="text-blue-500"
        />
        <KpiCard
          title="账户余额合计"
          value={`$${Number(s?.totalBalance ?? 0).toFixed(2)}`}
          icon={DollarSign}
          className="text-green-500"
        />
        <KpiCard
          title="今日充值"
          value={`$${Number(s?.todayRecharge ?? 0).toFixed(2)}`}
          icon={Wallet}
          className="text-amber-500"
        />
        <KpiCard
          title="待处理充值"
          value={s?.pendingRechargeOrders ?? 0}
          icon={Clock}
          className={(Number(s?.pendingRechargeOrders) ?? 0) > 0 ? "text-amber-500" : ""}
        />
        <KpiCard
          title="低余额预警"
          value={s?.alertCount ?? 0}
          icon={AlertTriangle}
          className={(Number(s?.alertCount) ?? 0) > 0 ? "text-red-500" : ""}
          sub="余额 < $100"
        />
        <KpiCard title="开户商数" value={s?.totalProviders ?? 0} icon={CreditCard} />
        <KpiCard title="投手数" value={s?.totalPitchers ?? 0} icon={CreditCard} />
        <KpiCard title="用户总数" value={(Number(s?.totalProviders ?? 0)) + (Number(s?.totalPitchers ?? 0))} icon={CreditCard} />
      </div>

      {/* 30-Day Trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">近 30 天消耗趋势</CardTitle>
        </CardHeader>
        <CardContent>
          {trendChartData.every((d) => d.spend === 0) ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">暂无上报数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trendChartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v.toFixed(2)}`, "消耗"]} />
                <Area type="monotone" dataKey="spend" stroke="hsl(var(--primary))" fill="url(#spendGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bar Charts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">消耗细分统计</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">时间范围</span>
            <DateRangePicker value={chartDateRange} onChange={setChartDateRange} />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{hasDateFilter ? "开户商期间消耗" : "开户商今日消耗"}</CardTitle>
            </CardHeader>
            <CardContent>
              {providerChartData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={providerChartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v.toFixed(2)}`, "消耗"]} />
                    <Bar dataKey="spend" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{hasDateFilter ? "投手期间消耗" : "投手今日消耗"}</CardTitle>
            </CardHeader>
            <CardContent>
              {pitcherChartData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={pitcherChartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v.toFixed(2)}`, "消耗"]} />
                    <Bar dataKey="spend" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
