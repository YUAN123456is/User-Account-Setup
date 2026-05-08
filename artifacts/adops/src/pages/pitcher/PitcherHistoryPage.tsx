import { useListDailyStats } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { History } from "lucide-react";

interface DailyStat {
  id: number;
  accountId: number;
  accountName?: string;
  date: string;
  spendAmount: string | number;
  realBalance: string | number;
  hasAlert: boolean;
}

export default function PitcherHistoryPage() {
  const { data, isLoading } = useListDailyStats({});
  const stats = Array.isArray(data) ? (data as DailyStat[]) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">上报记录</h1>
        <p className="text-sm text-muted-foreground mt-0.5">您提交的全部每日上报历史</p>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>日期</TableHead>
              <TableHead>账户</TableHead>
              <TableHead>消耗金额</TableHead>
              <TableHead>实际余额</TableHead>
              <TableHead>预警</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && stats.length === 0 && (
              <TableRow><TableCell colSpan={5}>
                <EmptyState icon={History} title="暂无上报记录" description="您提交的每日数据将在此显示。" />
              </TableCell></TableRow>
            )}
            {!isLoading && stats.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-sm">{s.date}</TableCell>
                <TableCell className="font-medium">{s.accountName ?? `账户 #${s.accountId}`}</TableCell>
                <TableCell className="font-mono">${Number(s.spendAmount).toFixed(2)}</TableCell>
                <TableCell className="font-mono">${Number(s.realBalance).toFixed(2)}</TableCell>
                <TableCell>
                  {s.hasAlert
                    ? <Badge variant="destructive" className="text-xs">预警</Badge>
                    : <Badge variant="outline" className="text-xs text-muted-foreground">正常</Badge>
                  }
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
