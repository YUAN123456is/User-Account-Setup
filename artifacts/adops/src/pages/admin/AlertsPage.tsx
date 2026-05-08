import { useState, useMemo } from "react";
import { useGetBalanceAlerts } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { CheckCircle, AlertTriangle, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertRow {
  accountId: number;
  accountName: string;
  platformAccountId: string;
  pitcherName?: string | null;
  theoreticalBalance: string | number;
  reportedBalance: string | number;
  discrepancyPct: number;
  lastReportedAt?: string;
}

const PAGE_SIZE = 20;

export default function AlertsPage() {
  const [search, setSearch] = useState("");
  const [thresholdFilter, setThresholdFilter] = useState("5");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGetBalanceAlerts();
  const allRows = Array.isArray(data) ? (data as unknown as AlertRow[]) : [];

  const filtered = useMemo(() => {
    let rows = allRows.filter((r) => r.discrepancyPct >= Number(thresholdFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.accountName.toLowerCase().includes(q) ||
        r.platformAccountId.toLowerCase().includes(q) ||
        (r.pitcherName ?? "").toLowerCase().includes(q)
      );
    }
    return rows.sort((a, b) => b.discrepancyPct - a.discrepancyPct);
  }, [allRows, search, thresholdFilter]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  const criticalCount = filtered.filter((r) => r.discrepancyPct > 20).length;
  const avgDiscrepancy = filtered.length > 0 ? filtered.reduce((s, r) => s + r.discrepancyPct, 0) / filtered.length : 0;
  const maxDiscrepancy = filtered.length > 0 ? Math.max(...filtered.map((r) => r.discrepancyPct)) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">余额预警</h1>
        <p className="text-sm text-muted-foreground mt-0.5">上报余额与理论余额偏差超出阈值的账户</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-56 text-sm" placeholder="搜索账户名称或投手..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={thresholdFilter} onValueChange={(v) => { setThresholdFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="5">偏差 &gt; 5%</SelectItem>
            <SelectItem value="10">偏差 &gt; 10%</SelectItem>
            <SelectItem value="20">偏差 &gt; 20%</SelectItem>
            <SelectItem value="50">偏差 &gt; 50%</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <StatsBar items={[
        { label: "预警账户数", value: filtered.length, color: filtered.length > 0 ? "amber" : "default" },
        { label: "严重预警（>20%）", value: criticalCount, color: criticalCount > 0 ? "red" : "default" },
        { label: "平均偏差", value: filtered.length > 0 ? `${avgDiscrepancy.toFixed(1)}%` : "—", color: avgDiscrepancy > 10 ? "red" : avgDiscrepancy > 5 ? "amber" : "default" },
        { label: "最高偏差", value: filtered.length > 0 ? `${maxDiscrepancy.toFixed(1)}%` : "—", color: maxDiscrepancy > 20 ? "red" : maxDiscrepancy > 10 ? "amber" : "default" },
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>账户名称</TableHead>
              <TableHead>平台账户ID</TableHead>
              <TableHead>投手</TableHead>
              <TableHead>理论余额</TableHead>
              <TableHead>上报余额</TableHead>
              <TableHead>偏差比例</TableHead>
              <TableHead>最近上报</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={7}><EmptyState icon={CheckCircle} title="无预警" description="所有账户余额均在正常范围内。" /></TableCell></TableRow>
            )}
            {!isLoading && paged.map((r) => {
              const isCritical = r.discrepancyPct > 20;
              return (
                <TableRow key={r.accountId} className={cn(isCritical && "bg-destructive/5")}>
                  <TableCell className="font-medium">{r.accountName}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{r.platformAccountId}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.pitcherName ?? "—"}</TableCell>
                  <TableCell className="font-mono">${Number(r.theoreticalBalance).toFixed(2)}</TableCell>
                  <TableCell className="font-mono">${Number(r.reportedBalance).toFixed(2)}</TableCell>
                  <TableCell>
                    <div className={cn("flex items-center gap-1.5 font-semibold text-sm", isCritical ? "text-destructive" : "text-amber-600")}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {r.discrepancyPct.toFixed(1)}%
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.lastReportedAt ? new Date(r.lastReportedAt).toLocaleDateString("zh-CN") : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
