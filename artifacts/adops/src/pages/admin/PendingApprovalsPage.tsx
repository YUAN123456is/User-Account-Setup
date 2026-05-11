import { useState, useCallback } from "react";
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
  CheckCircle, XCircle, ClipboardList, Loader2, RefreshCw,
  User, CalendarDays, DollarSign, ChevronDown, ChevronRight,
} from "lucide-react";

interface PendingStat {
  id: number; accountId: number; accountName: string | null;
  date: string; spendAmount: string; realBalance: string;
  pitcherId: number; pitcherName: string | null;
  businessType: string | null; teamName: string | null;
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
              <span className="text-xs text-muted-foreground">
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
          {stat.teamName && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-14 shrink-0">服务团队</span>
              <span className="text-foreground font-medium">{stat.teamName}</span>
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
          {stat.reviewNote && (
            <div className="col-span-2 flex items-start gap-2 text-xs text-muted-foreground">
              <span className="w-14 shrink-0">备注</span>
              <span className="text-foreground">{stat.reviewNote}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PendingApprovalsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stats, setStats] = useState<PendingStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveTarget, setApproveTarget] = useState<PendingStat | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingStat | null>(null);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setStats(await api<PendingStat[]>("/api/daily-stats/pending")); }
    catch (e) { toast({ title: String(e instanceof Error ? e.message : "加载失败"), variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useState(() => { void load(); });

  const handleApprove = async () => {
    if (!approveTarget) return;
    setActing(true);
    try {
      await api(`/api/daily-stats/${approveTarget.id}/approve`, { method: "POST", body: JSON.stringify({ note }) });
      toast({ title: `已通过「${approveTarget.accountName}」的上报` });
      setApproveTarget(null); setNote("");
      await load();
      queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "操作失败"), variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!note.trim()) { toast({ title: "请填写驳回原因", variant: "destructive" }); return; }
    setActing(true);
    try {
      await api(`/api/daily-stats/${rejectTarget.id}/reject`, { method: "POST", body: JSON.stringify({ note }) });
      toast({ title: `已驳回「${rejectTarget.accountName}」的上报，消耗已回退` });
      setRejectTarget(null); setNote("");
      await load();
      queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : "操作失败"), variant: "destructive" });
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
                    onClick={async () => {
                      for (const s of pitcherStats) {
                        setApproveTarget(s);
                      }
                      // Batch approve all for this pitcher
                      setActing(true);
                      try {
                        for (const s of pitcherStats) {
                          await api(`/api/daily-stats/${s.id}/approve`, { method: "POST", body: JSON.stringify({ note: "" }) });
                        }
                        toast({ title: `已全部通过「${pitcherName}」的 ${pitcherStats.length} 条上报` });
                        await load();
                        queryClient.invalidateQueries({ queryKey: getListDailyStatsQueryKey({}) });
                      } catch (e) {
                        toast({ title: String(e instanceof Error ? e.message : "操作失败"), variant: "destructive" });
                      } finally { setActing(false); setApproveTarget(null); }
                    }}
                    disabled={acting}
                  >
                    <CheckCircle className="h-3 w-3" />全部通过
                  </Button>
                </div>
              </div>
              <div>
                {pitcherStats.map((s) => (
                  <StatRow key={s.id} stat={s} onApprove={(st) => { setApproveTarget(st); setNote(""); }} onReject={(st) => { setRejectTarget(st); setNote(""); }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approve dialog */}
      <Dialog open={!!approveTarget && !acting} onOpenChange={(o) => !o && setApproveTarget(null)}>
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
                <p className="text-muted-foreground text-xs">{approveTarget.date} · 消耗 ${Number(approveTarget.spendAmount).toFixed(2)}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">备注（可选）</label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="可填写审核意见..." rows={2} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>取消</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={handleApprove} disabled={acting}>
              {acting ? "处理中..." : "确认通过"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
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
                <p className="text-muted-foreground text-xs">{rejectTarget.date} · 消耗 ${Number(rejectTarget.spendAmount).toFixed(2)}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">驳回原因 <span className="text-destructive">*</span></label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="请说明驳回原因，投手可看到..." rows={3} className="resize-none" />
            </div>
            <p className="text-xs text-muted-foreground">
              驳回后该条消耗将从账户余额中回退，投手需重新提交。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleReject} disabled={acting || !note.trim()}>
              {acting ? "处理中..." : "确认驳回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
