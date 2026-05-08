import { useState, useMemo } from "react";
import { useGetLowBalanceAlerts, useGetOverdueAlerts } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { CheckCircle, AlertTriangle, Clock, Search } from "lucide-react";
import { PlatformBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";

interface LowBalanceAlert {
  accountId: number;
  accountName: string;
  platformAccountId: string;
  platform: string;
  pitcherName?: string | null;
  providerName?: string | null;
  currentBalance: string | number;
  lastReportedAt?: string | null;
}

interface OverdueAlert {
  accountId: number;
  accountName: string;
  platformAccountId: string;
  platform: string;
  pitcherName?: string | null;
  providerName?: string | null;
  currentBalance: string | number;
  lastReportedAt?: string | null;
  daysSinceReport: number;
}

const PAGE_SIZE = 20;

type Tab = "low-balance" | "overdue";

export default function AlertsPage() {
  const [tab, setTab] = useState<Tab>("low-balance");
  const [search, setSearch] = useState("");
  const [balThreshold, setBalThreshold] = useState("100");
  const [overdueDays, setOverdueDays] = useState("3");
  const [page, setPage] = useState(1);

  const { data: lowBalData, isLoading: loadingLow } = useGetLowBalanceAlerts({ threshold: Number(balThreshold) });
  const { data: overdueData, isLoading: loadingOverdue } = useGetOverdueAlerts({ days: Number(overdueDays) });

  const lowRows = Array.isArray(lowBalData) ? (lowBalData as LowBalanceAlert[]) : [];
  const overdueRows = Array.isArray(overdueData) ? (overdueData as OverdueAlert[]) : [];

  const filteredLow = useMemo(() => {
    if (!search.trim()) return lowRows;
    const q = search.toLowerCase();
    return lowRows.filter((r) =>
      r.accountName.toLowerCase().includes(q) ||
      r.platformAccountId.toLowerCase().includes(q) ||
      (r.pitcherName ?? "").toLowerCase().includes(q) ||
      (r.providerName ?? "").toLowerCase().includes(q)
    );
  }, [lowRows, search]);

  const filteredOverdue = useMemo(() => {
    if (!search.trim()) return overdueRows;
    const q = search.toLowerCase();
    return overdueRows.filter((r) =>
      r.accountName.toLowerCase().includes(q) ||
      r.platformAccountId.toLowerCase().includes(q) ||
      (r.pitcherName ?? "").toLowerCase().includes(q)
    );
  }, [overdueRows, search]);

  const activeRows = tab === "low-balance" ? filteredLow : filteredOverdue;
  const paged = usePagination(activeRows, PAGE_SIZE, page);
  const isLoading = tab === "low-balance" ? loadingLow : loadingOverdue;

  const criticalLow = filteredLow.filter((r) => Number(r.currentBalance) < 50).length;
  const criticalOverdue = filteredOverdue.filter((r) => r.daysSinceReport >= 7).length;
  const avgBalance = filteredLow.length > 0
    ? filteredLow.reduce((s, r) => s + Number(r.currentBalance), 0) / filteredLow.length
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">余额预警</h1>
        <p className="text-sm text-muted-foreground mt-0.5">低余额账户与超期未上报监控</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => { setTab("low-balance"); setPage(1); }}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
            tab === "low-balance"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          低余额预警
          {lowRows.length > 0 && (
            <span className="ml-1 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
              {lowRows.length}
            </span>
          )}
        </button>
        <button
          onClick={() => { setTab("overdue"); setPage(1); }}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
            tab === "overdue"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          超期未上报
          {overdueRows.length > 0 && (
            <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
              {overdueRows.length}
            </span>
          )}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-8 w-56 text-sm"
            placeholder="搜索账户名称或投手..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        {tab === "low-balance" && (
          <Select value={balThreshold} onValueChange={(v) => { setBalThreshold(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="50">余额 &lt; $50</SelectItem>
              <SelectItem value="100">余额 &lt; $100</SelectItem>
              <SelectItem value="200">余额 &lt; $200</SelectItem>
              <SelectItem value="500">余额 &lt; $500</SelectItem>
            </SelectContent>
          </Select>
        )}
        {tab === "overdue" && (
          <Select value={overdueDays} onValueChange={(v) => { setOverdueDays(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">超过 1 天未上报</SelectItem>
              <SelectItem value="3">超过 3 天未上报</SelectItem>
              <SelectItem value="7">超过 7 天未上报</SelectItem>
              <SelectItem value="14">超过 14 天未上报</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Stats */}
      {tab === "low-balance" && (
        <StatsBar items={[
          { label: "低余额账户", value: filteredLow.length, color: filteredLow.length > 0 ? "amber" : "default" },
          { label: `严重不足（< $50）`, value: criticalLow, color: criticalLow > 0 ? "red" : "default" },
          { label: "平均余额", value: filteredLow.length > 0 ? `$${avgBalance.toFixed(2)}` : "—" },
          { label: "阈值", value: `$${balThreshold}` },
        ]} />
      )}
      {tab === "overdue" && (
        <StatsBar items={[
          { label: "超期未上报账户", value: filteredOverdue.length, color: filteredOverdue.length > 0 ? "red" : "default" },
          { label: "超 7 天", value: criticalOverdue, color: criticalOverdue > 0 ? "red" : "default" },
          { label: "监控阈值", value: `${overdueDays} 天` },
        ]} />
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        {tab === "low-balance" ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>账户名称</TableHead>
                <TableHead>平台账户ID</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>当前余额</TableHead>
                <TableHead>绑定投手</TableHead>
                <TableHead>开户商</TableHead>
                <TableHead>最近上报</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => (
                  <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
                ))}</TableRow>
              ))}
              {!isLoading && paged.length === 0 && (
                <TableRow><TableCell colSpan={7}><EmptyState icon={CheckCircle} title="无低余额预警" description={`所有账户余额均高于 $${balThreshold}。`} /></TableCell></TableRow>
              )}
              {!isLoading && (paged as LowBalanceAlert[]).map((r) => {
                const isCritical = Number(r.currentBalance) < 50;
                return (
                  <TableRow key={r.accountId} className={cn(isCritical && "bg-destructive/5")}>
                    <TableCell className="font-medium">{r.accountName}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{r.platformAccountId}</TableCell>
                    <TableCell><PlatformBadge platform={r.platform} /></TableCell>
                    <TableCell>
                      <div className={cn("flex items-center gap-1.5 font-mono font-bold", isCritical ? "text-destructive" : "text-amber-600")}>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        ${Number(r.currentBalance).toFixed(2)}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.pitcherName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.providerName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.lastReportedAt ? new Date(r.lastReportedAt).toLocaleDateString("zh-CN") : "从未"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>账户名称</TableHead>
                <TableHead>平台账户ID</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>当前余额</TableHead>
                <TableHead>绑定投手</TableHead>
                <TableHead>开户商</TableHead>
                <TableHead>最近上报</TableHead>
                <TableHead>未上报天数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => (
                  <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
                ))}</TableRow>
              ))}
              {!isLoading && paged.length === 0 && (
                <TableRow><TableCell colSpan={8}><EmptyState icon={CheckCircle} title="无超期预警" description={`所有账户均在 ${overdueDays} 天内有上报记录。`} /></TableCell></TableRow>
              )}
              {!isLoading && (paged as OverdueAlert[]).map((r) => {
                const isCritical = r.daysSinceReport >= 7;
                return (
                  <TableRow key={r.accountId} className={cn(isCritical && "bg-destructive/5")}>
                    <TableCell className="font-medium">{r.accountName}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{r.platformAccountId}</TableCell>
                    <TableCell><PlatformBadge platform={r.platform} /></TableCell>
                    <TableCell className="font-mono">${Number(r.currentBalance).toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.pitcherName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.providerName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.lastReportedAt ? new Date(r.lastReportedAt).toLocaleDateString("zh-CN") : "从未上报"}
                    </TableCell>
                    <TableCell>
                      <div className={cn("flex items-center gap-1.5 font-semibold text-sm", isCritical ? "text-destructive" : "text-amber-600")}>
                        <Clock className="h-3.5 w-3.5" />
                        {r.daysSinceReport >= 999 ? "从未" : `${r.daysSinceReport} 天`}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <TablePagination page={page} pageSize={PAGE_SIZE} total={activeRows.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
