import { useGetBalanceAlerts } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertRow {
  accountId: number;
  accountName: string;
  platformAccountId: string;
  pitcherName?: string | null;
  theoreticalBalance: string | number;
  reportedBalance: string | number;
  discrepancyPct: number;
}

export default function AlertsPage() {
  const { data, isLoading } = useGetBalanceAlerts();
  const rows = Array.isArray(data) ? (data as unknown as AlertRow[]) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">余额预警</h1>
        <p className="text-sm text-muted-foreground mt-0.5">上报余额与理论余额偏差超过 5% 的账户</p>
      </div>

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6}>
                <EmptyState
                  icon={CheckCircle}
                  title="无预警"
                  description="所有账户余额均在正常范围内。"
                />
              </TableCell></TableRow>
            )}
            {!isLoading && rows.map((r) => {
              const isCritical = r.discrepancyPct > 10;
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
