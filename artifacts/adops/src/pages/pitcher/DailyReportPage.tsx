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
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, Plus, X, CheckCircle, Pencil,
  AlertCircle, Clock, XCircle, Facebook, Info, UserPlus, PlusCircle,
  ChevronDown, ChevronRight, Users,
} from "lucide-react";

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

interface TeamSubRow {
  key: string;
  teamId: string;
  fanCount: string;
}

interface StatGroup {
  groupKey: string;
  date: string;
  accountId: number;
  accountName: string | null;
  accountCurrentBalance: string | null;
  main: DailyStat | null;
  teamRecords: DailyStat[];
  displaySpend: number;
  displayFans: number;
  displayFanCost: string | null;
  displayBalance: string | null;
  displayStatus: string | null;
  fbSynced: boolean;
  businessType: string | null;
  reviewNote: string | null;
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

function EditDialog({ stat, accounts, teams, onClose }: { stat: DailyStat; accounts: Account[]; teams: Team[]; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [spendAmount, setSpendAmount] = useState(String(Number(stat.spendAmount).toFixed(2)));
  const [businessType, setBiz] = useState(stat.businessType ?? "");
  const [teamId, setTeamId] = useState(stat.teamId ? String(stat.teamId) : "");
  const [fanCount, setFanCount] = useState(stat.fanCount ? String(stat.fanCount) : "");
  const [gmv, setGmv] = useState(stat.gmv ? String(Number(stat.gmv).toFixed(2)) : "");
  const [orderCount, setOrderCount] = useState(stat.orderCount ? String(stat.orderCount) : "");

  const [showAddTeam, setShowAddTeam] = useState(false);
  const [addTeamId, setAddTeamId] = useState("");
  const [addFanCount, setAddFanCount] = useState("");
  const [addSpend, setAddSpend] = useState("");

  const liveTeams = teams.filter((t) => t.businessType === "liveChat");
  const spend = parseFloat(spendAmount) || 0;
  const fanNum = parseInt(fanCount) || 0;
  const gmvNum = parseFloat(gmv) || 0;
  const orderNum = parseInt(orderCount) || 0;
  const fanCost = businessType === "liveChat" && fanNum > 0 && spend > 0 ? (spend / fanNum).toFixed(4) : null;
  const roas = businessType === "ecommerce" && gmvNum > 0 && spend > 0 ? (gmvNum / spend).toFixed(2) : null;
  const avgOrder = businessType === "ecommerce" && gmvNum > 0 && orderNum > 0 ? (gmvNum / orderNum).toFixed(2) : null;

  const wasRejected = stat.status === "rejected";
  const isFbSynced = !!stat.fbSynced;
  const isApproved = stat.status === "approved";
  // FB-synced records: spend is authoritative from FB, never editable
  const spendChanged = !isFbSynced && parseFloat(spendAmount) !== parseFloat(String(stat.spendAmount));
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

  const addTeamCreate = useCreateDailyStat({});

  const handleAddTeam = () => {
    const sp = addSpend ? parseFloat(addSpend) : 0;
    if (!addTeamId) { toast({ title: "请选择服务团队", variant: "destructive" }); return; }
    if (addSpend && (isNaN(sp) || sp < 0)) { toast({ title: "消耗金额格式不正确", variant: "destructive" }); return; }
    addTeamCreate.mutate({ data: {
      accountId: stat.accountId,
      date: stat.date,
      spendAmount: sp > 0 ? sp.toFixed(2) : "0",
      businessType: "liveChat",
      teamId: Number(addTeamId),
      fanCount: addFanCount ? parseInt(addFanCount) : null,
      gmv: null,
      orderCount: null,
    }}, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listDailyStats"] });
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        toast({ title: "团队记录已添加", description: "新记录已提交审核。" });
        setShowAddTeam(false);
        setAddTeamId(""); setAddFanCount(""); setAddSpend("");
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "添加失败";
        toast({ title: msg, variant: "destructive" });
      },
    });
  };

  const addFanNum = parseInt(addFanCount) || 0;
  const addSpendNum = parseFloat(addSpend) || 0;
  const addFanCost = addFanNum > 0 && addSpendNum > 0 ? (addSpendNum / addFanNum).toFixed(4) : null;

