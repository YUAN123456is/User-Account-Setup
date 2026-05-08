import { useState } from "react";
import { useGetSpendByPitcher } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { BarChart3 } from "lucide-react";

interface PitcherSpend {
  pitcherId: number;
  pitcherName: string;
  todaySpend: string | number;
  totalSpend: string | number;
  accountCount: number;
}

const PAGE_SIZE = 20;

export default function PitcherReportPage() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);

  const params: Record<string, string> = {};
  if (dateRange.from) params.dateFrom = dateRange.from;
  if (dateRange.to) params.dateTo = dateRange.to;

  const { data, isLoading } = useGetSpendByPitcher(params);
  const rows = Array.isArray(data) ? (data as PitcherSpend[]) : [];
  const paged = usePagination(rows, PAGE_SIZE, page);

  const hasFilter = dateRange.from || dateRange.to;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">投手报表</h1>
        <p className="text-sm text-muted-foreground mt-0.5">按投手统计消耗数据</p>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">统计时间范围</p>
        <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setPage(1); }} />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>投手名称</TableHead>
              <TableHead>今日消耗</TableHead>
              <TableHead>{hasFilter ? "期间消耗" : "累计消耗"}</TableHead>
              <TableHead>账户数量</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 4 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={4}><EmptyState icon={BarChart3} title="暂无数据" description="投手上报每日数据后将在此显示。" /></TableCell></TableRow>
            )}
            {!isLoading && paged.map((r) => (
              <TableRow key={r.pitcherId}>
                <TableCell className="font-medium">{r.pitcherName}</TableCell>
                <TableCell className="font-mono">${Number(r.todaySpend).toFixed(2)}</TableCell>
                <TableCell className="font-mono">${Number(r.totalSpend).toFixed(2)}</TableCell>
                <TableCell>{r.accountCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
