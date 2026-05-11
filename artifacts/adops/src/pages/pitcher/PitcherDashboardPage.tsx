import { useMemo } from "react";
import { Link } from "wouter";
import { useListAccounts, useListDailyStats, useListRechargeOrders } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RechargeStatusBadge } from "@/components/shared/StatusBadge";
import { Wallet, CreditCard, BarChart3, PlusCircle, AlertTriangle, CheckCircle, Clock, History, XCircle, Facebook } from "lucide-react";

interface Account {
  id: number;
  accountName: string;
  status: string;
  currentBalance: string;
  theoreticalBalance?: string | null;
}
interface DailyStat {
  id: number;
  accountId: number;
  accountName?: string;
  date: string;
  spendAmount: string;
  realBalance: string;
  hasAlert: boolean;
  status?: string | null;
  fbSynced?: boolean;
}
interface RechargeOrder {
  id: number;
  accountName?: string;
  amount: string;
  status: "pending" | "completed" | "rejected";
  createdAt: string;
}

export default function PitcherDashboardPage() {
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();

  const { data: accountsData, isLoading: acctLoading } = useListAccounts({});
  const { data: todayStatsData } = useListDailyStats({ dateFrom: yesterday, dateTo: yesterday } as Record<string, string>);
  const { data: recentStatsData } = useListDailyStats({} as Record<string, string>);
  const { data: ordersData } = useListRechargeOrders({} as Record<string, string>);

  const accounts = Array.isArray(accountsData) ? (accountsData as Account[]) : [];
  const todayStats = Array.isArray(todayStatsData) ? (todayStatsData as DailyStat[]) : [];
  const allOrders = Array.isArray(ordersData) ? (ordersData as RechargeOrder[]) : [];
  const recentStats = Array.isArray(recentStatsData) ? (recentStatsData as DailyStat[]) : [];

  const totalBalance = useMemo(
    () => accounts.reduce((s, a) => s + parseFloat(a.currentBalance || "0"), 0),
    [accounts],
  );
  const activeCount = accounts.filter((a) => a.status === "active").length;
  const totalAccountCount = accounts.length;
  const reportedTodayCount = todayStats.length;
  const notReportedCount = Math.max(0, totalAccountCount - reportedTodayCount);
  const pendingCount = allOrders.filter((o) => o.status === "pending").length;
  const alertCount = todayStats.filter((s) => s.hasAlert).length;

  const recentFive = useMemo(
    () => [...recentStats].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [recentStats],
  );
  const recentOrders = useMemo(
    () =>
      [...allOrders]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [allOrders],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">工作台</h1>
        <p className="text-sm text-muted-foreground mt-0.5">账户实时状态与快捷操作</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total balance — primary card */}
        <Card className="col-span-2 lg:col-span-1 border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">账户总余额</span>
            </div>
            {acctLoading ? (
              <div className="h-9 bg-muted animate-pulse rounded w-36 mb-1" />
            ) : (
              <p className="text-3xl font-bold tabular-nums text-primary">${totalBalance.toFixed(2)}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{totalAccountCount} 个账户合计</p>
          </CardContent>
        </Card>

        {/* Active accounts */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-green-500" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">活跃账户</span>
            </div>
            <p className="text-3xl font-bold tabular-nums">{acctLoading ? "—" : activeCount}</p>
            <p className="text-xs text-muted-foreground mt-1">共 {totalAccountCount} 个账户</p>
          </CardContent>
        </Card>

        {/* Yesterday report progress */}
        <Card className={notReportedCount > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-green-500/30 bg-green-500/5"}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${notReportedCount > 0 ? "bg-amber-500/10" : "bg-green-500/10"}`}>
                {notReportedCount > 0
                  ? <Clock className="h-4 w-4 text-amber-500" />
                  : <CheckCircle className="h-4 w-4 text-green-500" />}
              </div>
              <span className="text-sm text-muted-foreground font-medium">昨日上报</span>
            </div>
            <p className="text-3xl font-bold tabular-nums">
              {reportedTodayCount}
              <span className="text-lg text-muted-foreground font-normal"> / {totalAccountCount}</span>
            </p>
            <p className={`text-xs mt-1 font-medium ${notReportedCount > 0 ? "text-amber-500" : "text-green-500"}`}>
              {notReportedCount > 0 ? `${notReportedCount} 个账户待上报` : "全部已完成"}
            </p>
            {alertCount > 0 && (
              <p className="text-xs text-destructive mt-0.5">{alertCount} 条预警</p>
            )}
          </CardContent>
        </Card>

        {/* Pending recharge */}
        <Card className={pendingCount > 0 ? "border-blue-500/30 bg-blue-500/5" : ""}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                <PlusCircle className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">待审充值</span>
            </div>
            <p className="text-3xl font-bold tabular-nums">{pendingCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingCount > 0 ? "等待开户商审核" : "无待处理申请"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link href="/pitcher/report">
          <Button size="sm" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            每日上报
          </Button>
        </Link>
        <Link href="/pitcher/recharge">
          <Button size="sm" variant="outline" className="gap-1.5">
            <PlusCircle className="h-4 w-4" />
            申请充值
          </Button>
        </Link>
        <Link href="/pitcher/accounts">
          <Button size="sm" variant="outline" className="gap-1.5">
            <CreditCard className="h-4 w-4" />
            查看账户
          </Button>
        </Link>
        <Link href="/pitcher/history">
          <Button size="sm" variant="outline" className="gap-1.5">
            <History className="h-4 w-4" />
            上报记录
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent reports */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">最近上报记录</h2>
            <Link href="/pitcher/history">
              <span className="text-xs text-primary cursor-pointer hover:underline">查看全部 →</span>
            </Link>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-24">日期</TableHead>
                  <TableHead>账户</TableHead>
                  <TableHead className="text-right">消耗</TableHead>
                  <TableHead>审核</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentFive.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                      暂无上报记录
                    </TableCell>
                  </TableRow>
                ) : (
                  recentFive.map((s) => (
                    <TableRow key={s.id} className={s.status === "rejected" ? "bg-red-50/20 dark:bg-red-900/5" : ""}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{s.date}</TableCell>
                      <TableCell className="text-sm max-w-[120px] truncate" title={s.accountName}>
                        {s.accountName ?? `账户 #${s.accountId}`}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-right whitespace-nowrap">${Number(s.spendAmount).toFixed(2)}</TableCell>
                      <TableCell>
                        {s.hasAlert ? (
                          <span className="flex items-center gap-1 text-xs text-red-400 whitespace-nowrap">
                            <AlertTriangle className="h-3 w-3" />预警
                          </span>
                        ) : s.fbSynced ? (
                          <span className="flex items-center gap-1 text-xs text-blue-400 whitespace-nowrap">
                            <Facebook className="h-3 w-3" />FB
                          </span>
                        ) : s.status === "pending" ? (
                          <span className="flex items-center gap-1 text-xs text-amber-400 whitespace-nowrap">
                            <Clock className="h-3 w-3" />待审
                          </span>
                        ) : s.status === "rejected" ? (
                          <span className="flex items-center gap-1 text-xs text-red-400 whitespace-nowrap">
                            <XCircle className="h-3 w-3" />驳回
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-emerald-500 whitespace-nowrap">
                            <CheckCircle className="h-3 w-3" />通过
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Recent recharge orders */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">充值申请记录</h2>
            <Link href="/pitcher/recharge">
              <span className="text-xs text-primary cursor-pointer hover:underline">申请充值 →</span>
            </Link>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>账户</TableHead>
                  <TableHead className="text-right">金额</TableHead>
                  <TableHead className="w-24">申请时间</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                      暂无充值申请
                    </TableCell>
                  </TableRow>
                ) : (
                  recentOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-sm max-w-[120px] truncate" title={o.accountName}>
                        {o.accountName ?? `账户 #${o.id}`}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-right whitespace-nowrap">${Number(o.amount).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleDateString("zh-CN")}
                      </TableCell>
                      <TableCell><RechargeStatusBadge status={o.status} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
