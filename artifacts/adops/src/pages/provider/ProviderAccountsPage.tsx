import { useListAccounts } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountStatusBadge, PlatformBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { CreditCard } from "lucide-react";

interface Account {
  id: number;
  platformAccountId: string;
  accountName: string;
  platform: string;
  status: "idle" | "active" | "banned";
  currentBalance: string;
  lastReportedAt?: string | null;
}

export default function ProviderAccountsPage() {
  const { data, isLoading } = useListAccounts({});
  const accounts = Array.isArray(data) ? (data as unknown as Account[]) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">我的账户</h1>
        <p className="text-sm text-muted-foreground mt-0.5">您名下的广告账户列表</p>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>账户名称</TableHead>
              <TableHead>平台账户ID</TableHead>
              <TableHead>平台</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>余额</TableHead>
              <TableHead>最近上报</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && accounts.length === 0 && (
              <TableRow><TableCell colSpan={6}>
                <EmptyState icon={CreditCard} title="暂无账户" description="请联系管理员分配广告账户。" />
              </TableCell></TableRow>
            )}
            {!isLoading && accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.accountName}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">{a.platformAccountId}</TableCell>
                <TableCell><PlatformBadge platform={a.platform} /></TableCell>
                <TableCell><AccountStatusBadge status={a.status} /></TableCell>
                <TableCell className="font-mono">${Number(a.currentBalance).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {a.lastReportedAt ? new Date(a.lastReportedAt).toLocaleDateString("zh-CN") : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
