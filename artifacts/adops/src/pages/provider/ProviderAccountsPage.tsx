import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListAccounts, useCreateAccount, getListAccountsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountStatusBadge, PlatformBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { Plus, CreditCard } from "lucide-react";

interface Account {
  id: number;
  platformAccountId: string;
  accountName: string;
  platform: string;
  pitcherId?: number | null;
  pitcherName?: string | null;
  status: "idle" | "active" | "banned";
  currentBalance: string;
  lastReportedAt?: string | null;
}

const PLATFORMS = [
  { value: "FB", label: "Facebook" },
  { value: "GG", label: "Google" },
  { value: "TT", label: "TikTok" },
  { value: "TW", label: "Twitter" },
  { value: "OTHER", label: "其他" },
];

type Platform = "FB" | "GG" | "TT" | "TW" | "OTHER";
const BLANK = { platformAccountId: "", accountName: "", platform: "FB" as Platform, initialBalance: "" };

function CreateAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<{ platformAccountId: string; accountName: string; platform: Platform; initialBalance: string }>(BLANK);
  const [formError, setFormError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setForm(BLANK);
      setFormError("");
    }
  }, [open]);

  const create = useCreateAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey({}) });
        toast({ title: "账户已新增" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "新增失败，请重试";
        setFormError(msg);
      },
    },
  });

  const handleSubmit = () => {
    setFormError("");
    if (!form.platformAccountId.trim() || !form.accountName.trim()) {
      setFormError("平台账户ID和账户名称为必填项");
      return;
    }
    const balance = parseFloat(form.initialBalance);
    if (isNaN(balance) || balance < 0) {
      setFormError("请输入有效的初始余额（≥ 0）");
      return;
    }
    create.mutate({
      data: {
        platformAccountId: form.platformAccountId.trim(),
        accountName: form.accountName.trim(),
        platform: form.platform,
        initialBalance: balance.toFixed(2),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>新增广告账户</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm">平台账户ID <span className="text-destructive">*</span></Label>
            <Input
              value={form.platformAccountId}
              onChange={(e) => setForm({ ...form, platformAccountId: e.target.value })}
              placeholder="如：FB-123456"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">账户名称 <span className="text-destructive">*</span></Label>
            <Input
              value={form.accountName}
              onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              placeholder="如：美妆品牌推广账户"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">投放平台</Label>
            <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v as Platform })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">初始余额（USD）<span className="text-destructive">*</span></Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.initialBalance}
              onChange={(e) => setForm({ ...form, initialBalance: e.target.value })}
              placeholder="0.00"
            />
          </div>
          {formError && (
            <div className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {formError}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? "提交中..." : "新增账户"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProviderAccountsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = useListAccounts({});
  const accounts = Array.isArray(data) ? (data as unknown as Account[]) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">我的账户</h1>
          <p className="text-sm text-muted-foreground mt-0.5">您名下的广告账户列表</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> 新增账户
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>账户名称</TableHead>
              <TableHead>平台账户ID</TableHead>
              <TableHead>平台</TableHead>
              <TableHead>分配投手</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>余额</TableHead>
              <TableHead>最近上报</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && accounts.length === 0 && (
              <TableRow><TableCell colSpan={7}>
                <EmptyState
                  icon={CreditCard}
                  title="暂无账户"
                  description="点击右上角「新增账户」开始添加您的广告账户。"
                />
              </TableCell></TableRow>
            )}
            {!isLoading && accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium max-w-[180px] truncate">{a.accountName}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">{a.platformAccountId}</TableCell>
                <TableCell><PlatformBadge platform={a.platform} /></TableCell>
                <TableCell className="text-sm">
                  {a.pitcherName
                    ? <span className="text-foreground">{a.pitcherName}</span>
                    : <span className="text-amber-500 text-xs">待管理员分配</span>
                  }
                </TableCell>
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

      <CreateAccountDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
