import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TablePagination, usePagination } from "@/components/shared/TablePagination";
import { Plus, Edit, Trash2, Users, Search, Link2, Copy, Check, RefreshCw, Percent, ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { TruncatedCell } from "@/components/shared/TruncatedCell";

const DELETE_PASSWORD = "110112";

interface UserRow {
  id: number;
  username: string;
  displayName: string;
  role: string;
  portalSlug: string | null;
  magicToken: string | null;
  canAssignAccounts: boolean;
  isActive: boolean;
  feeRate: string | null;
  createdAt: string;
}

const PAGE_SIZE = 20;

function magicLinkUrl(token: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}p/${token}`;
}

function CopyLinkButton({ token, userId, onGenerated }: { token: string | null; userId: number; onGenerated: (token: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const doGenerate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/users/${userId}/magic-token`, { method: "POST", credentials: "include" });
      const body = await r.json() as { magicToken?: string; error?: string };
      if (!r.ok) throw new Error(body.error ?? "生成失败");
      onGenerated(body.magicToken!);
      await navigator.clipboard.writeText(magicLinkUrl(body.magicToken!));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const doCopy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(magicLinkUrl(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!token) {
    return (
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={doGenerate} disabled={loading} title="生成专属链接">
        {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={doCopy} title="复制专属链接">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function FeeRateEditor({ user }: { user: UserRow }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(user.feeRate ?? "");

  const update = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({}) });
        toast({ title: "手续费率已更新" });
        setOpen(false);
      },
      onError: () => {
        toast({ title: "更新失败", variant: "destructive" });
      },
    },
  });

  const handleSave = () => {
    const num = parseFloat(val);
    if (val !== "" && (isNaN(num) || num < 0 || num > 100)) {
      toast({ title: "请输入 0–100 之间的费率", variant: "destructive" });
      return;
    }
    update.mutate({ id: user.id, data: { feeRate: val === "" ? null : num.toFixed(2) } });
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(user.feeRate ?? ""); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
          <Percent className="h-3 w-3" />
          {user.feeRate ? `${user.feeRate}%` : "设置"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3 space-y-2" align="start">
        <p className="text-xs font-medium">手续费率（%）</p>
        <Input
          type="number"
          min="0"
          max="100"
          step="0.01"
          placeholder="如：2.50"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="h-7 text-sm"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
        <p className="text-xs text-muted-foreground">留空表示不收手续费</p>
        <div className="flex gap-1.5">
          <Button size="sm" className="h-7 flex-1 text-xs" onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "保存..." : "保存"}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(false)}>取消</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AssignPermToggle({ user }: { user: UserRow }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  const update = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({}) });
        setPending(false);
      },
      onError: () => {
        toast({ title: "权限更新失败", variant: "destructive" });
        setPending(false);
      },
    },
  });

  const toggle = () => {
    setPending(true);
    update.mutate({ id: user.id, data: { canAssignAccounts: !user.canAssignAccounts } });
  };

  return (
    <div className="flex items-center gap-1.5" title={user.canAssignAccounts ? "已开启：可分配空闲账户给其他投手" : "未开启：无账户分配权限"}>
      <Switch
        checked={user.canAssignAccounts}
        onCheckedChange={toggle}
        disabled={pending}
        className="scale-75 origin-left"
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap">分配权</span>
    </div>
  );
}

function CreateProviderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [formError, setFormError] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) { setDisplayName(""); setFormError(""); setCreatedLink(""); setCopiedLink(false); }
  }, [open]);

  const create = useCreateUser({
    mutation: {
      onSuccess: async (data) => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({}) });
        const user = data as UserRow;
        try {
          const r = await fetch(`/api/users/${user.id}/magic-token`, { method: "POST", credentials: "include" });
          const body = await r.json() as { magicToken?: string };
          if (body.magicToken) {
            setCreatedLink(magicLinkUrl(body.magicToken));
            queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({}) });
          }
        } catch {
          toast({ title: "用户已创建，但生成链接失败，可稍后在列表中重新生成", variant: "destructive" });
          onClose();
        }
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "创建失败，请重试";
        setFormError(msg);
      },
    },
  });

  const handleCreate = () => {
    setFormError("");
    if (!displayName.trim()) { setFormError("请填写显示名称"); return; }
    const ts = Date.now();
    const autoUsername = `provider_${ts}`;
    const autoPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    create.mutate({ data: { username: autoUsername, displayName: displayName.trim(), password: autoPassword, role: "provider" } });
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(createdLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (createdLink) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>开户商已创建</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">已为 <span className="font-semibold text-foreground">「{displayName}」</span> 生成专属链接，将链接复制并发给开户商，他们打开即可直接使用。</p>
            <div className="bg-muted rounded-lg px-3 py-2.5 flex items-center gap-2">
              <span className="flex-1 text-xs font-mono text-muted-foreground truncate">{createdLink}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copyLink}>
                {copiedLink ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
              请妥善保管此链接，任何持有该链接的人都可以直接登录此开户商账号。
            </p>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>新建开户商</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm">显示名称 <span className="text-destructive">*</span></Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="如：开户商A"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <p className="text-xs text-muted-foreground">创建后自动生成专属登录链接，发给开户商直接打开即可，无需账号密码。</p>
          {formError && <div className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{formError}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleCreate} disabled={create.isPending}>{create.isPending ? "创建中..." : "创建并生成链接"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreatePitcherDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ username: "", displayName: "", password: "" });
  const [formError, setFormError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) { setForm({ username: "", displayName: "", password: "" }); setFormError(""); }
  }, [open]);

  const create = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({}) });
        toast({ title: "投手账号已创建" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "创建失败，请重试";
        setFormError(msg);
      },
    },
  });

  const handleCreate = () => {
    setFormError("");
    if (!form.displayName.trim() || !form.username.trim() || !form.password.trim()) {
      setFormError("所有字段为必填项"); return;
    }
    create.mutate({ data: { username: form.username, displayName: form.displayName, password: form.password, role: "pitcher" } });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>新建投手</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm">显示名称 <span className="text-destructive">*</span></Label>
            <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="如：张三" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">用户名 <span className="text-destructive">*</span></Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="登录用户名" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">密码 <span className="text-destructive">*</span></Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="设置登录密码" />
          </div>
          {formError && <div className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{formError}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleCreate} disabled={create.isPending}>{create.isPending ? "创建中..." : "创建"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [form, setForm] = useState({ displayName: user.displayName, password: "", isActive: user.isActive });
  const [formError, setFormError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const update = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({}) });
        toast({ title: "用户已更新" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "更新失败，请重试";
        setFormError(msg);
      },
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>编辑 — {user.displayName}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm">显示名称</Label>
            <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          {user.role === "pitcher" && (
            <div className="space-y-1.5">
              <Label className="text-sm">新密码（留空则不修改）</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">状态</Label>
            <Select value={form.isActive ? "active" : "inactive"} onValueChange={(v) => setForm({ ...form, isActive: v === "active" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">启用</SelectItem>
                <SelectItem value="inactive">停用</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formError && <div className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{formError}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => update.mutate({ id: user.id, data: { displayName: form.displayName, password: form.password || undefined, isActive: form.isActive } })} disabled={update.isPending}>
            {update.isPending ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [pwd, setPwd] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const del = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({}) });
        toast({ title: "用户已删除" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "删除失败，请重试";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>确认删除用户</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            你确定要删除 <span className="font-semibold text-foreground">「{user.displayName}」</span> 吗？
          </p>
          {user.role === "provider" ? (
            <p className="text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded-md px-3 py-2">
              该用户是<strong>开户商</strong>，删除后其名下所有广告账户、每日数据及充值订单将被永久删除。
            </p>
          ) : (
            <p className="text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded-md px-3 py-2">
              该用户是<strong>投手</strong>，删除后其每日上报数据将被删除，已绑定账户将解除绑定。
            </p>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">请输入操作密码以确认</Label>
            <Input type="password" placeholder="操作密码" value={pwd} onChange={(e) => setPwd(e.target.value)} className={pwd && pwd !== DELETE_PASSWORD ? "border-destructive" : ""} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="destructive" onClick={() => del.mutate({ id: user.id })} disabled={del.isPending || pwd !== DELETE_PASSWORD}>
            {del.isPending ? "删除中..." : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const roleLabel: Record<string, string> = { provider: "开户商", pitcher: "投手", admin: "管理员" };

export default function UsersPage() {
  const [showCreateProvider, setShowCreateProvider] = useState(false);
  const [showCreatePitcher, setShowCreatePitcher] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [localTokens, setLocalTokens] = useState<Record<number, string>>({});

  const { data, isLoading } = useListUsers({ role: roleFilter === "all" ? undefined : (roleFilter as "provider" | "pitcher") });
  const allUsers = Array.isArray(data) ? (data as UserRow[]).filter((u) => u.role !== "admin") : [];

  const filtered = useMemo(() => {
    let rows = allUsers;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((u) => u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
    }
    if (statusFilter === "active") rows = rows.filter((u) => u.isActive);
    if (statusFilter === "inactive") rows = rows.filter((u) => !u.isActive);
    return rows;
  }, [allUsers, search, statusFilter]);

  const paged = usePagination(filtered, PAGE_SIZE, page);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> 新建用户 <ChevronDown className="h-3.5 w-3.5 ml-0.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowCreateProvider(true)}>
              <Link2 className="h-4 w-4 mr-2" /> 新建开户商
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowCreatePitcher(true)}>
              <Plus className="h-4 w-4 mr-2" /> 新建投手
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 w-56 text-sm" placeholder="搜索姓名或用户名..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
          {[
            { value: "all", label: "全部" },
            { value: "provider", label: "开户商" },
            { value: "pitcher", label: "投手" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setRoleFilter(opt.value); setPage(1); }}
              className={[
                "px-3 h-full text-xs font-medium transition-colors border-r border-border last:border-r-0",
                roleFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="active">启用</SelectItem>
            <SelectItem value="inactive">停用</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>显示名称</TableHead>
              <TableHead>用户名</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>配置</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-28">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => (
                <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
              ))}</TableRow>
            ))}
            {!isLoading && paged.length === 0 && (
              <TableRow><TableCell colSpan={7}><EmptyState icon={Users} title="暂无用户" description="点击右上角新建开户商或投手账号。" /></TableCell></TableRow>
            )}
            {!isLoading && paged.map((u) => {
              const effectiveToken = localTokens[u.id] ?? u.magicToken;
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium max-w-[140px]"><TruncatedCell value={u.displayName} /></TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm max-w-[140px]"><TruncatedCell value={u.username} /></TableCell>
                  <TableCell><Badge variant="outline">{roleLabel[u.role] ?? u.role}</Badge></TableCell>
                  <TableCell>
                    {u.isActive
                      ? <Badge className="bg-green-500/15 text-green-600 border-green-500/30">启用</Badge>
                      : <Badge variant="outline" className="text-muted-foreground">停用</Badge>}
                  </TableCell>
                  <TableCell>
                    {u.role === "provider" && <FeeRateEditor user={u} />}
                    {u.role === "pitcher" && <AssignPermToggle user={u} />}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      {u.role === "provider" && (
                        <CopyLinkButton
                          token={effectiveToken}
                          userId={u.id}
                          onGenerated={(tok) => setLocalTokens((prev) => ({ ...prev, [u.id]: tok }))}
                        />
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditUser(u)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteUser(u)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </div>

      {showCreateProvider && <CreateProviderDialog open={showCreateProvider} onClose={() => setShowCreateProvider(false)} />}
      {showCreatePitcher && <CreatePitcherDialog open={showCreatePitcher} onClose={() => setShowCreatePitcher(false)} />}
      {editUser && <EditDialog user={editUser} onClose={() => setEditUser(null)} />}
      {deleteUser && <DeleteConfirmDialog user={deleteUser} onClose={() => setDeleteUser(null)} />}
    </div>
  );
}
