import { useState, useMemo, Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListDailyStats, useListTeams, useUpdateDailyStat, getListDailyStatsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/EmptyState";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { QuickDateFilter, type DateRange } from "@/components/shared/QuickDateFilter";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Search, ChevronsUpDown, ChevronUp, ChevronDown, ChevronRight, Facebook, EyeOff, Trash2, Loader2, Clock, XCircle, CheckCircle, Users, Pencil, Info, X, UserPlus } from "lucide-react";
import { BizBadge } from "@/components/shared/BizDisplay";
import { cn } from "@/lib/utils";

interface TeamBreakdown {
  teamId: number;
  teamName: string;
  fanCount: number | null;
}

interface DailyStat {
  id: number;
  accountId: number;
  accountName?: string | null;
  date: string;
  spendAmount: string | number;
  pitcherName?: string | null;
  businessType?: string | null;
  teamBreakdowns?: TeamBreakdown[] | null;
  fanCount?: number | null;
  fanCost?: string | null;
  gmv?: string | null;
  orderCount?: number | null;
  roas?: string | null;
  avgOrderValue?: string | null;
  fbSynced?: boolean;
  status?: string | null;
}

interface Team { id: number; name: string; businessType: string; }

interface TeamSubRow { key: string; teamId: string; fanCount: string; }
function newSubRow(): TeamSubRow { return { key: Math.random().toString(36).slice(2), teamId: "", fanCount: "" }; }

const PAGE_SIZE = 30;

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function MetaEditDialog({ stat, teams, onClose }: { stat: DailyStat; teams: Team[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [biz, setBiz] = useState(stat.businessType ?? "");
  const [fanCount, setFanCount] = useState(stat.fanCount ? String(stat.fanCount) : "");
  const [gmv, setGmv] = useState(stat.gmv ? String(Number(stat.gmv).toFixed(2)) : "");
  const [orderCount, setOrderCount] = useState(stat.orderCount ? String(stat.orderCount) : "");
  const [rows, setRows] = useState<TeamSubRow[]>(() =>
    stat.teamBreakdowns && stat.teamBreakdowns.length > 0
      ? stat.teamBreakdowns.map((tb) => ({ key: Math.random().toString(36).slice(2), teamId: String(tb.teamId), fanCount: tb.fanCount != null ? String(tb.fanCount) : "" }))
      : [newSubRow()]
  );

  const liveTeams = teams.filter((t) => t.businessType === "liveChat");

  const update = useUpdateDailyStat({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey() });
        toast({ title: "修改成功" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "修改失败";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const handleSave = () => {
    const validRows = rows.filter((r) => r.teamId);
    const teamBreakdowns = biz === "liveChat" && validRows.length > 0
      ? validRows.map((r) => ({ teamId: Number(r.teamId), teamName: teams.find((t) => t.id === Number(r.teamId))?.name ?? "", fanCount: r.fanCount ? parseInt(r.fanCount) : null }))
      : null;
    const teamFanSum = teamBreakdowns ? teamBreakdowns.reduce((s, t) => s + (t.fanCount ?? 0), 0) : 0;
    const derivedFanCount = teamBreakdowns
      ? (teamFanSum > 0 ? teamFanSum : (biz === "liveChat" && fanCount ? parseInt(fanCount) : null))
      : (biz === "liveChat" && fanCount ? parseInt(fanCount) : null);
    update.mutate({
      id: stat.id,
      data: {
        businessType: (biz as "liveChat" | "ecommerce") || null,
        teamBreakdowns: teamBreakdowns as { teamId: number; teamName: string; fanCount?: number | null }[] | null,
        fanCount: derivedFanCount,
        gmv: biz === "ecommerce" && gmv ? parseFloat(gmv).toFixed(2) : null,
        orderCount: biz === "ecommerce" && orderCount ? parseInt(orderCount) : null,
      },
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-primary" />
            编辑业务信息
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground mb-0.5">{stat.date} · {stat.pitcherName ?? "—"}</p>
            <p className="font-medium truncate">{stat.accountName ?? `#${stat.accountId}`}</p>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">${Number(stat.spendAmount).toFixed(2)} 消耗</p>
          </div>
          {stat.fbSynced && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
              <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-400">FB 自动同步数据，消耗由 FB 管理，此处可补充业务类型与团队信息。</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">业务类型</Label>
            <div className="flex gap-2">
              {([["liveChat", "聊单"], ["ecommerce", "独立站"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => { setBiz((prev) => { const next = prev === v ? "" : v; setFanCount(""); setGmv(""); setOrderCount(""); if (next === "liveChat" && stat.teamBreakdowns && stat.teamBreakdowns.length > 0) { setRows(stat.teamBreakdowns.map((tb) => ({ key: Math.random().toString(36).slice(2), teamId: String(tb.teamId), fanCount: tb.fanCount != null ? String(tb.fanCount) : "" }))); } else { setRows([newSubRow()]); } return next; }); }}
                  className={["text-xs px-3 py-1.5 rounded border transition-colors", biz === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"].join(" ")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {biz === "liveChat" && (
            <div className="space-y-2">
              <Label className="text-sm">服务团队与进粉</Label>
              {rows.map((row, si) => (
                <div key={row.key} className="flex items-center gap-2">
                  {rows.length > 1 && <span className="text-xs text-muted-foreground w-4 shrink-0">{si + 1}.</span>}
                  <Select value={row.teamId} onValueChange={(v) => setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, teamId: v } : r))}>
                    <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue placeholder="选择团队..." /></SelectTrigger>
                    <SelectContent>{liveTeams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" min="0" placeholder="进粉" className="h-7 text-xs w-24 shrink-0"
                    value={row.fanCount} onChange={(e) => setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, fanCount: e.target.value } : r))} />
                  {rows.length > 1 && (
                    <button onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))} className="text-muted-foreground hover:text-destructive shrink-0 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setRows((prev) => [...prev, newSubRow()])}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                <UserPlus className="h-3 w-3" /> 添加另一个团队
              </button>
            </div>
          )}
          {biz === "ecommerce" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-sm">GMV（美元）</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={gmv} onChange={(e) => setGmv(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">订单数</Label>
                <Input type="number" min="0" placeholder="0" value={orderCount} onChange={(e) => setOrderCount(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={update.isPending}>{update.isPending ? "保存中..." : "保存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OpsReportPage() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [teamFilter, setTeamFilter] = useState("all");
  const [pitcherFilter, setPitcherFilter] = useState("all");
  const [bizFilter, setBizFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hideZero, setHideZero] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "pending" | "rejected">("all");

  const [editTarget, setEditTarget] = useState<DailyStat | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DailyStat | null>(null);
  const [deleteTargetSpend, setDeleteTargetSpend] = useState<number>(0);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toggleExpand = (id: number) => setExpandedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${BASE}/api/daily-stats/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        toast({ title: data.error ?? "删除失败", variant: "destructive" });
        return;
      }
      toast({ title: "已删除", description: `${deleteTarget.date} · ${deleteTarget.accountName ?? `#${deleteTarget.accountId}`}` });
      await queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey() });
      setDeleteTarget(null);
      setDeletePassword("");
    } finally {
      setDeleting(false);
    }
  }

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  const apiParams: Record<string, string> = {};
  if (dateRange.from) apiParams.dateFrom = dateRange.from;
  if (dateRange.to) apiParams.dateTo = dateRange.to;

  const { data: statsData, isLoading } = useListDailyStats(apiParams);
  const { data: teamsData } = useListTeams({});

  const allStats = useMemo(() => Array.isArray(statsData) ? (statsData as DailyStat[]) : [], [statsData]);
  const teams = useMemo(() => Array.isArray(teamsData) ? (teamsData as Team[]) : [], [teamsData]);
  const liveChatTeams = teams.filter((t) => t.businessType === "liveChat");

  const pitcherNames = useMemo(() => {
    const names = new Set<string>();
    allStats.forEach((s) => { if (s.pitcherName) names.add(s.pitcherName); });
    return Array.from(names).sort();
  }, [allStats]);

  const hasLiveInAll = allStats.some((s) => s.businessType === "liveChat");
  const hasEcomInAll = allStats.some((s) => s.businessType === "ecommerce");

  // Filter stats directly — each DailyStat is one row (no grouping needed)
  const filteredStats = useMemo((): DailyStat[] => {
    let stats = [...allStats];

    // Status filter
    if (statusFilter === "approved") stats = stats.filter((s) => s.status === "approved" || !!s.fbSynced);
    else if (statusFilter === "pending") stats = stats.filter((s) => s.status === "pending" && !s.fbSynced);
    else if (statusFilter === "rejected") stats = stats.filter((s) => s.status === "rejected");
    else stats = stats.filter((s) => s.status !== "rejected");

    // hideZero
    if (hideZero) stats = stats.filter((s) => Number(s.spendAmount) > 0 || (s.teamBreakdowns?.length ?? 0) > 0);

    // Business type filter
    if (bizFilter === "liveChat") stats = stats.filter((s) => s.businessType === "liveChat");
    else if (bizFilter === "ecommerce") stats = stats.filter((s) => s.businessType === "ecommerce");
    else if (bizFilter === "fb") stats = stats.filter((s) => !!s.fbSynced);

    // Team filter: check teamBreakdowns array
    if (teamFilter !== "all") {
      stats = stats.filter((s) =>
        (s.teamBreakdowns ?? []).some((t) => String(t.teamId) === teamFilter)
      );
    }

    // Pitcher filter
    if (pitcherFilter !== "all") stats = stats.filter((s) => s.pitcherName === pitcherFilter);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      stats = stats.filter((s) => (s.accountName ?? "").toLowerCase().includes(q));
    }

    return stats;
  }, [allStats, hideZero, bizFilter, teamFilter, pitcherFilter, search, statusFilter]);

  // Sort
  const sortedStats = useMemo(() => {
    return [...filteredStats].sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortKey === "spendAmount") { va = Number(a.spendAmount); vb = Number(b.spendAmount); }
      else if (sortKey === "fanCount") { va = a.fanCount ?? 0; vb = b.fanCount ?? 0; }
      else if (sortKey === "date") { va = a.date; vb = b.date; }
      else if (sortKey === "accountName") { va = a.accountName ?? ""; vb = b.accountName ?? ""; }
      else if (sortKey === "pitcherName") { va = a.pitcherName ?? ""; vb = b.pitcherName ?? ""; }
      else if (sortKey === "gmv") { va = Number(a.gmv ?? 0); vb = Number(b.gmv ?? 0); }
      else if (sortKey === "roas") { va = Number(a.roas ?? 0); vb = Number(b.roas ?? 0); }
      else if (sortKey === "orderCount") { va = a.orderCount ?? 0; vb = b.orderCount ?? 0; }
      else { va = 0; vb = 0; }
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [filteredStats, sortKey, sortDir]);

  const pagedStats = usePagination(sortedStats, PAGE_SIZE, page);

  // Summary stats
  const approvedStats = filteredStats.filter((s) => s.status === "approved" || !!s.fbSynced);
  const liveChatApproved = approvedStats.filter((s) => s.businessType === "liveChat");
  const ecomApproved = approvedStats.filter((s) => s.businessType === "ecommerce");
  const totalSpend = approvedStats.reduce((s, st) => s + Number(st.spendAmount), 0);
  const totalFans = liveChatApproved.reduce((s, st) => s + (st.fanCount ?? 0), 0);
  const liveChatSpend = liveChatApproved.reduce((s, st) => s + Number(st.spendAmount), 0);
  const avgFanCost = totalFans > 0 ? liveChatSpend / totalFans : 0;
  const totalGmv = ecomApproved.reduce((s, st) => s + Number(st.gmv ?? 0), 0);
  const totalOrders = ecomApproved.reduce((s, st) => s + (st.orderCount ?? 0), 0);
  const ecomSpend = ecomApproved.reduce((s, st) => s + Number(st.spendAmount), 0);
  const overallRoas = ecomSpend > 0 && totalGmv > 0 ? totalGmv / ecomSpend : 0;

  const hasLive = filteredStats.some((s) => s.businessType === "liveChat");
  const hasEcom = filteredStats.some((s) => s.businessType === "ecommerce");
  const hasBizAny = filteredStats.some((s) => s.businessType != null);

  const SortHead = ({ col, label, className, right }: { col: string; label: string; className?: string; right?: boolean }) => {
    const icon = sortKey === col
      ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />)
      : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-25" />;
    return (
      <TableHead
        className={`cursor-pointer select-none whitespace-nowrap hover:bg-muted/60 transition-colors ${className ?? ""}`}
        onClick={() => handleSort(col)}
      >
        <span className={`inline-flex items-center gap-1${right ? " w-full justify-end" : ""}`}>
          {right && icon}{label}{!right && icon}
        </span>
      </TableHead>
    );
  };

  const colCount = 7 + (hasBizAny ? 1 : 0) + (hasLive ? 3 : 0) + (hasEcom ? 4 : 0);

  return (
    <div className="space-y-4">

      {/* Meta edit dialog */}
      {editTarget && <MetaEditDialog stat={editTarget} teams={teams} onClose={() => setEditTarget(null)} />}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <Dialog open onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeletePassword(""); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base text-destructive">
                <Trash2 className="h-4 w-4" /> 删除消耗记录
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm space-y-0.5">
                <p className="text-xs text-muted-foreground">{deleteTarget.date}</p>
                <p className="font-medium truncate">{deleteTarget.accountName ?? `#${deleteTarget.accountId}`}</p>
                <p className="font-mono text-primary font-semibold">${deleteTargetSpend.toFixed(2)}</p>
              </div>
              <p className="text-xs text-muted-foreground">删除后该记录的消耗将从账户余额中还原，此操作不可撤销。</p>
              <div className="space-y-1.5">
                <Label className="text-sm">管理员密码</Label>
                <Input
                  type="password"
                  placeholder="请输入密码确认删除"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && deletePassword) confirmDelete(); }}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeletePassword(""); }}>取消</Button>
              <Button variant="destructive" disabled={!deletePassword || deleting} onClick={confirmDelete}>
                {deleting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />删除中</> : "确认删除"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-48 text-sm" placeholder="搜索账户名称..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>

        {pitcherNames.length > 0 && (
          <Select value={pitcherFilter} onValueChange={(v) => { setPitcherFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="全部投手" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部投手</SelectItem>
              {pitcherNames.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(hasLiveInAll || hasEcomInAll) && (
          <Select value={bizFilter} onValueChange={(v) => { setBizFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="全部业务" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部业务</SelectItem>
              {hasLiveInAll && <SelectItem value="liveChat">聊单</SelectItem>}
              {hasEcomInAll && <SelectItem value="ecommerce">独立站</SelectItem>}
              <SelectItem value="fb">仅 FB 同步</SelectItem>
            </SelectContent>
          </Select>
        )}

        {hasLive && liveChatTeams.length > 0 && (
          <Select value={teamFilter} onValueChange={(v) => { setTeamFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="全部团队" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部团队</SelectItem>
              {liveChatTeams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="approved">已审核</SelectItem>
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="rejected">已驳回</SelectItem>
          </SelectContent>
        </Select>

        <button
          onClick={() => { setHideZero((v) => !v); setPage(1); }}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs transition-colors",
            hideZero
              ? "bg-muted border-border text-muted-foreground hover:text-foreground"
              : "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20",
          )}
        >
          <EyeOff className="h-3.5 w-3.5" />
          {hideZero ? "已隐藏零消耗" : "显示零消耗"}
        </button>

        {(search || pitcherFilter !== "all" || teamFilter !== "all" || bizFilter !== "all" || statusFilter !== "all") && (
          <button
            onClick={() => { setSearch(""); setPitcherFilter("all"); setTeamFilter("all"); setBizFilter("all"); setStatusFilter("all"); setPage(1); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            清除筛选
          </button>
        )}

        <div className="ml-auto">
          <QuickDateFilter onChange={(r) => { setDateRange(r); setPage(1); }} />
        </div>
      </div>

      <StatsBar items={[
        { label: "记录条数", value: filteredStats.length },
        { label: "已审核消耗", value: `$${totalSpend.toFixed(2)}`, color: "blue" },
        ...(liveChatApproved.length > 0 ? [
          { label: "聊单进粉", value: totalFans, color: "purple" as const },
          { label: "平均粉成本", value: totalFans > 0 ? `$${avgFanCost.toFixed(4)}` : "—", color: "amber" as const },
        ] : []),
        ...(ecomApproved.length > 0 ? [
          { label: "独立站 GMV", value: `$${totalGmv.toFixed(2)}`, color: "green" as const },
          { label: "总订单", value: totalOrders },
          { label: "ROAS", value: overallRoas > 0 ? overallRoas.toFixed(2) : "—", color: "green" as const },
        ] : []),
      ]} />

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-6" />
                <SortHead col="date" label="日期" className="min-w-[88px]" />
                <SortHead col="accountName" label="账户" className="min-w-[160px]" />
                <SortHead col="pitcherName" label="投手" className="min-w-[80px]" />
                <SortHead col="spendAmount" label="总消耗" className="min-w-[90px] text-right" right />
                <TableHead className="min-w-[72px] whitespace-nowrap">状态</TableHead>
                {hasBizAny && <TableHead className="min-w-[68px]">业务</TableHead>}
                {hasLive && <TableHead className="min-w-[100px]">团队</TableHead>}
                {hasLive && <SortHead col="fanCount" label="进粉" className="min-w-[60px] text-right" right />}
                {hasLive && <TableHead className="min-w-[80px] text-right">粉成本</TableHead>}
                {hasEcom && <SortHead col="gmv" label="GMV" className="min-w-[90px] text-right" right />}
                {hasEcom && <SortHead col="roas" label="ROAS" className="min-w-[64px] text-right" right />}
                {hasEcom && <SortHead col="orderCount" label="订单" className="min-w-[56px] text-right" right />}
                {hasEcom && <TableHead className="min-w-[80px] text-right">客单</TableHead>}
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: colCount }).map((__, j) => (
                  <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-full" /></TableCell>
                ))}</TableRow>
              ))}
              {!isLoading && allStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colCount}>
                    <EmptyState icon={TrendingUp} title="暂无消耗记录" description="投手上报每日消耗数据后将在此展示。" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && allStats.length > 0 && pagedStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colCount}>
                    <EmptyState icon={TrendingUp} title="暂无符合条件的数据" description="调整筛选条件后重试。" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && pagedStats.map((s, idx) => {
                const isExpanded = expandedIds.has(s.id);
                const tbs = s.teamBreakdowns ?? [];
                const hasTeams = tbs.length > 1;
                const singleTeam = tbs.length === 1 ? tbs[0] : null;
                const isRejected = s.status === "rejected";
                return (
                  <Fragment key={s.id}>
                    <TableRow className={cn(idx % 2 === 1 && "bg-muted/20", isRejected && "opacity-50")}>
                      <TableCell className="py-3 px-1 w-6">
                        {hasTeams ? (
                          <button onClick={() => toggleExpand(s.id)}
                            className="text-muted-foreground hover:text-primary transition-colors p-0.5">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap py-3 px-4">{s.date}</TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {s.fbSynced && <Facebook className="h-3 w-3 text-blue-400 shrink-0" />}
                          <TruncatedCell value={s.accountName ?? `#${s.accountId}`} maxWidth="max-w-[180px]" />
                          {hasTeams && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-primary/70 bg-primary/10 rounded px-1 py-0.5 shrink-0">
                              <Users className="h-2.5 w-2.5" />{tbs.length}队
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3 px-4">
                        <TruncatedCell value={s.pitcherName ?? "—"} maxWidth="max-w-[100px]" />
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold whitespace-nowrap text-sm py-3 px-4">
                        ${Number(s.spendAmount).toFixed(2)}
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        {s.fbSynced ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-blue-500 font-medium"><Facebook className="h-3 w-3" />FB</span>
                        ) : s.status === "approved" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-medium"><CheckCircle className="h-3 w-3" />已审核</span>
                        ) : s.status === "rejected" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-medium"><XCircle className="h-3 w-3" />已驳回</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-medium"><Clock className="h-3 w-3" />待审核</span>
                        )}
                      </TableCell>
                      {hasBizAny && (
                        <TableCell className="py-3 px-4">
                          {s.businessType ? <BizBadge biz={s.businessType} /> : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {hasLive && (
                        <TableCell className="text-xs text-muted-foreground py-3 px-4">
                          {hasTeams
                            ? <span className="text-primary/60 italic text-[11px]">{isExpanded ? "收起" : "展开查看"}</span>
                            : singleTeam
                              ? <TruncatedCell value={singleTeam.teamName} maxWidth="max-w-[100px]" />
                              : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {hasLive && (
                        <TableCell className="text-right font-mono text-xs py-3 px-4">
                          {(s.fanCount ?? 0) > 0 ? s.fanCount : "—"}
                        </TableCell>
                      )}
                      {hasLive && (
                        <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-4">
                          {s.fanCost ? `$${Number(s.fanCost).toFixed(4)}` : "—"}
                        </TableCell>
                      )}
                      {hasEcom && (
                        <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-4">
                          {s.gmv ? `$${Number(s.gmv).toFixed(2)}` : "—"}
                        </TableCell>
                      )}
                      {hasEcom && (
                        <TableCell className="text-right font-mono text-xs py-3 px-4">
                          {s.roas ? Number(s.roas).toFixed(2) : "—"}
                        </TableCell>
                      )}
                      {hasEcom && (
                        <TableCell className="text-right font-mono text-xs py-3 px-4">{s.orderCount ?? "—"}</TableCell>
                      )}
                      {hasEcom && (
                        <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-4">
                          {s.avgOrderValue ? `$${Number(s.avgOrderValue).toFixed(2)}` : "—"}
                        </TableCell>
                      )}
                      <TableCell className="py-3 px-2 text-center">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => setEditTarget(s)}
                            className="text-muted-foreground/40 hover:text-primary transition-colors"
                            title="编辑业务/团队"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget(s);
                              setDeleteTargetSpend(Number(s.spendAmount));
                              setDeletePassword("");
                            }}
                            className="text-muted-foreground/40 hover:text-destructive transition-colors"
                            title="删除记录"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded team breakdown sub-rows */}
                    {isExpanded && tbs.map((t) => (
                      <TableRow key={`tb-${s.id}-${t.teamId}`} className="bg-primary/[0.03] border-l-2 border-l-primary/20">
                        <TableCell className="py-2 px-1" />
                        <TableCell className="py-2 px-4 text-xs text-muted-foreground/40">└</TableCell>
                        <TableCell className="py-2 px-4" colSpan={2}>
                          <span className="text-xs text-muted-foreground">{t.teamName}</span>
                        </TableCell>
                        <TableCell className="py-2 px-4 text-right text-xs text-muted-foreground/30">—</TableCell>
                        <TableCell className="py-2 px-4" />
                        {hasBizAny && <TableCell className="py-2 px-4" />}
                        {hasLive && <TableCell className="py-2 px-4 text-xs text-muted-foreground">{t.teamName}</TableCell>}
                        {hasLive && <TableCell className="py-2 px-4 text-right font-mono text-xs">{t.fanCount ?? "—"}</TableCell>}
                        {hasLive && <TableCell className="py-2 px-4 text-right text-muted-foreground">—</TableCell>}
                        {hasEcom && <TableCell className="py-2 px-4" />}
                        {hasEcom && <TableCell className="py-2 px-4" />}
                        {hasEcom && <TableCell className="py-2 px-4" />}
                        {hasEcom && <TableCell className="py-2 px-4" />}
                        <TableCell className="py-2 px-2" />
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={sortedStats.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
