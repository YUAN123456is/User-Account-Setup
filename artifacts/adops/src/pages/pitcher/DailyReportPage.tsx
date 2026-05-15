import { useState, useMemo, Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAccounts, useCreateDailyStat, useUpdateDailyStat,
  useListDailyStats, useListTeams,
  getListAccountsQueryKey, getListDailyStatsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { BizBadge } from "@/components/shared/BizDisplay";
import { QuickDateFilter, type DateRange } from "@/components/shared/QuickDateFilter";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { StatsBar } from "@/components/shared/StatsBar";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, Plus, X, CheckCircle, Pencil,
  AlertCircle, Clock, XCircle, Facebook, Info, UserPlus,
  ChevronDown, ChevronRight, Users, Trash2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Account {
  id: number;
  accountName: string;
  platform: string;
  currentBalance: string;
  theoreticalBalance?: string | null;
}

interface Team {
  id: number;
  name: string;
  businessType: string;
}

interface TeamBreakdown {
  teamId: number;
  teamName: string;
  fanCount: number | null;
}

interface DailyStat {
  id: number;
  accountId: number;
  accountName?: string | null;
  accountCurrentBalance?: string | null;
  date: string;
  spendAmount: string | number;
  realBalance: string | number;
  hasAlert: boolean;
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
  reviewNote?: string | null;
}

interface TeamSubRow {
  key: string;
  teamId: string;
  fanCount: string;
}

interface ReportRow {
  key: string;
  accountId: string;
  spendAmount: string;
  businessType: string;
  teamRows: TeamSubRow[];
  gmv: string;
  orderCount: string;
}

const yesterday = (() => { const d = new Date(Date.now() - 8 * 60 * 60 * 1000); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
const today = (() => { const d = new Date(Date.now() - 8 * 60 * 60 * 1000); return d.toISOString().slice(0, 10); })();

function newTeamSubRow(): TeamSubRow {
  return { key: Math.random().toString(36).slice(2), teamId: "", fanCount: "" };
}

function newRow(): ReportRow {
  return { key: Math.random().toString(36).slice(2), accountId: "", spendAmount: "", businessType: "", teamRows: [newTeamSubRow()], gmv: "", orderCount: "" };
}

/** EditDialog — edit a single DailyStat. teamBreakdowns are edited inline for liveChat. */
function EditDialog({ stat, accounts, teams, onClose }: { stat: DailyStat; accounts: Account[]; teams: Team[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [spendAmount, setSpendAmount] = useState(String(Number(stat.spendAmount).toFixed(2)));
  const [businessType, setBiz] = useState(stat.businessType ?? "");
  const [fanCount, setFanCount] = useState(stat.fanCount ? String(stat.fanCount) : "");
  const [gmv, setGmv] = useState(stat.gmv ? String(Number(stat.gmv).toFixed(2)) : "");
  const [orderCount, setOrderCount] = useState(stat.orderCount ? String(stat.orderCount) : "");

  // Editable team breakdown rows
  const [editTeamRows, setEditTeamRows] = useState<TeamSubRow[]>(() =>
    stat.teamBreakdowns && stat.teamBreakdowns.length > 0
      ? stat.teamBreakdowns.map((tb) => ({
          key: Math.random().toString(36).slice(2),
          teamId: String(tb.teamId),
          fanCount: tb.fanCount != null ? String(tb.fanCount) : "",
        }))
      : [newTeamSubRow()]
  );

  const liveTeams = teams.filter((t) => t.businessType === "liveChat");
  const spend = parseFloat(spendAmount) || 0;
  const totalTeamFans = editTeamRows.reduce((s, t) => s + (parseInt(t.fanCount) || 0), 0);
  const displayFans = businessType === "liveChat"
    ? (editTeamRows.length > 0 && totalTeamFans > 0 ? totalTeamFans : parseInt(fanCount) || 0)
    : 0;
  const fanCost = businessType === "liveChat" && displayFans > 0 && spend > 0 ? (spend / displayFans).toFixed(4) : null;
  const gmvNum = parseFloat(gmv) || 0;
  const orderNum = parseInt(orderCount) || 0;
  const roas = businessType === "ecommerce" && gmvNum > 0 && spend > 0 ? (gmvNum / spend).toFixed(2) : null;
  const avgOrder = businessType === "ecommerce" && gmvNum > 0 && orderNum > 0 ? (gmvNum / orderNum).toFixed(2) : null;

  const wasRejected = stat.status === "rejected";
  const isFbSynced = !!stat.fbSynced;
  const isApproved = stat.status === "approved";
  const spendLocked = isFbSynced;
  const spendChanged = !spendLocked && parseFloat(spendAmount) !== parseFloat(String(stat.spendAmount));
  const willTriggerReview = !isApproved || spendChanged;

  const update = useUpdateDailyStat({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });
        const needsReview = wasRejected || willTriggerReview;
        toast({
          title: needsReview ? "已提交审核" : "修改成功",
          description: needsReview ? "管理员确认后数据将正式生效" : undefined,
        });
        onClose();
      },
      onError: (err: unknown) => { toast({ title: (err as { data?: { error?: string } })?.data?.error ?? "修改失败", variant: "destructive" }); },
    },
  });

  const handleSave = () => {
    const sp = parseFloat(spendAmount);
    if (isNaN(sp) || sp < 0) { toast({ title: "请输入有效消耗金额", variant: "destructive" }); return; }

    // Build teamBreakdowns from edit rows
    const validTeamRows = editTeamRows.filter((t) => t.teamId);
    const teamBreakdowns = businessType === "liveChat" && validTeamRows.length > 0
      ? validTeamRows.map((t) => ({
          teamId: Number(t.teamId),
          teamName: teams.find((tm) => tm.id === Number(t.teamId))?.name ?? "",
          fanCount: t.fanCount ? parseInt(t.fanCount) : null,
        }))
      : null;

    const derivedFanCount = teamBreakdowns
      ? (teamBreakdowns.reduce((s, t) => s + (t.fanCount ?? 0), 0) || null)
      : (businessType === "liveChat" && fanCount ? parseInt(fanCount) : null);

    update.mutate({ id: stat.id, data: {
      ...(isApproved && !spendChanged ? {} : { spendAmount: sp.toFixed(2) }),
      businessType: (businessType as "liveChat" | "ecommerce") || null,
      teamBreakdowns: teamBreakdowns as { teamId: number; teamName: string; fanCount?: number | null }[] | null,
      fanCount: derivedFanCount,
      gmv: businessType === "ecommerce" && gmv ? parseFloat(gmv).toFixed(2) : null,
      orderCount: businessType === "ecommerce" && orderCount ? parseInt(orderCount) : null,
    }});
  };

  const acc = accounts.find((a) => a.id === stat.accountId);

  const toggleBiz = (v: string) => {
    setBiz((prev) => prev === v ? "" : v);
    setFanCount(""); setGmv(""); setOrderCount("");
    setEditTeamRows([newTeamSubRow()]);
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
          {isFbSynced && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
              <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-400">
                此条数据由 FB 自动同步，<span className="font-medium">消耗金额不可修改</span>。可在此补充业务类型、团队等信息。
              </p>
            </div>
          )}
          {!spendLocked && isApproved && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
              <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-400">
                团队、业务类型修改后<span className="font-medium">直接生效</span>，不需审核。修改消耗金额将重新提交审核。
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">
              消耗金额（美元）
              {!spendLocked && <span className="text-destructive">*</span>}
              {!spendLocked && isApproved && spendChanged && (
                <span className="ml-2 text-xs font-normal text-amber-400">修改后将触发审核</span>
              )}
            </Label>
            {spendLocked ? (
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/50 text-sm font-mono text-muted-foreground">
                ${Number(stat.spendAmount).toFixed(2)}
                {isFbSynced && <span className="ml-2 text-xs text-blue-400/70">FB 数据</span>}
              </div>
            ) : (
              <Input type="number" min="0" step="0.01" value={spendAmount} onChange={(e) => setSpendAmount(e.target.value)} />
            )}
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
            <div className="space-y-2">
              <Label className="text-sm">服务团队与进粉</Label>
              {editTeamRows.map((sub, si) => {
                const subFans = parseInt(sub.fanCount) || 0;
                const subCost = subFans > 0 && spend > 0 && editTeamRows.length === 1 ? (spend / subFans).toFixed(4) : null;
                return (
                  <div key={sub.key} className="flex items-center gap-2">
                    {editTeamRows.length > 1 && <span className="text-xs text-muted-foreground w-4 shrink-0">{si + 1}.</span>}
                    <Select value={sub.teamId} onValueChange={(v) => setEditTeamRows((prev) => prev.map((t) => t.key === sub.key ? { ...t, teamId: v } : t))}>
                      <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue placeholder="选择团队..." /></SelectTrigger>
                      <SelectContent>{liveTeams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="relative w-24 shrink-0">
                      <Input type="number" min="0" placeholder="进粉" className="h-7 text-xs pr-6"
                        value={sub.fanCount}
                        onChange={(e) => setEditTeamRows((prev) => prev.map((t) => t.key === sub.key ? { ...t, fanCount: e.target.value } : t))} />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60 pointer-events-none">粉</span>
                    </div>
                    {subCost && <span className="text-[10px] text-muted-foreground shrink-0">≈${subCost}</span>}
                    {editTeamRows.length > 1 && (
                      <button onClick={() => setEditTeamRows((prev) => prev.filter((t) => t.key !== sub.key))}
                        className="text-muted-foreground hover:text-destructive shrink-0 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              {fanCost && editTeamRows.length > 1 && (
                <p className="text-xs text-muted-foreground">总进粉 <span className="font-mono text-primary">{totalTeamFans}</span>，均粉成本 <span className="font-mono text-primary">${fanCost}</span></p>
              )}
              <button
                type="button"
                onClick={() => setEditTeamRows((prev) => [...prev, newTeamSubRow()])}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <UserPlus className="h-3 w-3" /> 添加另一个团队
              </button>
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
            {update.isPending ? "保存中..." : wasRejected ? "修改并重新提交" : willTriggerReview ? "保存并提交审核" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DailyReportPage() {
  const [sharedDate, setSharedDate] = useState(yesterday);
  const [rows, setRows] = useState<ReportRow[]>([newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [editTarget, setEditTarget] = useState<DailyStat | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: accountsData } = useListAccounts({});
  const { data: teamsData } = useListTeams({});
  const accounts = useMemo(() => Array.isArray(accountsData) ? (accountsData as Account[]) : [], [accountsData]);
  const teams = useMemo(() => Array.isArray(teamsData) ? (teamsData as Team[]) : [], [teamsData]);
  const liveTeams = teams.filter((t) => t.businessType === "liveChat");

  const { data: yStatsData, isLoading: dayLoading } = useListDailyStats({ dateFrom: sharedDate, dateTo: sharedDate } as Record<string, string>);
  const dayStats = useMemo(() => Array.isArray(yStatsData) ? (yStatsData as DailyStat[]) : [], [yStatsData]);
  const reportedIds = useMemo(() => new Set(dayStats.map((s) => s.accountId)), [dayStats]);

  const [histDateRange, setHistDateRange] = useState<DateRange>({ from: "", to: "" });
  const [histAccountFilter, setHistAccountFilter] = useState("all");
  const [histStatusFilter, setHistStatusFilter] = useState("all");
  const [histBizFilter, setHistBizFilter] = useState("all");
  const [hideZero, setHideZero] = useState(true);
  const [histPage, setHistPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const toggleExpand = (id: number) => setExpandedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const selfDelete = async (stat: DailyStat) => {
    if (stat.status !== "rejected" || stat.fbSynced) return;
    setDeletingId(stat.id);
    try {
      const res = await fetch(`${BASE}/api/daily-stats/${stat.id}/self`, {
        method: "DELETE", credentials: "include",
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { toast({ title: data.error ?? "删除失败", variant: "destructive" }); return; }
      toast({ title: "已删除", description: `${stat.date} · ${stat.accountName ?? ""}` });
      queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
    } finally {
      setDeletingId(null);
    }
  };

  const histApiParams: Record<string, string> = {};
  if (histDateRange.from) histApiParams.dateFrom = histDateRange.from;
  if (histDateRange.to) histApiParams.dateTo = histDateRange.to;
  if (histAccountFilter !== "all") histApiParams.accountId = histAccountFilter;

  const { data: histData, isLoading: histLoading } = useListDailyStats(histApiParams);
  const allHistStats = useMemo(() => Array.isArray(histData) ? (histData as DailyStat[]) : [], [histData]);

  // Filter stats (no grouping — each DailyStat is one row)
  const filteredStats = useMemo(() => {
    let stats = [...allHistStats];
    if (histStatusFilter === "pending") stats = stats.filter((s) => s.status === "pending" && !s.fbSynced);
    else if (histStatusFilter === "approved") stats = stats.filter((s) => s.status === "approved" && !s.fbSynced);
    else if (histStatusFilter === "rejected") stats = stats.filter((s) => s.status === "rejected");
    else if (histStatusFilter === "fb") stats = stats.filter((s) => !!s.fbSynced);
    if (histBizFilter === "liveChat") stats = stats.filter((s) => s.businessType === "liveChat");
    else if (histBizFilter === "ecommerce") stats = stats.filter((s) => s.businessType === "ecommerce");
    if (hideZero) stats = stats.filter((s) => Number(s.spendAmount) > 0 || (s.teamBreakdowns?.length ?? 0) > 0);
    return stats.sort((a, b) => b.date.localeCompare(a.date));
  }, [allHistStats, histStatusFilter, histBizFilter, hideZero]);

  const pagedStats = usePagination(filteredStats, 20, histPage);
  const hasLive = filteredStats.some((s) => s.businessType === "liveChat");
  const hasEcom = filteredStats.some((s) => s.businessType === "ecommerce");
  const hasBiz = filteredStats.some((s) => s.businessType != null);

  const createMutation = useCreateDailyStat({});

  const updateRow = (key: string, field: keyof Omit<ReportRow, "teamRows">, value: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const next = { ...r, [field]: value };
      if (field === "businessType") {
        next.teamRows = [newTeamSubRow()];
        next.gmv = ""; next.orderCount = "";
      }
      return next;
    }));
  };
  const updateTeamRow = (rowKey: string, subKey: string, field: keyof TeamSubRow, value: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== rowKey) return r;
      return { ...r, teamRows: r.teamRows.map((t) => t.key === subKey ? { ...t, [field]: value } : t) };
    }));
  };
  const addTeamRow = (rowKey: string) => {
    setRows((prev) => prev.map((r) => r.key !== rowKey ? r : { ...r, teamRows: [...r.teamRows, newTeamSubRow()] }));
  };
  const removeTeamRow = (rowKey: string, subKey: string) => {
    setRows((prev) => prev.map((r) => r.key !== rowKey ? r : { ...r, teamRows: r.teamRows.filter((t) => t.key !== subKey) }));
  };
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));
  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const handleSubmitAll = async () => {
    for (const r of rows) {
      if (!r.accountId || !r.spendAmount) {
        toast({ title: "请填写完整", description: "每行都需要选择账户并填写消耗金额。", variant: "destructive" });
        return;
      }
      if (isNaN(parseFloat(r.spendAmount)) || parseFloat(r.spendAmount) < 0) {
        toast({ title: "金额无效", variant: "destructive" });
        return;
      }
    }
    setSubmitting(true);
    let failed = 0; let duplicates = 0; let succeeded = 0;
    for (const r of rows) {
      const totalSpend = parseFloat(r.spendAmount);
      const isLive = r.businessType === "liveChat";
      const validTeamRows = isLive ? r.teamRows.filter((t) => t.teamId) : [];

      // Build teamBreakdowns JSON — embedded in the single record
      const teamBreakdowns = isLive && validTeamRows.length > 0
        ? validTeamRows.map((t) => ({
            teamId: Number(t.teamId),
            teamName: teams.find((tm) => tm.id === Number(t.teamId))?.name ?? "",
            fanCount: t.fanCount ? parseInt(t.fanCount) : null,
          }))
        : null;

      const entry = {
        accountId: Number(r.accountId),
        date: sharedDate,
        spendAmount: totalSpend.toFixed(2),
        businessType: (r.businessType as "liveChat" | "ecommerce") || null,
        teamBreakdowns: teamBreakdowns as { teamId: number; teamName: string; fanCount?: number | null }[] | null,
        fanCount: teamBreakdowns
          ? (teamBreakdowns.reduce((s, t) => s + (t.fanCount ?? 0), 0) || null)
          : null,
        gmv: (r.businessType === "ecommerce" && r.gmv) ? parseFloat(r.gmv).toFixed(2) : null,
        orderCount: (r.businessType === "ecommerce" && r.orderCount) ? parseInt(r.orderCount) : null,
      };

      try {
        await new Promise<void>((resolve, reject) => {
          createMutation.mutate({ data: entry }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
        });
        succeeded++;
      } catch (e: unknown) {
        const msg = (e as { data?: { error?: string } })?.data?.error ?? "";
        if (msg.includes("已上报")) {
          duplicates++;
          toast({ title: "重复上报", description: msg, variant: "destructive" });
        } else {
          failed++;
        }
      }
    }
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
    queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });
    setSubmitting(false);
    if (failed === 0 && succeeded > 0) {
      setSubmitted(true);
      setRows([newRow()]);
      const dupNote = duplicates > 0 ? `（${duplicates} 条重复跳过）` : "";
      toast({ title: "提交成功", description: `${succeeded} 条上报数据已提交审核。${dupNote}` });
      setTimeout(() => setSubmitted(false), 3000);
    } else if (failed > 0) {
      toast({ title: `${failed} 条提交失败`, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">每日上报</h1>
        <p className="text-sm text-muted-foreground mt-0.5">填写各账户消耗，余额由系统自动计算</p>
      </div>

      {/* ── 填报区 ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/30">
          <span className="text-xs font-medium text-foreground shrink-0">上报日期</span>
          <Input
            type="date" className="h-7 w-36 text-xs"
            value={sharedDate} max={today}
            onChange={(e) => setSharedDate(e.target.value)}
          />
          <span className="text-xs text-muted-foreground hidden sm:block">各行共用此日期</span>
          <Button variant="ghost" size="sm" className="ml-auto gap-1.5 h-7 text-xs" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> 添加一行
          </Button>
        </div>

        <div className="divide-y divide-border/60">
          {rows.map((row, idx) => {
            const selAcc = accounts.find((a) => String(a.id) === row.accountId);
            const bal = parseFloat(selAcc?.theoreticalBalance ?? selAcc?.currentBalance ?? "0");
            const spend = parseFloat(row.spendAmount) || 0;
            const previewBal = selAcc && row.spendAmount ? (bal - spend).toFixed(2) : null;
            const gmvNum = parseFloat(row.gmv) || 0;
            const orderNum = parseInt(row.orderCount) || 0;
            const roas = row.businessType === "ecommerce" && gmvNum > 0 && spend > 0 ? (gmvNum / spend).toFixed(2) : null;
            const avgOrder = row.businessType === "ecommerce" && gmvNum > 0 && orderNum > 0 ? (gmvNum / orderNum).toFixed(2) : null;
            const alreadyReported = row.accountId && reportedIds.has(Number(row.accountId));
            const hasOps = row.businessType === "liveChat" || row.businessType === "ecommerce";

            return (
              <div key={row.key} className={["px-3 py-2 space-y-1.5 transition-colors", alreadyReported ? "bg-amber-50/50 dark:bg-amber-900/10" : ""].join(" ")}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">{idx + 1}</span>

                  <Select value={row.accountId} onValueChange={(v) => updateRow(row.key, "accountId", v)}>
                    <SelectTrigger className="h-8 text-xs flex-[2] min-w-0">
                      <SelectValue placeholder="选择账户..." />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.accountName}{reportedIds.has(a.id) ? " ✓已报" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="relative flex-1 min-w-[100px]">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      className="h-8 text-sm pl-6"
                      value={row.spendAmount}
                      onChange={(e) => updateRow(row.key, "spendAmount", e.target.value)}
                    />
                  </div>

                  <div className="flex gap-1 shrink-0">
                    {[["liveChat", "聊单"], ["ecommerce", "独立站"]].map(([v, label]) => (
                      <button key={v}
                        onClick={() => updateRow(row.key, "businessType", row.businessType === v ? "" : v)}
                        className={["text-xs px-2 py-1 rounded border transition-colors", row.businessType === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"].join(" ")}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {rows.length > 1 && (
                    <button onClick={() => removeRow(row.key)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {(alreadyReported || previewBal !== null) && (
                  <div className="flex items-center gap-3 pl-6 text-xs">
                    {alreadyReported && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertCircle className="h-3 w-3" /> {sharedDate} 已有上报
                      </span>
                    )}
                    {previewBal !== null && !alreadyReported && (
                      <span className="text-muted-foreground">提交后余额：<span className="font-mono text-primary">${previewBal}</span></span>
                    )}
                  </div>
                )}

                {/* 业务类型展开区 */}
                {hasOps && (
                  <div className="pl-6 pt-0.5 space-y-1.5">
                    {row.businessType === "liveChat" && (() => {
                      const n = row.teamRows.length;
                      return (
                        <>
                          {row.teamRows.map((sub, si) => {
                            const fanNum = parseInt(sub.fanCount) || 0;
                            const subFanCost = fanNum > 0 && spend > 0 && n === 1 ? (spend / fanNum).toFixed(4) : null;
                            return (
                              <div key={sub.key} className="flex items-center gap-2">
                                {n > 1 && <span className="text-xs text-muted-foreground w-4 shrink-0">{si + 1}.</span>}
                                <Select value={sub.teamId} onValueChange={(v) => updateTeamRow(row.key, sub.key, "teamId", v)}>
                                  <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue placeholder="选择团队..." /></SelectTrigger>
                                  <SelectContent>{liveTeams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <div className="relative w-24 shrink-0">
                                  <Input type="number" min="0" placeholder="进粉" className="h-7 text-xs pr-6"
                                    value={sub.fanCount} onChange={(e) => updateTeamRow(row.key, sub.key, "fanCount", e.target.value)} />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60 pointer-events-none">粉</span>
                                </div>
                                {subFanCost && <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">≈${subFanCost}/粉</span>}
                                {n > 1 && (
                                  <button onClick={() => removeTeamRow(row.key, sub.key)} className="text-muted-foreground hover:text-destructive shrink-0 transition-colors">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          <button
                            onClick={() => addTeamRow(row.key)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                          >
                            <UserPlus className="h-3 w-3" /> 添加团队
                          </button>
                        </>
                      );
                    })()}
                    {row.businessType === "ecommerce" && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <Label className="text-xs">GMV（美元）</Label>
                          <Input type="number" min="0" step="0.01" placeholder="0.00" className="h-7 text-xs"
                            value={row.gmv} onChange={(e) => updateRow(row.key, "gmv", e.target.value)} />
                          {roas && <p className="text-xs text-muted-foreground">ROAS <span className="font-mono text-green-600">{roas}</span></p>}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">订单数</Label>
                          <Input type="number" min="0" placeholder="0" className="h-7 text-xs"
                            value={row.orderCount} onChange={(e) => updateRow(row.key, "orderCount", e.target.value)} />
                          {avgOrder && <p className="text-xs text-muted-foreground">客单价 <span className="font-mono text-green-600">${avgOrder}</span></p>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {rows.length > 1 ? `共 ${rows.length} 行` : ""}
          </span>
          <Button size="sm" className="gap-1.5 px-5" onClick={handleSubmitAll} disabled={submitting}>
            {submitted
              ? <><CheckCircle className="h-3.5 w-3.5" /> 已全部提交</>
              : submitting ? "提交中..."
              : <><CheckCircle className="h-3.5 w-3.5" /> 提交{rows.length > 1 ? ` ${rows.length} 条` : ""}上报</>}
          </Button>
        </div>
      </div>

      {/* ── 上报记录 ── */}
      <div className="space-y-3">
        {/* Stats bar — approved & FB-synced totals only */}
        {(() => {
          const approvedStats = filteredStats.filter((s) => s.status === "approved" || s.fbSynced);
          const liveApproved = approvedStats.filter((s) => s.businessType === "liveChat");
          const ecomApproved = approvedStats.filter((s) => s.businessType === "ecommerce");
          const totalSpend = approvedStats.reduce((s, st) => s + Number(st.spendAmount), 0);
          const totalFans = liveApproved.reduce((s, st) => s + (st.fanCount ?? 0), 0);
          const liveChatSpend = liveApproved.reduce((s, st) => s + Number(st.spendAmount), 0);
          const totalGmv = ecomApproved.reduce((s, st) => s + Number(st.gmv ?? 0), 0);
          const avgFanCost = totalFans > 0 ? liveChatSpend / totalFans : 0;
          const pendingCount = filteredStats.filter((s) => s.status === "pending" && !s.fbSynced).length;
          const items = [
            { label: "已通过消耗", value: `$${totalSpend.toFixed(2)}` },
            { label: "待审核", value: `${pendingCount} 条` },
            ...(totalFans > 0 ? [{ label: "累计进粉", value: String(totalFans) }] : []),
            ...(avgFanCost > 0 ? [{ label: "均粉成本", value: `$${avgFanCost.toFixed(4)}` }] : []),
            ...(totalGmv > 0 ? [{ label: "累计GMV", value: `$${totalGmv.toFixed(2)}` }] : []),
          ];
          return approvedStats.length > 0 || pendingCount > 0
            ? <StatsBar items={items} />
            : null;
        })()}

        <div className="flex flex-wrap items-center gap-2 justify-between">
          <h2 className="text-sm font-semibold">上报记录</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={histAccountFilter} onValueChange={(v) => { setHistAccountFilter(v); setHistPage(1); }}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="全部账户" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部账户</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.accountName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={histStatusFilter} onValueChange={(v) => { setHistStatusFilter(v); setHistPage(1); }}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="pending">待审核</SelectItem>
                <SelectItem value="approved">已通过</SelectItem>
                <SelectItem value="rejected">已驳回</SelectItem>
                <SelectItem value="fb">FB同步</SelectItem>
              </SelectContent>
            </Select>
            <Select value={histBizFilter} onValueChange={(v) => { setHistBizFilter(v); setHistPage(1); }}>
              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部业务</SelectItem>
                <SelectItem value="liveChat">聊单</SelectItem>
                <SelectItem value="ecommerce">独立站</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => { setHideZero((v) => !v); setHistPage(1); }}
              className={["h-8 px-2.5 rounded border text-xs transition-colors whitespace-nowrap", hideZero ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"].join(" ")}
            >
              隐藏零消耗
            </button>
            <QuickDateFilter onChange={(r) => { setHistDateRange(r); setHistPage(1); }} />
          </div>
        </div>

        {histLoading || dayLoading ? (
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
        ) : filteredStats.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <BarChart3 className="h-5 w-5 text-muted-foreground/40 mx-auto mb-1.5" />
            <p className="text-sm text-muted-foreground">暂无上报记录</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-6"></TableHead>
                    <TableHead className="min-w-[88px] whitespace-nowrap">日期</TableHead>
                    <TableHead className="min-w-[160px]">账户</TableHead>
                    <TableHead className="min-w-[80px] text-right whitespace-nowrap">总消耗</TableHead>
                    <TableHead className="min-w-[88px] text-right whitespace-nowrap">余额</TableHead>
                    {hasBiz && <TableHead className="min-w-[64px]">业务</TableHead>}
                    {hasLive && <TableHead className="min-w-[100px] whitespace-nowrap">团队</TableHead>}
                    {hasLive && <TableHead className="min-w-[56px] text-right whitespace-nowrap">进粉</TableHead>}
                    {hasLive && <TableHead className="min-w-[76px] text-right whitespace-nowrap">粉成本</TableHead>}
                    {hasEcom && <TableHead className="min-w-[86px] text-right whitespace-nowrap">GMV</TableHead>}
                    {hasEcom && <TableHead className="min-w-[60px] text-right whitespace-nowrap">ROAS</TableHead>}
                    {hasEcom && <TableHead className="min-w-[52px] text-right whitespace-nowrap">订单</TableHead>}
                    {hasEcom && <TableHead className="min-w-[76px] text-right whitespace-nowrap">客单</TableHead>}
                    <TableHead className="min-w-[56px] whitespace-nowrap">状态</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedStats.map((s, idx) => {
                    const isExpanded = expandedIds.has(s.id);
                    const tbs = s.teamBreakdowns ?? [];
                    const hasTeams = tbs.length > 1;
                    const singleTeam = tbs.length === 1 ? tbs[0] : null;
                    const rowBg = s.status === "rejected" ? "bg-red-50/20 dark:bg-red-900/5" : idx % 2 === 1 ? "bg-muted/20" : "";
                    return (
                      <Fragment key={s.id}>
                        <TableRow className={rowBg}>
                          {/* Expand toggle for multi-team breakdowns */}
                          <TableCell className="py-3 px-1 w-6">
                            {hasTeams ? (
                              <button onClick={() => toggleExpand(s.id)}
                                className="text-muted-foreground hover:text-primary transition-colors p-0.5">
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-3 px-3">{s.date}</TableCell>
                          <TableCell className="font-medium text-sm py-3 px-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {s.fbSynced && <Facebook className="h-3 w-3 text-blue-400 shrink-0" />}
                              <TruncatedCell value={s.accountName ?? `#${s.accountId}`} maxWidth="max-w-[160px]" />
                              {hasTeams && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-primary/70 bg-primary/10 rounded px-1 py-0.5 shrink-0">
                                  <Users className="h-2.5 w-2.5" />{tbs.length}队
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold whitespace-nowrap text-sm py-3 px-3">
                            ${Number(s.spendAmount).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-3 text-muted-foreground">
                            ${Number(s.realBalance).toFixed(2)}
                          </TableCell>
                          {hasBiz && (
                            <TableCell className="py-3 px-3">
                              {s.businessType ? <BizBadge biz={s.businessType} /> : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                          )}
                          {hasLive && (
                            <TableCell className="text-xs text-muted-foreground py-3 px-3">
                              {hasTeams
                                ? <span className="text-primary/60 italic text-[11px]">{isExpanded ? "收起" : "展开查看"}</span>
                                : singleTeam ? <TruncatedCell value={singleTeam.teamName} maxWidth="max-w-[100px]" />
                                : "—"}
                            </TableCell>
                          )}
                          {hasLive && (
                            <TableCell className="text-right font-mono text-xs py-3 px-3">
                              {(s.fanCount ?? 0) > 0 ? s.fanCount : "—"}
                            </TableCell>
                          )}
                          {hasLive && (
                            <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-3">
                              {s.fanCost ? `$${Number(s.fanCost).toFixed(4)}` : "—"}
                            </TableCell>
                          )}
                          {hasEcom && (
                            <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-3">
                              {s.gmv ? `$${Number(s.gmv).toFixed(2)}` : "—"}
                            </TableCell>
                          )}
                          {hasEcom && (
                            <TableCell className="text-right font-mono text-xs py-3 px-3">
                              {s.roas ? Number(s.roas).toFixed(2) : "—"}
                            </TableCell>
                          )}
                          {hasEcom && (
                            <TableCell className="text-right font-mono text-xs py-3 px-3">{s.orderCount ?? "—"}</TableCell>
                          )}
                          {hasEcom && (
                            <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-3">
                              {s.avgOrderValue ? `$${Number(s.avgOrderValue).toFixed(2)}` : "—"}
                            </TableCell>
                          )}
                          <TableCell className="py-3 px-3">
                            {s.fbSynced ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-blue-500 font-medium"><Facebook className="h-3 w-3" />FB</span>
                            ) : s.status === "approved" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-medium"><CheckCircle className="h-3 w-3" />已通过</span>
                            ) : s.status === "rejected" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-medium"><XCircle className="h-3 w-3" />已驳回</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-medium"><Clock className="h-3 w-3" />待审核</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 px-2 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              {(s.status === "pending" || s.status === "approved" || s.status === "rejected") && !s.fbSynced && (
                                <button onClick={() => setEditTarget(s)} className="text-muted-foreground/50 hover:text-primary transition-colors" title="编辑">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {s.status === "rejected" && !s.fbSynced && (
                                <button
                                  onClick={() => selfDelete(s)}
                                  disabled={deletingId === s.id}
                                  className="text-muted-foreground/30 hover:text-destructive transition-colors"
                                  title="删除驳回记录"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded team breakdown sub-rows */}
                        {isExpanded && tbs.map((tb) => (
                          <TableRow key={`tb-${tb.teamId}`} className="bg-primary/[0.03] border-l-2 border-l-primary/20">
                            <TableCell className="py-2 px-1" />
                            <TableCell className="py-2 px-3 text-xs text-muted-foreground/40">└</TableCell>
                            <TableCell className="py-2 px-3">
                              <span className="text-xs text-muted-foreground">{tb.teamName}</span>
                            </TableCell>
                            <TableCell className="py-2 px-3" />{/* spend */}
                            <TableCell className="py-2 px-3" />{/* balance */}
                            {hasBiz && <TableCell className="py-2 px-3" />}
                            {hasLive && <TableCell className="py-2 px-3 text-xs text-muted-foreground">{tb.teamName}</TableCell>}
                            {hasLive && <TableCell className="py-2 px-3 text-right font-mono text-xs">{tb.fanCount ?? "—"}</TableCell>}
                            {hasLive && <TableCell className="py-2 px-3" />}
                            {hasEcom && <TableCell className="py-2 px-3" />}
                            {hasEcom && <TableCell className="py-2 px-3" />}
                            {hasEcom && <TableCell className="py-2 px-3" />}
                            {hasEcom && <TableCell className="py-2 px-3" />}
                            <TableCell className="py-2 px-3" />
                            <TableCell className="py-2 px-2" />
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <TablePagination page={histPage} pageSize={20} total={filteredStats.length} onPageChange={setHistPage} />
          </div>
        )}
      </div>

      {editTarget && (
        <EditDialog
          stat={editTarget}
          accounts={accounts}
          teams={teams}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