  const handleSave = () => {
    const sp = parseFloat(spendAmount);
    if (isNaN(sp) || sp < 0) { toast({ title: "请输入有效消耗金额", variant: "destructive" }); return; }
    update.mutate({ id: stat.id, data: {
      // Approved records: only include spendAmount if it actually changed (triggers review)
      ...(isApproved && !spendChanged ? {} : { spendAmount: sp.toFixed(2) }),
      businessType: (businessType as "liveChat" | "ecommerce") || null,
      teamId: (businessType === "liveChat" && teamId) ? Number(teamId) : null,
      fanCount: businessType === "liveChat" && fanCount ? parseInt(fanCount) : null,
      gmv: businessType === "ecommerce" && gmv ? parseFloat(gmv).toFixed(2) : null,
      orderCount: businessType === "ecommerce" && orderCount ? parseInt(orderCount) : null,
    }});
  };

  const acc = accounts.find((a) => a.id === stat.accountId);

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
          {isFbSynced && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
              <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-400">
                此条数据由 FB 自动同步，<span className="font-medium">消耗金额不可修改</span>。可在此补充业务类型、团队等信息，修改后直接生效。
              </p>
            </div>
          )}
          {!isFbSynced && isApproved && (
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
              {!isFbSynced && <span className="text-destructive">*</span>}
              {!isFbSynced && isApproved && spendChanged && (
                <span className="ml-2 text-xs font-normal text-amber-400">修改后将触发审核</span>
              )}
            </Label>
            {isFbSynced ? (
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/50 text-sm font-mono text-muted-foreground">
                ${Number(stat.spendAmount).toFixed(2)}
                <span className="ml-2 text-xs text-blue-400/70">FB 数据</span>
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

        {/* ── 新增团队记录 ── */}
        {businessType === "liveChat" && (
          <div className="border-t border-border pt-3 mt-1">
            {!showAddTeam ? (
              <button
                type="button"
                onClick={() => setShowAddTeam(true)}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                为此账户新增另一个团队记录
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">新增团队记录（同账户同日期）</span>
                  <button type="button" onClick={() => { setShowAddTeam(false); setAddTeamId(""); setAddFanCount(""); setAddSpend(""); }}
                    className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">消耗金额（可选，仅作参考）</Label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input type="number" min="0" step="0.01" placeholder="0.00"
                        className="h-7 text-xs pl-5"
                        value={addSpend} onChange={(e) => setAddSpend(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">服务团队<span className="text-destructive">*</span></Label>
                    <Select value={addTeamId} onValueChange={setAddTeamId}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="选择..." /></SelectTrigger>
                      <SelectContent>{liveTeams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">进粉数量</Label>
                    <Input type="number" min="0" placeholder="0"
                      className="h-7 text-xs"
                      value={addFanCount} onChange={(e) => setAddFanCount(e.target.value)} />
                    {addFanCost && <p className="text-xs text-muted-foreground">粉成本 <span className="font-mono text-primary">${addFanCost}</span></p>}
                  </div>
                </div>
                <Button type="button" size="sm" className="h-7 text-xs w-full" onClick={handleAddTeam} disabled={addTeamCreate.isPending}>
                  {addTeamCreate.isPending ? "提交中..." : "添加团队记录"}
                </Button>
              </div>
            )}
          </div>
        )}

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
  const [hideZero, setHideZero] = useState(true);
  const [histPage, setHistPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const histApiParams: Record<string, string> = {};
  if (histDateRange.from) histApiParams.dateFrom = histDateRange.from;
  if (histDateRange.to) histApiParams.dateTo = histDateRange.to;
  if (histAccountFilter !== "all") histApiParams.accountId = histAccountFilter;

  const { data: histData, isLoading: histLoading } = useListDailyStats(histApiParams);
  const allHistStats = useMemo(() => Array.isArray(histData) ? (histData as DailyStat[]) : [], [histData]);

  // Group records by (accountId, date): main record (teamId=null) + team attribution records
  const histGroups = useMemo((): StatGroup[] => {
    const map = new Map<string, { main: DailyStat | null; teams: DailyStat[] }>();
    for (const s of allHistStats) {
      const key = `${s.accountId}-${s.date}`;
      if (!map.has(key)) map.set(key, { main: null, teams: [] });
      const g = map.get(key)!;
      if (s.teamId == null) g.main = s; else g.teams.push(s);
    }
    const groups: StatGroup[] = [];
    for (const [groupKey, { main, teams }] of map) {
      const anchor = main ?? teams[0];
      if (!anchor) continue;
      const displaySpend = main ? Number(main.spendAmount) : 0;
      const totalFans = teams.length > 0
        ? teams.reduce((s, t) => s + (t.fanCount ?? 0), 0)
        : (main?.fanCount ?? 0);
      const displayFanCost = displaySpend > 0 && totalFans > 0 ? (displaySpend / totalFans).toFixed(4) : null;
      groups.push({
        groupKey,
        date: anchor.date,
        accountId: anchor.accountId ?? 0,
        accountName: anchor.accountName ?? null,
        accountCurrentBalance: main?.accountCurrentBalance ?? anchor.accountCurrentBalance ?? null,
        main,
        teamRecords: teams,
        displaySpend,
        displayFans: totalFans,
        displayFanCost,
        displayBalance: main?.realBalance != null ? String(main.realBalance) : null,
        displayStatus: main?.status ?? teams[0]?.status ?? null,
        fbSynced: main?.fbSynced ?? false,
        businessType: main?.businessType ?? teams[0]?.businessType ?? null,
        reviewNote: main?.reviewNote ?? null,
      });
    }
    return groups.sort((a, b) => b.date.localeCompare(a.date));
  }, [allHistStats]);

  // Filter groups by status and hideZero
  const filteredGroups = useMemo(() => {
    let groups = [...histGroups];
    if (histStatusFilter === "pending") groups = groups.filter((g) => g.displayStatus === "pending" && !g.fbSynced);
    else if (histStatusFilter === "approved") groups = groups.filter((g) => g.displayStatus === "approved" && !g.fbSynced);
    else if (histStatusFilter === "rejected") groups = groups.filter((g) => g.displayStatus === "rejected");
    else if (histStatusFilter === "fb") groups = groups.filter((g) => g.fbSynced);
    // hideZero: hide groups with no spend AND no team records (pure zero entries)
    if (hideZero) groups = groups.filter((g) => g.displaySpend > 0 || g.teamRecords.length > 0);
    return groups;
  }, [histGroups, histStatusFilter, hideZero]);

  const pagedGroups = usePagination(filteredGroups, 20, histPage);
  const hasLive = filteredGroups.some((g) => g.businessType === "liveChat");
  const hasEcom = filteredGroups.some((g) => g.businessType === "ecommerce");
  const hasBiz = filteredGroups.some((g) => g.businessType != null);

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
    let failed = 0; let succeeded = 0; let duplicates = 0;
    for (const r of rows) {
      const totalSpend = parseFloat(r.spendAmount);
      // For liveChat with multiple teams, split into one record per team
      const isLive = r.businessType === "liveChat";
      const validTeamRows = isLive ? r.teamRows.filter((t) => t.teamId) : [];
      // When teams are specified: create one MAIN record (teamId=null) carrying total spend
      // (this is the one that deducts balance), plus attribution-only team records (spend=0).
      const submitEntries = isLive && validTeamRows.length > 0
        ? [
            // Main record — balance deduction happens here
            {
              accountId: Number(r.accountId),
              date: sharedDate,
              spendAmount: totalSpend.toFixed(2),
              businessType: "liveChat" as const,
              teamId: null,
              fanCount: null,
              gmv: null,
              orderCount: null,
            },
            // Team attribution records — no balance impact, just fanCount tracking
            ...validTeamRows.map((t) => ({
              accountId: Number(r.accountId),
              date: sharedDate,
              spendAmount: "0",
              businessType: "liveChat" as const,
              teamId: Number(t.teamId),
              fanCount: t.fanCount ? parseInt(t.fanCount) : null,
              gmv: null,
              orderCount: null,
            })),
          ]
        : [{
            accountId: Number(r.accountId),
            date: sharedDate,
            spendAmount: totalSpend.toFixed(2),
            businessType: (r.businessType as "liveChat" | "ecommerce") || null,
            teamId: null,
            fanCount: null,
            gmv: (r.businessType === "ecommerce" && r.gmv) ? parseFloat(r.gmv).toFixed(2) : null,
            orderCount: (r.businessType === "ecommerce" && r.orderCount) ? parseInt(r.orderCount) : null,
          }];

      for (const entry of submitEntries) {
        try {
          await new Promise<void>((resolve, reject) => {
            createMutation.mutate({ data: entry }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
          });
          succeeded++;
        } catch (e: unknown) {
          const msg = (e as { data?: { error?: string } })?.data?.error ?? "";
          if (msg.includes("已上报")) { duplicates++; toast({ title: "重复上报", description: msg, variant: "destructive" }); }
          else { failed++; }
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
                      const splitSpend = spend > 0 && n > 1 ? (spend / n).toFixed(2) : null;
                      return (
                        <>
                          {row.teamRows.map((sub, si) => {
                            const fanNum = parseInt(sub.fanCount) || 0;
                            const subSpend = splitSpend ? parseFloat(splitSpend) : spend;
                            const subFanCost = fanNum > 0 && subSpend > 0 ? (subSpend / fanNum).toFixed(4) : null;
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
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => addTeamRow(row.key)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                            >
                              <UserPlus className="h-3 w-3" /> 添加团队
                            </button>
                            {splitSpend && (
                              <span className="text-[10px] text-amber-500">消耗将均摊：每团队 ${splitSpend}</span>
                            )}
                          </div>
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
            <button
              onClick={() => { setHideZero((v) => !v); setHistPage(1); }}
              className={["h-8 px-2.5 rounded border text-xs transition-colors whitespace-nowrap", hideZero ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"].join(" ")}
            >
              隐藏零消耗
            </button>
            <QuickDateFilter onChange={(r) => { setHistDateRange(r); setHistPage(1); }} />
          </div>
        </div>

        {histLoading ? (
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
        ) : filteredGroups.length === 0 ? (
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
                  {pagedGroups.map((g, idx) => {
                    const isExpanded = expandedGroups.has(g.groupKey);
                    const hasTeams = g.teamRecords.length > 0;
                    const rowBg = g.displayStatus === "rejected" ? "bg-red-50/20 dark:bg-red-900/5" : idx % 2 === 1 ? "bg-muted/20" : "";
                    const editStat = g.main ?? g.teamRecords[0];
                    return (
                      <Fragment key={g.groupKey}>
                        {/* ── Main row ── */}
                        <TableRow className={rowBg}>
                          {/* Expand toggle */}
                          <TableCell className="py-3 px-1 w-6">
                            {hasTeams ? (
                              <button onClick={() => toggleGroup(g.groupKey)}
                                className="text-muted-foreground hover:text-primary transition-colors p-0.5">
                                {isExpanded
                                  ? <ChevronDown className="h-3.5 w-3.5" />
                                  : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-3 px-3">{g.date}</TableCell>
                          <TableCell className="font-medium text-sm py-3 px-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {g.fbSynced && <Facebook className="h-3 w-3 text-blue-400 shrink-0" />}
                              <TruncatedCell value={g.accountName ?? `#${g.accountId}`} maxWidth="max-w-[160px]" />
                              {hasTeams && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-primary/70 bg-primary/10 rounded px-1 py-0.5 shrink-0">
                                  <Users className="h-2.5 w-2.5" />{g.teamRecords.length}队
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-orange-500 whitespace-nowrap py-3 px-3">
                            ${g.displaySpend.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-3">
                            {g.accountCurrentBalance != null ? `$${Number(g.accountCurrentBalance).toFixed(2)}` : "—"}
                          </TableCell>
                          {hasBiz && (
                            <TableCell className="py-3 px-3">
                              {g.businessType ? <BizBadge biz={g.businessType} /> : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                          )}
                          {hasLive && (
                            <TableCell className="text-xs text-muted-foreground py-3 px-3">
                              {hasTeams
                                ? <span className="text-primary/60 italic text-[11px]">{isExpanded ? "收起" : "展开查看"}</span>
                                : (g.main?.teamName ?? "—")}
                            </TableCell>
                          )}
                          {hasLive && (
                            <TableCell className="text-right font-mono text-xs py-3 px-3">
                              {g.displayFans > 0 ? g.displayFans : "—"}
                            </TableCell>
                          )}
                          {hasLive && (
                            <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-3">
                              {g.displayFanCost ? `$${g.displayFanCost}` : "—"}
                            </TableCell>
                          )}
                          {hasEcom && (
                            <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-3">
                              {g.main?.gmv ? `$${Number(g.main.gmv).toFixed(2)}` : "—"}
                            </TableCell>
                          )}
                          {hasEcom && (
                            <TableCell className="text-right font-mono text-xs py-3 px-3">
                              {g.main?.roas ? Number(g.main.roas).toFixed(2) : "—"}
                            </TableCell>
                          )}
                          {hasEcom && (
                            <TableCell className="text-right font-mono text-xs py-3 px-3">{g.main?.orderCount ?? "—"}</TableCell>
                          )}
                          {hasEcom && (
                            <TableCell className="text-right font-mono text-xs whitespace-nowrap py-3 px-3">
                              {g.main?.avgOrderValue ? `$${Number(g.main.avgOrderValue).toFixed(2)}` : "—"}
                            </TableCell>
                          )}
                          <TableCell className="py-3 px-3">
                            {g.fbSynced ? (
                              <span className="flex items-center gap-1 text-xs text-blue-400 whitespace-nowrap"><Facebook className="h-3 w-3" />FB</span>
                            ) : g.displayStatus === "pending" ? (
                              <span className="flex items-center gap-1 text-xs text-amber-400 whitespace-nowrap"><Clock className="h-3 w-3" />待审</span>
                            ) : g.displayStatus === "rejected" ? (
                              <span className="flex items-center gap-1 text-xs text-red-400 whitespace-nowrap" title={g.reviewNote ?? ""}><XCircle className="h-3 w-3" />驳回</span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-emerald-500 whitespace-nowrap"><CheckCircle className="h-3 w-3" />通过</span>
                            )}
                          </TableCell>
                          <TableCell className="pr-2 py-3">
                            {editStat && (g.displayStatus === "rejected" ? (
                              <button onClick={() => setEditTarget(editStat)}
                                className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap">
                                <Pencil className="h-3 w-3" />修改
                              </button>
                            ) : (
                              <button onClick={() => setEditTarget(editStat)} className="text-muted-foreground hover:text-primary p-1 transition-colors block">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            ))}
                          </TableCell>
                        </TableRow>

                        {/* ── Team sub-rows (expanded) ── */}
                        {isExpanded && g.teamRecords.map((t) => {
                          const teamFanCost = g.displaySpend > 0 && (t.fanCount ?? 0) > 0
                            ? (g.displaySpend / t.fanCount!).toFixed(4) : null;
                          return (
                            <TableRow key={`team-${t.id}`} className="bg-primary/[0.03] border-l-2 border-l-primary/20">
                              <TableCell className="py-2 px-1" />
                              <TableCell className="py-2 px-3 text-xs text-muted-foreground/60">└</TableCell>
                              <TableCell className="py-2 px-3" colSpan={1}>
                                <span className="text-xs text-muted-foreground">{t.teamName ?? `团队 #${t.teamId}`}</span>
                              </TableCell>
                              {/* spend placeholder — team records have no independent spend */}
                              <TableCell className="py-2 px-3 text-right text-xs text-muted-foreground/40">—</TableCell>
                              <TableCell className="py-2 px-3" />
                              {hasBiz && <TableCell className="py-2 px-3" />}
                              {hasLive && <TableCell className="py-2 px-3 text-xs text-muted-foreground">{t.teamName ?? "—"}</TableCell>}
                              {hasLive && <TableCell className="py-2 px-3 text-right font-mono text-xs">{t.fanCount ?? "—"}</TableCell>}
                              {hasLive && (
                                <TableCell className="py-2 px-3 text-right font-mono text-xs whitespace-nowrap text-muted-foreground">
                                  {teamFanCost ? `$${teamFanCost}` : "—"}
                                </TableCell>
                              )}
                              {hasEcom && <TableCell className="py-2 px-3" />}
                              {hasEcom && <TableCell className="py-2 px-3" />}
                              {hasEcom && <TableCell className="py-2 px-3" />}
                              {hasEcom && <TableCell className="py-2 px-3" />}
                              <TableCell className="py-2 px-3">
                                {t.status === "pending" ? (
                                  <span className="flex items-center gap-1 text-[10px] text-amber-400"><Clock className="h-2.5 w-2.5" />待审</span>
                                ) : t.status === "approved" ? (
                                  <span className="flex items-center gap-1 text-[10px] text-emerald-500"><CheckCircle className="h-2.5 w-2.5" />通过</span>
                                ) : null}
                              </TableCell>
                              <TableCell className="py-2 pr-2">
                                <button onClick={() => setEditTarget(t)} className="text-muted-foreground/50 hover:text-primary p-1 transition-colors block">
                                  <Pencil className="h-3 w-3" />
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
            <TablePagination page={histPage} pageSize={20} total={filteredGroups.length} onPageChange={setHistPage} />
          </div>
        )}
      </div>

      {editTarget && (
        <EditDialog stat={editTarget} accounts={accounts} teams={teams} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}
