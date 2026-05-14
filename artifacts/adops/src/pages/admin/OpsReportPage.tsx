import { useState, useMemo, Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListDailyStats, useListTeams, getListDailyStatsQueryKey } from "@workspace/api-client-react";
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
import { TrendingUp, Search, ChevronsUpDown, ChevronUp, ChevronDown, ChevronRight, Facebook, EyeOff, Trash2, Loader2, Clock, XCircle, CheckCircle, Users } from "lucide-react";
import { BizBadge } from "@/components/shared/BizDisplay";
import { cn } from "@/lib/utils";

interface DailyStat {
  id: number;
  accountId: number;
  accountName?: string | null;
  date: string;
  spendAmount: string | number;
  pitcherName?: string | null;
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
}

interface Team { id: number; name: string; businessType: string; }

interface StatGroup {
  groupKey: string;
  date: string;
  accountId: number;
  accountName: string | null;
  pitcherName: string | null;
  main: DailyStat | null;
  teamRecords: DailyStat[];
  // filtered team sub-rows (when team filter is active)
  visibleTeams: DailyStat[];
  displaySpend: number;
  displayFans: number;
  displayFanCost: string | null;
  displayStatus: string | null;
  fbSynced: boolean;
  businessType: string | null;
}

const PAGE_SIZE = 30;

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

  const [deleteTarget, setDeleteTarget] = useState<DailyStat | null>(null);
  const [deleteTargetSpend, setDeleteTargetSpend] = useState<number>(0);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      // Invalidate both the current filtered query and the unfiltered base query
      await queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey(apiParams) });
      await queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });
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
    allStats.forEach((s) => { if (s.pitcherName && s.teamId == null) names.add(s.pitcherName); });
    return Array.from(names).sort();
  }, [allStats]);

  const hasLiveInAll = allStats.some((s) => s.businessType === "liveChat");
  const hasEcomInAll = allStats.some((s) => s.businessType === "ecommerce");

  // Build groups from all records
  const allGroups = useMemo((): StatGroup[] => {
    const map = new Map<string, { main: DailyStat | null; teams: DailyStat[] }>();
    for (const s of allStats) {
      const key = `${s.accountId}-${s.date}`;
      if (!map.has(key)) map.set(key, { main: null, teams: [] });
      const g = map.get(key)!;
      if (s.teamId == null) g.main = s; else g.teams.push(s);
    }
    return Array.from(map.entries()).map(([groupKey, { main, teams }]) => {
      const anchor = main ?? teams[0]!;
      // Legacy compat: old submissions stored spend on team records directly (no main record).
      const displaySpend = main
        ? Number(main.spendAmount)
        : teams.reduce((s, t) => s + Number(t.spendAmount), 0);
      const totalFans = teams.length > 0
        ? teams.reduce((s, t) => s + (t.fanCount ?? 0), 0)
        : (main?.fanCount ?? 0);
      const displayFanCost = displaySpend > 0 && totalFans > 0 ? (displaySpend / totalFans).toFixed(4) : null;
      return {
        groupKey,
        date: anchor.date,
        accountId: anchor.accountId,
        accountName: anchor.accountName ?? null,
        pitcherName: main?.pitcherName ?? teams[0]?.pitcherName ?? null,
        main,
        teamRecords: teams,
        visibleTeams: teams, // filtered below
        displaySpend,
        displayFans: totalFans,
        displayFanCost,
        displayStatus: main?.status ?? teams[0]?.status ?? null,
        fbSynced: main?.fbSynced ?? false,
        businessType: main?.businessType ?? teams[0]?.businessType ?? null,
      };
    });
  }, [allStats]);

  // Apply all filters at group level
  const filteredGroups = useMemo((): StatGroup[] => {
    let groups = [...allGroups];
    // Status filter (on main record; "all" still hides rejected)
    if (statusFilter === "approved") groups = groups.filter((g) => g.displayStatus === "approved" || g.fbSynced);
    else if (statusFilter === "pending") groups = groups.filter((g) => g.displayStatus === "pending" && !g.fbSynced);
    else if (statusFilter === "rejected") groups = groups.filter((g) => g.displayStatus === "rejected");
    else groups = groups.filter((g) => g.displayStatus !== "rejected");
    // hideZero: hide only when both spend=0 AND no team attribution rows
    if (hideZero) groups = groups.filter((g) => g.displaySpend > 0 || g.teamRecords.length > 0);
    // Business type filter
    if (bizFilter === "liveChat") groups = groups.filter((g) => g.businessType === "liveChat");
    else if (bizFilter === "ecommerce") groups = groups.filter((g) => g.businessType === "ecommerce");
    else if (bizFilter === "fb") groups = groups.filter((g) => g.fbSynced === true);
    // Team filter: show groups with matching team record; sub-rows restricted to match
    if (teamFilter !== "all") {
      groups = groups
        .filter((g) => g.teamRecords.some((t) => String(t.teamId) === teamFilter))
        .map((g) => ({ ...g, visibleTeams: g.teamRecords.filter((t) => String(t.teamId) === teamFilter) }));
    } else {
      groups = groups.map((g) => ({ ...g, visibleTeams: g.teamRecords }));
    }
    // Pitcher filter (main record's pitcher)
    if (pitcherFilter !== "all") groups = groups.filter((g) => g.pitcherName === pitcherFilter);
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      groups = groups.filter((g) => (g.accountName ?? "").toLowerCase().includes(q));
    }
    return groups;
  }, [allGroups, hideZero, bizFilter, teamFilter, pitcherFilter, search, statusFilter]);

  // Sort groups
  const sortedGroups = useMemo(() => {
    return [...filteredGroups].sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortKey === "spendAmount") { va = a.displaySpend; vb = b.displaySpend; }
      else if (sortKey === "fanCount") { va = a.displayFans; vb = b.displayFans; }
      else if (sortKey === "date") { va = a.date; vb = b.date; }
      else if (sortKey === "accountName") { va = a.accountName ?? ""; vb = b.accountName ?? ""; }
      else if (sortKey === "pitcherName") { va = a.pitcherName ?? ""; vb = b.pitcherName ?? ""; }
      else { va = Number(a.main ? (a.main as unknown as Record<string,unknown>)[sortKey] ?? 0 : 0); vb = Number(b.main ? (b.main as unknown as Record<string,unknown>)[sortKey] ?? 0 : 0); }
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [filteredGroups, sortKey, sortDir]);

  const pagedGroups = usePagination(sortedGroups, PAGE_SIZE, page);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups((prev) => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
  });

  // Summary stats from approved/fb-synced groups only.
  // totalSpend: sum of main record spend (team records don't carry spend).
  // totalFans: sum of team record fanCounts when teams exist, else main fanCount.
  const approvedGroups = filteredGroups.filter((g) => g.displayStatus === "approved" || g.fbSynced);
  const liveChatApproved = approvedGroups.filter((g) => g.businessType === "liveChat");
  const ecomApproved = approvedGroups.filter((g) => g.businessType === "ecommerce");
  const totalSpend = approvedGroups.reduce((s, g) => s + g.displaySpend, 0);
  const totalFans = liveChatApproved.reduce((s, g) => s + g.displayFans, 0);
  const avgFanCost = totalFans > 0 ? totalSpend / totalFans : 0;
  const totalGmv = ecomApproved.reduce((s, g) => s + Number(g.main?.gmv ?? 0), 0);
  const totalOrders = ecomApproved.reduce((s, g) => s + (g.main?.orderCount ?? 0), 0);
  const ecomSpend = ecomApproved.reduce((s, g) => s + g.displaySpend, 0);
  const overallRoas = ecomSpend > 0 && totalGmv > 0 ? totalGmv / ecomSpend : 0;

  const hasLive = filteredGroups.some((g) => g.businessType === "liveChat");
  const hasEcom = filteredGroups.some((g) => g.businessType === "ecommerce");
  const hasBizAny = filteredGroups.some((g) => g.businessType != null);

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
        { label: "记录条数", value: filteredGroups.length },
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
              {!isLoading && allStats.length > 0 && pagedGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colCount}>
                    <EmptyState icon={TrendingUp} title="暂无符合条件的数据" description="调整筛选条件后重试。" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && pagedGroups.map((g, idx) => {
                const isExpanded = expandedGroups.has(g.groupKey);
                const hasTeams = g.visibleTeams.length > 1; // expand only for 2+ teams
                const singleTeam = g.visibleTeams.length === 1 ? g.visibleTeams[0] : null;
                const isRejected = g.displayStatus === "rejected";
                return (
                  <Fragment key={g.groupKey}>
                    {/* ── Main group row ── */}
                    <TableRow className={cn(idx % 2 === 1 && "bg-muted/20", isRejected && "opacity-50")}>
                      <TableCell className="py-3 px-1 w-6">
                        {hasTeams ? (
                          <button onClick={() => toggleGroup(g.groupKey)}
                            className="text-muted-foreground hover:text-primary transition-colors p-0.5">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap py-3 px-4">{g.date}</TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {g.fbSynced && <Facebook className="h-3 w-3 text-blue-400 shrink-0" />}
                          <TruncatedCell value={g.accountName ?? `#${g.accountId}`} maxWidth="max-w-[180px]" />
                          {hasTeams && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-primary/70 bg-primary/10 rounded px-1 py-0.5 shrink-0">
                              <Users className="h-2.5 w-2.5" />{g.visibleTeams.length}队
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3 px-4">
                        <TruncatedCell value={g.pitcherName ?? "—"} maxWidth="max-w-[100px]" />
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold whitespace-nowrap text-sm py-3 px-4">
                        ${g.displaySpend.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        {g.fbSynced ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-blue-500 font-medium"><Facebook className="h-3 w-3" />FB</span>
                        ) : g.displayStatus === "approved" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-medium"><CheckCircle className="h-3 w-3" />已审核</span>
                        ) : g.displayStatus === "rejected" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-medium"><XCircle className="h-3 w-3" />已驳回</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-medium"><Clock className="h-3 w-3" />待审核</span>
                        )}
                      </TableCell>
                      {hasBizAny && (
                        <TableCell className="py-3 px-4">
                          {g.businessType ? <BizBadge biz={g.businessType} /> : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {hasLive && (
                        <TableCell className="text-xs text-muted-foreground py-3 px-4">
                          {hasTeams
                            ? <span className="text-primary/60 italic text-[11px]">{isExpanded ? "收起" : "展开查看"}</span>
                            : singleTeam
                              ? <TruncatedCell value={singleTeam.teamName ?? "—"} maxWidth="max-w-[100px]" />
                              : <TruncatedCell value={g.main?.teamName ?? "—"} maxWidth="max-w-[100px]" />}
                        </TableCell>
                      )}
                      {hasLive && (
                        <TableCell className="text-right font-mono text-xs py-3 px-4">
                          {g.displayFans > 0 ? g.displayFans : "—"}
                        </TableCell>
                      )}
                      {hasLive && (
                        <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-4">
                          {g.displayFanCost ? `$${g.displayFanCost}` : "—"}
                        </TableCell>
                      )}
                      {hasEcom && (
                        <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-4">
                          {g.main?.gmv ? `$${Number(g.main.gmv).toFixed(2)}` : "—"}
                        </TableCell>
                      )}
                      {hasEcom && (
                        <TableCell className="text-right font-mono text-xs py-3 px-4">
                          {g.main?.roas ? Number(g.main.roas).toFixed(2) : "—"}
                        </TableCell>
                      )}
                      {hasEcom && (
                        <TableCell className="text-right font-mono text-xs py-3 px-4">{g.main?.orderCount ?? "—"}</TableCell>
                      )}
                      {hasEcom && (
                        <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-4">
                          {g.main?.avgOrderValue ? `$${Number(g.main.avgOrderValue).toFixed(2)}` : "—"}
                        </TableCell>
                      )}
                      <TableCell className="py-3 px-2 text-center">
                        {(g.main ?? g.teamRecords[0]) && (
                          <button
                            onClick={() => {
                              const target = g.main ?? g.teamRecords[0]!;
                              setDeleteTarget(target);
                              setDeleteTargetSpend(g.displaySpend);
                              setDeletePassword("");
                            }}
                            className="text-muted-foreground/40 hover:text-destructive transition-colors"
                            title="删除记录"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* ── Team sub-rows (expanded) ── */}
                    {isExpanded && g.visibleTeams.map((t) => {
                      return (
                        <TableRow key={`team-${t.id}`} className="bg-primary/[0.03] border-l-2 border-l-primary/20">
                          <TableCell className="py-2 px-1" />
                          <TableCell className="py-2 px-4 text-xs text-muted-foreground/40">└</TableCell>
                          <TableCell className="py-2 px-4" colSpan={2}>
                            <span className="text-xs text-muted-foreground">{t.teamName ?? `团队 #${t.teamId}`}</span>
                          </TableCell>
                          {/* spend: team records have no independent spend */}
                          <TableCell className="py-2 px-4 text-right text-xs text-muted-foreground/30">—</TableCell>
                          {/* status: team attribution records don't have meaningful review status */}
                          <TableCell className="py-2 px-4" />
                          {hasBizAny && <TableCell className="py-2 px-4" />}
                          {hasLive && <TableCell className="py-2 px-4 text-xs text-muted-foreground">{t.teamName ?? "—"}</TableCell>}
                          {hasLive && <TableCell className="py-2 px-4 text-right font-mono text-xs">{t.fanCount ?? "—"}</TableCell>}
                          {hasLive && (
                            <TableCell className="py-2 px-4 text-right font-mono text-xs whitespace-nowrap text-muted-foreground">
                              {/* fan cost per team is indeterminate — spend is not split per team */}
                              —
                            </TableCell>
                          )}
                          {hasEcom && <TableCell className="py-2 px-4" />}
                          {hasEcom && <TableCell className="py-2 px-4" />}
                          {hasEcom && <TableCell className="py-2 px-4" />}
                          {hasEcom && <TableCell className="py-2 px-4" />}
                          <TableCell className="py-2 px-2 text-center">
                            <button
                              onClick={() => { setDeleteTarget(t); setDeletePassword(""); }}
                              className="text-muted-foreground/30 hover:text-destructive transition-colors"
                              title="删除团队记录"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={sortedGroups.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
