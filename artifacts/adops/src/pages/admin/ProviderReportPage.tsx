import { useGetSpendByProvider } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { BarChart3 } from "lucide-react";

interface ProviderSpend {
  providerId: number;
  providerName: string;
  todaySpend: string | number;
  totalSpend: string | number;
  accountCount: number;
}

export default function ProviderReportPage() {
  const { data, isLoading } = useGetSpendByProvider({});
  const rows = Array.isArray(data) ? (data as ProviderSpend[]) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">开户商报表</h1>
        <p className="text-sm text-muted-foreground mt-0.5">按开户商统计消耗数据</p>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>开户商名称</TableHead>
              <TableHead>今日消耗</TableHead>
              <TableHead>累计消耗</TableHead>
              <TableHead>账户数量</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 4 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={4}>
                <EmptyState icon={BarChart3} title="暂无数据" description="投手上报每日数据后将在此显示。" />
              </TableCell></TableRow>
            )}
            {!isLoading && rows.map((r) => (
              <TableRow key={r.providerId}>
                <TableCell className="font-medium">{r.providerName}</TableCell>
                <TableCell className="font-mono">${Number(r.todaySpend).toFixed(2)}</TableCell>
                <TableCell className="font-mono">${Number(r.totalSpend).toFixed(2)}</TableCell>
                <TableCell>{r.accountCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
