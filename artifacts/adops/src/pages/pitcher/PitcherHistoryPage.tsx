import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListDailyStats, useListAccounts, useListTeams, useUpdateDailyStat, getListDailyStatsQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/shared/DateRangePicker";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { BizBadge } from "@/components/shared/BizDisplay";
import { useToast } from "@/hooks/use-toast";
import { History, Pencil, CheckCircle, Clock, XCircle, Facebook } from "lucide-react";

interface DailyStat {
  id: number;
  accountId: number;
  accountName?: string | null;
  date: string;
  spendAmount: string | number;
  realBalance: string | number;
  hasAlert: boolean;
  businessType?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  fanCount?: number | null;
  fanCost?: string | null;
  gmv?: string | null;
  orderCount?: number | null;
  roas?: string | null;
  avgOrderValue?: string | null;
  fbSynced?: boolean;
  status?: string | null;
  reviewNote?: string | null;
}

interface Account { id: number; accountName: string; currentBalance: string; theoreticalBalance?: string | null; platform: string; }
interface Team { id: number; name: string; businessType: string; }

const PAGE_SIZE = 20;

function EditDialog({ stat, accounts, teams, onClose }: { stat: DailyStat; accounts: Account[]; teams: Team[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [spendAmount, setSpendAmount] = useState(String(Number(stat.spendAmount).toFixed(2)));
  const [businessType, setBiz] = useState(stat.businessType ?? "");
  const [teamId, setTeamId] = useState(stat.teamId ? String(stat.teamId) : "");
  const [fanCount, setFanCount] = useState(stat.fanCount ? String(stat.fanCount) : "");
  const [gmv, setGmv] = useState(stat.gmv ? String(Number(stat.gmv).toFixed(2)) : "");
  const [orderCount, setOrderCount] = useState(stat.orderCount ? String(stat.orderCount) : "");

  const liveTeams = teams.filter((t) => t.businessType === "liveChat");
  const spend = parseFloat(spendAmount) || 0;
  const fanNum = parseInt(fanCount) || 0;
  const gmvNum = parseFloat(gmv) || 0;
  const orderNum = parseInt(orderCount) || 0;
  const fanCost = businessType === "liveChat" && fanNum > 0 && spend > 0 ? (spend / fanNum).toFixed(4) : null;
  const roas = businessType === "ecommerce" && gmvNum > 0 && spend > 0 ? (gmvNum / spend).toFixed(2) : null;
  const avgOrder = businessType === "ecommerce" && gmvNum > 0 && orderNum > 0 ? (gmvNum / orderNum).toFixed(2) : null;
  const wasRejected = stat.status === "rejected";
  const acc = accounts.find((a) => a.id === stat.accountId);

  const update = useUpdateDailyStat({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });
        toast({
          title: wasRejected ? "已重新提交审核" : "修改成功",
          description: wasRejected ? "管理员确认后数据将正式生效" : undefined,
        });
        onClose();
      },
      onError: (err: unknown) => { toast({ title: (err as { data?: { error?: string } })?.data?.error ?? "修改失败", variant: "destructive" }); },
    },
  });

  const handleSave = () => {
    const sp = parseFloat(spendAmount);
    if (isNaN(sp) || sp < 0) { toast({ title: "请输入有效消耗金额", variant: "destructive" }); return; }
    update.mutate({ id: stat.id, data: {
      spendAmount: sp.toFixed(2),
      businessType: (businessType as "liveChat" | "ecommerce") || null,
      teamId: (businessType === "liveChat" && teamId) ? Number(teamId) : null,
      fanCount: businessType === "liveChat" && fanCount ? parseInt(fanCount) : null,
      gmv: businessType === "ecommerce" && gmv ? parseFloat(gmv).toFixed(2) : null,
      orderCount: businessType === "ecommerce" && orderCount ? parseInt(orderCount) : null,
    }});
  };

  const toggleBiz = (v: string) => {
    setBiz((prev) => prev === v ? "" : v);
    setTeamId(""); setFanCount(""); setGmv(""); setOrderCount("");
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-primary" />
            {wasRejected ? "修改并重新提交" : "编辑上报数据"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground mb-0.5">{stat.date}</p>
            <p className="font-medium truncate">{acc?.accountName ?? stat.accountName ?? `#${stat.accountId}`}</p>
          </div>
          {wasRejected && stat.reviewNote && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
              <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-red-400 mb-0.5">驳回原因</p>
                <p className="text-xs text-red-300">{stat.reviewNote}</p>
              </div>
            </div>
          )}
          {wasRejected && !stat.reviewNote && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">此条数据已被驳回，请修改后重新提交</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">消耗金额（美元）<span className="text-destructive">*</span></Label>
            <Input type="number" min="0" step="0.01" value={spendAmount} onChange={(e) => setSpendAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">业务类型</Label>
            <div className="flex gap-2">
              {[["liveChat", "聊单"], ["ecommerce", "独立站"]].map(([v, label]) => (
                <button key={v} onClick={() => toggleBiz(v)}
                  className={["text-xs px-3 py-1.5 rounded border transition-colors", businessType === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"].join(" ")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {businessType === "liveChat" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-sm">服务团队</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="选择团队..." /></SelectTrigger>
                  <SelectContent>{liveTeams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">进粉数量</Label>
                <Input type="number" min="0" placeholder="0" value={fanCount} onChange={(e) => setFanCount(e.target.value)} />
                {fanCost && <p className="text-xs text-muted-foreground">粉成本 <span className="font-mono text-primary">${fanCost}</span></p>}
              </div>
            </div>
          )}
          {businessType === "ecommerce" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-sm">GMV（美元）</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={gmv} onChange={(e) => setGmv(e.target.value)} />
                {roas && <p className="text-xs text-muted-foreground">ROAS <span className="font-mono text-primary">{roas}</span></p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">订单数</Label>
                <Input type="number" min="0" placeholder="0" value={orderCount} onChange={(e) => setOrderCount(e.target.value)} />
                {avgOrder && <p className="text-xs text-muted-foreground">客单价 <span className="font-mono text-primary">${avgOrder}</span></p>}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "保存中..." : wasRejected ? "修改并重新提交" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PitcherHistoryPage() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [accountFilter, setAccountFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<DailyStat | null>(null);

  const apiParams: Record<string, string> = {};
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;
  if (accountFilter !== "all") apiParams.accountId = accountFilter;

  const { data, isLoading } = useListDailyStats(apiParams);
  const { data: accountsData } = useListAccounts({});
  const { data: teamsData } = useListTeams({});
  const allStats = Array.isArray(data) ? (data as DailyStat[]) : [];
  const accounts = Array.isArray(accountsData) ? (accountsData as Account[]) : [];
  const teams = Array.isArray(teamsData) ? (teamsData as Team[]) : [];

  const filtered = useMemo(() => {
    let rows = allStats;
    if (statusFilter === "pending") rows = rows.filter((s) => s.status === "pending");
    else if (statusFilter === "approved") rows = rows.filter((s) => (!s.status || s.status === "approved") && !s.fbSynced);
    else if (statusFilter === "rejected") rows = rows.filter((s) => s.status === "rejected");
    else if (statusFilter === "fb") rows = rows.filter((s) => s.fbSynced);
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [allStats, statusFilter]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  const totalSpend = filtered.reduce((s, r) => s + Number(r.spendAmount), 0);
  const pendingCount = filtered.filter((s) => s.status === "pending").length;
  const rejectedCount = filtered.filter((s) => s.status === "rejected").length;
  const uniqueDays = new Set(filtered.map((s) => s.date)).size;

  const hasLive = filtered.some((s) => s.businessType === "liveChat");
  const hasEcom = filtered.some((s) => s.businessType === "ecommerce");
  const showBizCol = hasLive && hasEcom;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">上报记录</h1>
        <p className="text-sm text-muted-foreground mt-0.5">您提交的全部每日上报历史</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={accountFilter} onValueChange={(v) => { setAccountFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="全部账户" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部账户</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.accountName}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="approved">已通过</SelectItem>
            <SelectItem value="rejected">已驳回</SelectItem>
            <SelectItem value="fb">FB同步</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">上报日期</p>
        <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setPage(1); }} />
      </div>

      <StatsBar items={[
        { label: "总消耗", value: `$${totalSpend.toFixed(2)}`, color: "blue" },
        { label: "上报天数", value: uniqueDays },
        { label: "记录条数", value: filtered.length },
        ...(pendingCount > 0 ? [{ label: "待审核", value: pendingCount, color: "amber" as const }] : []),
        ...(rejectedCount > 0 ? [{ label: "已驳回", value: rejectedCount, color: "red" as const }] : []),
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-24">日期</TableHead>
              <TableHead>账户</TableHead>
              <TableHead className="text-right">消耗</TableHead>
              <TableHead className="text-right">余额</TableHead>
              {showBizCol && <TableHead className="w-16">业务</TableHead>}
              {hasLive && <TableHead className="text-right w-14">进粉</TableHead>}
              {hasEcom && <TableHead className="text-right w-20">GMV</TableHead>}
              <TableHead className="w-20">审核状态</TableHead>
              <TableHead className="w-14"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-20" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState icon={History} title="暂无上报记录" description="调整筛选条件或前往每日上报页面提交数据。" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && paged.map((s) => (
              <TableRow key={s.id} className={
                s.status === "rejected" ? "bg-red-50/20 dark:bg-red-900/5"
                : s.hasAlert ? "bg-red-50/30 dark:bg-red-900/10"
                : ""
              }>
                <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">{s.date}</TableCell>
                <TableCell className="font-medium max-w-[160px]">
                  <TruncatedCell value={s.accountName ?? `账户 #${s.accountId}`} />
                </TableCell>
                <TableCell className="font-mono text-sm text-right whitespace-nowrap text-orange-500">
                  ${Number(s.spendAmount).toFixed(2)}
                </TableCell>
                <TableCell className="font-mono text-right text-xs whitespace-nowrap">
                  ${Number(s.realBalance).toFixed(2)}
                </TableCell>
                {showBizCol && <TableCell>{s.businessType ? <BizBadge biz={s.businessType} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>}
                {hasLive && <TableCell className="text-right font-mono text-xs">{s.fanCount ?? "—"}</TableCell>}
                {hasEcom && <TableCell className="text-right font-mono text-xs whitespace-nowrap">{s.gmv ? `$${Number(s.gmv).toFixed(2)}` : "—"}</TableCell>}
                <TableCell>
                  {s.fbSynced ? (
                    <span className="flex items-center gap-1 text-xs text-blue-400 whitespace-nowrap"><Facebook className="h-3 w-3" />FB</span>
                  ) : s.status === "pending" ? (
                    <span className="flex items-center gap-1 text-xs text-amber-400 whitespace-nowrap"><Clock className="h-3 w-3" />待审核</span>
                  ) : s.status === "rejected" ? (
                    <span className="flex items-center gap-1 text-xs text-red-400 whitespace-nowrap" title={s.reviewNote ?? ""}><XCircle className="h-3 w-3" />已驳回</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-emerald-500 whitespace-nowrap"><CheckCircle className="h-3 w-3" />已通过</span>
                  )}
                </TableCell>
                <TableCell className="pr-3">
                  {!s.fbSynced && (
                    s.status === "rejected" ? (
                      <button onClick={() => setEditTarget(s)}
                        className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap">
                        <Pencil className="h-3 w-3" />修改
                      </button>
                    ) : (
                      <button onClick={() => setEditTarget(s)} className="text-muted-foreground hover:text-primary p-1 transition-colors block"
                        title={s.status === "pending" ? "待审核中，编辑后将重新提交审核" : "编辑"}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>

      {editTarget && (
        <EditDialog stat={editTarget} accounts={accounts} teams={teams} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}
