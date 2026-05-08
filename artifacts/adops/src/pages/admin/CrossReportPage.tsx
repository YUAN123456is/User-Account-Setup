import { useGetCrossReport, useListUsers } from "@workspace/api-client-react";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { BarChart3 } from "lucide-react";

interface CrossRow {
  pitcherId: number;
  pitcherName: string;
  providerId: number;
  providerName: string;
  totalSpend: string | number;
  accountCount: number;
}

interface UserRow { id: number; displayName: string; role: string; }

export default function CrossReportPage() {
  const [pitcherFilter, setPitcherFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");

  const params: Record<string, string> = {};
  if (pitcherFilter !== "all") params.pitcherId = pitcherFilter;
  if (providerFilter !== "all") params.providerId = providerFilter;

  const { data, isLoading } = useGetCrossReport(params);
  const { data: usersData } = useListUsers({});
  const rows = Array.isArray(data) ? (data as CrossRow[]) : [];
  const users = Array.isArray(usersData) ? (usersData as UserRow[]) : [];
  const pitchers = users.filter((u) => u.role === "pitcher");
  const providers = users.filter((u) => u.role === "provider");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">交叉报表</h1>
          <p className="text-sm text-muted-foreground mt-0.5">投手 × 开户商消耗矩阵</p>
        </div>
        <div className="flex gap-2">
          <Select value={pitcherFilter} onValueChange={setPitcherFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="全部投手" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部投手</SelectItem>
              {pitchers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="全部开户商" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部开户商</SelectItem>
              {providers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>投手</TableHead>
              <TableHead>开户商</TableHead>
              <TableHead>累计消耗</TableHead>
              <TableHead>账户数</TableHead>
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
                <EmptyState icon={BarChart3} title="暂无数据" description="上报每日数据后将在此显示交叉报表。" />
              </TableCell></TableRow>
            )}
            {!isLoading && rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.pitcherName}</TableCell>
                <TableCell>{r.providerName}</TableCell>
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
