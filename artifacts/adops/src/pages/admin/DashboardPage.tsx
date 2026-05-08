import { useGetDashboardSummary, useGetSpendByProvider, useGetSpendByPitcher } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CreditCard, TrendingUp, AlertTriangle, Clock, CheckCircle, Ban } from "lucide-react";

function KpiCard({ title, value, icon: Icon, className }: { title: string; value: string | number; icon: typeof CreditCard; className?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className={`text-2xl font-bold ${className ?? ""}`}>{value}</p>
          </div>
          <div className="rounded-lg bg-muted p-2.5">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: providerSpend } = useGetSpendByProvider({});
  const { data: pitcherSpend } = useGetSpendByPitcher({});

  const providerChartData = Array.isArray(providerSpend)
    ? providerSpend.map((p) => ({
        name: p.providerName ?? "",
        spend: Number(p.todaySpend ?? 0),
      }))
    : [];

  const pitcherChartData = Array.isArray(pitcherSpend)
    ? pitcherSpend.map((p) => ({
        name: p.pitcherName ?? "",
        spend: Number(p.todaySpend ?? 0),
      }))
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

  const s = summary as Record<string, number> | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">数据看板</h1>
        <p className="text-sm text-muted-foreground mt-0.5">系统整体运营概况</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="账户总数" value={s?.totalAccounts ?? 0} icon={CreditCard} />
        <KpiCard title="运行中" value={s?.activeAccounts ?? 0} icon={CheckCircle} className="text-green-600" />
        <KpiCard title="空闲" value={s?.idleAccounts ?? 0} icon={Clock} className="text-amber-600" />
        <KpiCard title="已封禁" value={s?.bannedAccounts ?? 0} icon={Ban} className="text-red-600" />
        <KpiCard title="今日总消耗" value={`$${Number(s?.todayTotalSpend ?? 0).toFixed(2)}`} icon={TrendingUp} />
        <KpiCard title="待处理充值" value={s?.pendingRechargeOrders ?? 0} icon={Clock} />
        <KpiCard title="余额预警" value={s?.alertCount ?? 0} icon={AlertTriangle} className={(s?.alertCount ?? 0) > 0 ? "text-red-600" : ""} />
        <KpiCard title="用户总数" value={(s?.totalProviders ?? 0) + (s?.totalPitchers ?? 0)} icon={CreditCard} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">开户商今日消耗</CardTitle>
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
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="spend" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">投手今日消耗</CardTitle>
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
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="spend" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
