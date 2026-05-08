import { useState } from "react";
import { useListAccounts, useCreateRechargeOrder } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle } from "lucide-react";

interface Account { id: number; accountName: string; platform: string; }

export default function RechargeRequestPage() {
  const [form, setForm] = useState({ accountId: "", amount: "", note: "" });
  const { data: accountsData } = useListAccounts({});
  const accounts = Array.isArray(accountsData) ? (accountsData as Account[]) : [];
  const { toast } = useToast();

  const create = useCreateRechargeOrder({
    mutation: {
      onSuccess: () => {
        toast({ title: "充值申请已提交", description: "请等待开户商审核处理。" });
        setForm({ accountId: "", amount: "", note: "" });
      },
      onError: () => {
        toast({ title: "提交失败", description: "请稍后重试。", variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountId || !form.amount) {
      toast({ title: "请填写完整", description: "账户和充值金额为必填项。", variant: "destructive" });
      return;
    }
    create.mutate({
      data: {
        accountId: Number(form.accountId),
        amount: form.amount,
        note: form.note || undefined,
      },
    });
  };

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-xl font-bold">申请充值</h1>
        <p className="text-sm text-muted-foreground mt-0.5">向开户商提交账户充值申请</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-primary" />
            新建充值申请
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">选择账户 <span className="text-destructive">*</span></Label>
              <Select value={form.accountId} onValueChange={(v) => setForm({ ...form, accountId: v })}>
                <SelectTrigger><SelectValue placeholder="请选择账户..." /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.accountName}（{a.platform}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">充值金额（美元）<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">备注（选填）</Label>
              <Textarea
                placeholder="向开户商说明充值用途..."
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={3}
              />
            </div>

            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? "提交中..." : "提交申请"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
