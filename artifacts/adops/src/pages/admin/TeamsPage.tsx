import { useState } from "react";
import { useListTeams, useCreateTeam, useUpdateTeam, useDeleteTeam, useGenerateTeamToken, getListTeamsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, Link2, Copy, RefreshCw } from "lucide-react";

interface Team { id: number; name: string; businessType: string; isActive: boolean; publicToken?: string | null; createdAt: string; }

const BIZ_LABELS: Record<string, string> = { liveChat: "聊单", ecommerce: "独立站" };
const BIZ_COLORS: Record<string, string> = { liveChat: "bg-purple-500/10 text-purple-400 border-purple-500/20", ecommerce: "bg-blue-500/10 text-blue-400 border-blue-500/20" };

function getPublicFeedbackUrl(token: string) {
  const base = window.location.origin;
  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}${basePath}/feedback/${token}`;
}

function TeamDialog({ team, onClose }: { team?: Team; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(team?.name ?? "");
  const [businessType, setBusinessType] = useState(team?.businessType ?? "liveChat");

  const create = useCreateTeam({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey({}) }); toast({ title: "团队已创建" }); onClose(); },
      onError: () => toast({ title: "创建失败", variant: "destructive" }),
    },
  });

  const update = useUpdateTeam({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey({}) }); toast({ title: "团队已更新" }); onClose(); },
      onError: () => toast({ title: "更新失败", variant: "destructive" }),
    },
  });

  const handleSave = () => {
    if (!name.trim()) { toast({ title: "请填写团队名称", variant: "destructive" }); return; }
    if (team) {
      update.mutate({ id: team.id, data: { name: name.trim() } });
    } else {
      create.mutate({ data: { name: name.trim(), businessType: businessType as "liveChat" | "ecommerce" } });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{team ? "编辑团队" : "新建团队"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-sm">团队名称 <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="输入团队名称..." autoFocus />
          </div>
          {!team && (
            <div className="space-y-1.5">
              <Label className="text-sm">投放业务 <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                {(["liveChat", "ecommerce"] as const).map((v) => (
                  <button key={v} onClick={() => setBusinessType(v)}
                    className={["flex-1 text-sm py-2 rounded-md border transition-colors", businessType === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"].join(" ")}>
                    {BIZ_LABELS[v]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">业务类型创建后无法修改</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={isPending}>{isPending ? "保存中..." : "保存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenDialog({ team, onClose }: { team: Team; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const generateToken = useGenerateTeamToken({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey({}) }); toast({ title: "链接已生成" }); },
      onError: () => toast({ title: "生成失败", variant: "destructive" }),
    },
  });

  const currentToken = team.publicToken;
  const feedbackUrl = currentToken ? getPublicFeedbackUrl(currentToken) : null;

  const copyLink = () => {
    if (!feedbackUrl) return;
    navigator.clipboard.writeText(feedbackUrl).then(() => toast({ title: "链接已复制" }));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>反馈链接 — {team.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {feedbackUrl ? (
            <>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">公开反馈链接（任何人无需登录即可提交）</Label>
                <div className="flex gap-2">
                  <Input value={feedbackUrl} readOnly className="text-xs font-mono" />
                  <Button variant="outline" size="sm" onClick={copyLink} className="shrink-0">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                <span>点击「重新生成」将使旧链接失效并生成新链接</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">该团队尚未生成反馈链接，点击下方按钮生成。</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>关闭</Button>
          <Button onClick={() => generateToken.mutate({ id: team.id })} disabled={generateToken.isPending}>
            {generateToken.isPending ? "生成中..." : currentToken ? "重新生成" : "生成链接"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Team | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Team | null>(null);
  const [tokenTarget, setTokenTarget] = useState<Team | null>(null);
  const [bizFilter, setBizFilter] = useState("all");

  const { data, isLoading } = useListTeams({});
  const allTeams = Array.isArray(data) ? (data as Team[]) : [];
  const filtered = bizFilter === "all" ? allTeams : allTeams.filter((t) => t.businessType === bizFilter);

  const deleteTeam = useDeleteTeam({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey({}) }); toast({ title: "团队已停用" }); setDeleteConfirm(null); },
      onError: () => toast({ title: "操作失败", variant: "destructive" }),
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">团队管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理聊单和独立站的投放团队</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> 新建团队
        </Button>
      </div>

      <div className="flex items-center rounded-md border border-border overflow-hidden h-8 w-fit">
        {[{ value: "all", label: "全部" }, { value: "liveChat", label: "聊单" }, { value: "ecommerce", label: "独立站" }].map((opt) => (
          <button key={opt.value} onClick={() => setBizFilter(opt.value)}
            className={["px-3 h-full text-xs font-medium transition-colors border-r border-border last:border-r-0",
              bizFilter === opt.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"].join(" ")}>
            {opt.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>团队名称</TableHead>
              <TableHead>投放业务</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>反馈链接</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6}><EmptyState icon={Users} title="暂无团队" description="点击「新建团队」添加第一个投放团队。" /></TableCell></TableRow>
            )}
            {!isLoading && filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-semibold">{t.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={BIZ_COLORS[t.businessType] ?? ""}>
                    {BIZ_LABELS[t.businessType] ?? t.businessType}
                  </Badge>
                </TableCell>
                <TableCell>
                  {t.isActive
                    ? <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">启用</Badge>
                    : <Badge variant="outline" className="text-xs text-muted-foreground">停用</Badge>}
                </TableCell>
                <TableCell>
                  {t.publicToken ? (
                    <button onClick={() => setTokenTarget(t)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <Link2 className="h-3 w-3" /> 查看链接
                    </button>
                  ) : (
                    <button onClick={() => setTokenTarget(t)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      生成链接
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {new Date(t.createdAt).toLocaleDateString("zh-CN")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditTarget(t)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteConfirm(t)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {showCreate && <TeamDialog onClose={() => setShowCreate(false)} />}
      {editTarget && <TeamDialog team={editTarget} onClose={() => setEditTarget(null)} />}
      {tokenTarget && <TokenDialog team={tokenTarget} onClose={() => setTokenTarget(null)} />}

      {deleteConfirm && (
        <Dialog open onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>停用团队</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">确认停用团队「{deleteConfirm.name}」？停用后投手将无法选择该团队，历史数据保留。</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>取消</Button>
              <Button variant="destructive" onClick={() => deleteTeam.mutate({ id: deleteConfirm.id })} disabled={deleteTeam.isPending}>
                {deleteTeam.isPending ? "停用中..." : "确认停用"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
