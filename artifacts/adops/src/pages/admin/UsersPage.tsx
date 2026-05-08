import { useState } from "react";
import { useListUsers, useCreateUser, useUpdateUser } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Users } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

type Role = "provider" | "pitcher";

interface UserRow {
  id: number;
  username: string;
  displayName: string;
  role: string;
  portalSlug: string | null;
  isActive: boolean;
  createdAt: string;
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ username: "", displayName: "", password: "", role: "provider" as Role, portalSlug: "" });
  const [formError, setFormError] = useState("");
  const { toast } = useToast();

  const create = useCreateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "用户已创建" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "创建失败，请重试";
        setFormError(msg);
      },
    },
  });

  const handleCreate = () => {
    setFormError("");
    if (!form.displayName.trim() || !form.username.trim() || !form.password.trim()) {
      setFormError("显示名称、用户名和密码为必填项");
      return;
    }
    create.mutate({
      data: {
        username: form.username,
        displayName: form.displayName,
        password: form.password,
        role: form.role,
        portalSlug: form.portalSlug || undefined,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>新建用户</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm">显示名称 <span className="text-destructive">*</span></Label>
            <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="如：开户商A" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">用户名 <span className="text-destructive">*</span></Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="登录用户名" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">密码 <span className="text-destructive">*</span></Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="设置登录密码" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">门户路径（slug）<span className="text-muted-foreground text-xs ml-1">选填</span></Label>
            <Input value={form.portalSlug} onChange={(e) => setForm({ ...form, portalSlug: e.target.value })} placeholder="如：provider-a" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">角色</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="provider">开户商</SelectItem>
                <SelectItem value="pitcher">投手</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formError && (
            <div className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {formError}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleCreate} disabled={create.isPending}>
            {create.isPending ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [form, setForm] = useState({ displayName: user.displayName, password: "", portalSlug: user.portalSlug ?? "", isActive: user.isActive });
  const update = useUpdateUser({ mutation: { onSuccess: onClose } });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>编辑用户 — {user.username}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm">显示名称</Label>
            <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">新密码（留空则不修改）</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">门户路径（slug）</Label>
            <Input value={form.portalSlug} onChange={(e) => setForm({ ...form, portalSlug: e.target.value })} />
          </div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={() => update.mutate({ id: user.id, data: { displayName: form.displayName, password: form.password || undefined, portalSlug: form.portalSlug || undefined, isActive: form.isActive } })}
            disabled={update.isPending}
          >
            {update.isPending ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const roleLabel: Record<string, string> = { provider: "开户商", pitcher: "投手", admin: "管理员" };

export default function UsersPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const { data, isLoading } = useListUsers({ role: undefined });

  const users = Array.isArray(data) ? (data as UserRow[]).filter((u: UserRow) => u.role !== "admin") : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">用户管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理开户商和投手账号</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> 新建用户
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>显示名称</TableHead>
              <TableHead>用户名</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>门户路径</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((__, j) => (
                  <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded w-24" /></TableCell>
                ))}
              </TableRow>
            ))}
            {!isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState icon={Users} title="暂无用户" description="点击右上角新建开户商或投手账号。" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && users.map((u: UserRow) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.displayName}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-sm">{u.username}</TableCell>
                <TableCell>
                  <Badge variant="outline">{roleLabel[u.role] ?? u.role}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-sm">{u.portalSlug ?? "—"}</TableCell>
                <TableCell>
                  {u.isActive
                    ? <Badge className="bg-green-500/15 text-green-600 border-green-500/30">启用</Badge>
                    : <Badge variant="outline" className="text-muted-foreground">停用</Badge>
                  }
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(u.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditUser(u)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {showCreate && <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} />}
      {editUser && <EditDialog user={editUser} onClose={() => setEditUser(null)} />}
    </div>
  );
}
