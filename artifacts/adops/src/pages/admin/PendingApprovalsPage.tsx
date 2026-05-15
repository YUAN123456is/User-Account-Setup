import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListDailyStatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { BizBadge } from "@/components/shared/BizDisplay";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle, XCircle, Loader2, RefreshCw,
  User, CalendarDays, ChevronDown, ChevronRight, AlertTriangle,
} from "lucide-react";

interface TeamBreakdown { teamId: number; teamName: string; fanCount: number | null; }

interface PendingStat {
  id: number; accountId: number; accountName: string | null;
  date: string; spendAmount: string; realBalance: string;
  pitcherId: number; pitcherName: string | null;
  businessType: string | null;
  teamBreakdowns: TeamBreakdown[] | null;
  fanCount: number | null; fanCost: string | null;
  gmv: string | null; orderCount: number | null; roas: string | null;
  status: string; reviewNote: string | null; createdAt: string;
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const e = await res.json() as { error: string }; throw new Error(e.error); }
  return res.json();
}

function StatRow({
  stat,
  onApprove,
  onReject,
}: {
  stat: PendingStat;
  onApprove: (s: PendingStat) => void;
  onReject: (s: PendingStat) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-muted-foreground shrink-0">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>

        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {stat.accountName ?? `账户 #${stat.accountId}`}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
              <User className="h-3 w-3" />{stat.pitcherName ?? "—"}
              <CalendarDays className="h-3 w-3 ml-1" />{stat.date}
              <span className="text-muted-foreground/60">
                {new Date(stat.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </p>
          </div>

          <div className="text-right shrink-0">
            <p className="text-sm font-mono font-semibold text-orange-500">
              ${Number(stat.spendAmount).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              余额 ${Number(stat.realBalance).toFixed(2)}
            </p>
          </div>

          <div className="shrink-0">
            {stat.businessType && <BizBadge biz={stat.businessType} />}
          </div>

          <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              className="h-7 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
              onClick={() => onApprove(stat)}
            >
              <CheckCircle className="h-3.5 w-3.5" />通过
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => onReject(stat)}
            >
              <XCircle className="h-3.5 w-3.5" />驳回
            </Button>
          </div>
        </div>
      </div>

      {open && (
        <div className="px-8 pb-3 grid grid-cols-2 gap-x-6 gap-y-1.5 bg-muted/10">
          {stat.teamBreakdowns && stat.teamBreakdowns.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-14 shrink-0">服务团队</span>
              <span className="text-foreground font-medium">
                {stat.teamBreakdowns.map((t) => t.teamName).join("、")}
              </span>
            </div>
          )}
          {stat.fanCount != null && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-14 shrink-0">进粉数量</span>
              <span className="text-foreground font-medium">{stat.fanCount}</span>
              {stat.fanCost && <span className="text-muted-foreground">粉成本 ${Number(stat.fanCost).toFixed(2)}</span>}
            </div>
          )}
          {stat.gmv && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-14 shrink-0">GMV</span>
              <span className="text-foreground font-medium">${Number(stat.gmv).toFixed(2)}</span>
              {stat.roas && <span className="text-muted-foreground">ROAS {Number(stat.roas).toFixed(2)}</span>}
            </div>
          )}
          {stat.orderCount != null && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-14 shrink-0">订单数</span>
              <span className="text-foreground font-medium">{stat.orderCount}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Batch confirm dialog ──────────────────────────────────────────────────────
function BatchConfirmDialog({
  pitcherName,
  count,
  onConfirm,
  onCancel,
  loading,
}: {
  pitcherName: string; count: number;
  onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && !loading && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-500" />批量通过确认
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          将通过「<span className="text-foreground font-medium">{pitcherName}</span>」提交的全部 <span className="text-foreground font-semibold">{count}</span> 条上报记录，请确认数据无误后再操作。
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>取消</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1.5"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />批准中...</> : <>确认全部通过</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PendingApprovalsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stats, setStats] = useState<PendingStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveTarget, setApproveTarget] = useState<PendingStat | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingStat | null>(null);
  const [batchPitcher, setBatchPitcher] = useState<{ name: string; items: PendingStat[] } | null>(null);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setStats(await api<PendingStat[]>("/api/daily-stats/pending")); }
    catch (e) { toast({ title: String(e instanceof Error ? e.message : "加载失败"), variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  // ✅ Fixed: was incorrectly using useState(() => load())
  useEffect(() => { void load(); }, [load]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });

  const handleApprove = async () => {
    if (!approveTarget) return;
    setActing(true);
    try {
      await api(`/api/daily-stats/${approveTarget.id}/approve`, { method: "POST", body: JSON.stringify({ note }) });
      toast({ title: `已通过「${approveTarget.accountName}」的上报` });
      setApproveTarget(null); setNote("");
      await load(); invalidate();
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "操作失败"), variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setActing(true);
    try {
      await api(`/api/daily-stats/${rejectTarget.id}/reject`, { method: "POST", body: JSON.stringify({ note }) });
      toast({ title: `已驳回「${rejectTarget.accountName}」的上报，投手可修改后重新提交` });
      setRejectTarget(null); setNote("");
      await load(); invalidate();
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "操作失败"), variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleBatchApprove = async () => {
    if (!batchPitcher) return;
    setActing(true);
    try {
      await Promise.all(
        batchPitcher.items.map((s) =>
          api(`/api/daily-stats/${s.id}/approve`, { method: "POST", body: JSON.stringify({ note: "" }) })
        )
      );
      toast({ title: `已全部通过「${batchPitcher.name}」的 ${batchPitcher.items.length} 条上报` });
      setBatchPitcher(null);
      await load(); invalidate();
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "批量操作失败"), variant: "destructive" });
    } finally { setActing(false); }
  };

  // Group by pitcher
  const byPitcher: Record<string, PendingStat[]> = {};
  for (const s of stats) {
    const key = s.pitcherName ?? `#${s.pitcherId}`;
    if (!byPitcher[key]) byPitcher[key] = [];
    byPitcher[key].push(s);
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">待审核上报</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            投手手动填写的消耗数据需要逐条审核，FB 自动同步数据无需审核
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stats.length > 0 && (
            <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-sm px-2.5">
              {stats.length} 条待审核
            </Badge>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />刷新
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />加载中...
        </div>
      ) : stats.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="全部审核完毕"
          description="暂无待审核的上报数据，投手提交后将在此显示"
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(byPitcher).map(([pitcherName, pitcherStats]) => (
            <div key={pitcherName} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold">{pitcherName}</span>
                <Badge variant="secondary" className="text-xs h-4 px-1.5 ml-1">{pitcherStats.length} 条</Badge>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    className="h-6 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                    onClick={() => setBatchPitcher({ name: pitcherName, items: pitcherStats })}
                    disabled={acting}
                  >
                    <CheckCircle className="h-3 w-3" />全部通过
                  </Button>
                </div>
              </div>
              <div>
                {pitcherStats.map((s) => (
                  <StatRow
                    key={s.id}
                    stat={s}
                    onApprove={(st) => { setApproveTarget(st); setNote(""); }}
                    onReject={(st) => { setRejectTarget(st); setNote(""); }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Approve dialog — stays open during loading, shows spinner ── */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => { if (!o && !acting) { setApproveTarget(null); setNote(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />通过上报
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {approveTarget && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm space-y-0.5">
                <p className="font-medium">{approveTarget.accountName}</p>
                <p className="text-muted-foreground text-xs">
                  {approveTarget.date} · 投手 {approveTarget.pitcherName} · 消耗 ${Number(approveTarget.spendAmount).toFixed(2)}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">备注（可选，投手可见）</label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="可填写审核意见..."
                rows={2}
                className="resize-none"
                disabled={acting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setApproveTarget(null); setNote(""); }} disabled={acting}>
              取消
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1.5"
              onClick={handleApprove}
              disabled={acting}
            >
              {acting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />处理中...</> : "确认通过"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject dialog ── */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o && !acting) { setRejectTarget(null); setNote(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />驳回上报
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {rejectTarget && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm space-y-0.5">
                <p className="font-medium">{rejectTarget.accountName}</p>
                <p className="text-muted-foreground text-xs">
                  {rejectTarget.date} · 投手 {rejectTarget.pitcherName} · 消耗 ${Number(rejectTarget.spendAmount).toFixed(2)}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                驳回原因 <span className="text-destructive">*</span>
                <span className="text-xs text-muted-foreground font-normal ml-1">（投手会看到这条说明）</span>
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="请说明数据哪里有问题，方便投手修正后重新提交..."
                rows={3}
                className="resize-none"
                disabled={acting}
              />
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-600">
                驳回后投手可在历史记录中查看原因并修改重新提交。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setNote(""); }} disabled={acting}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={acting || !note.trim()}
              className="gap-1.5"
            >
              {acting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />处理中...</> : "确认驳回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Batch approve confirm ── */}
      {batchPitcher && (
        <BatchConfirmDialog
          pitcherName={batchPitcher.name}
          count={batchPitcher.items.length}
          onConfirm={handleBatchApprove}
          onCancel={() => !acting && setBatchPitcher(null)}
          loading={acting}
        />
      )}
    </div>
  );
}
