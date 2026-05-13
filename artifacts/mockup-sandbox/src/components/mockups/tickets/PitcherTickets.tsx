import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Clock, Plus, Ticket, ChevronDown, ChevronUp, FileText, RefreshCw } from "lucide-react";

const PROVIDERS = ["开户商 - 小王", "开户商 - 晓敏", "开户商 - 张总"];

const TICKET_TYPES = [
  { value: "new_account", label: "开新户" },
  { value: "rebind_bm", label: "换绑 BM" },
];

const PLATFORMS = ["FB", "GG", "TT", "TW"];

const MOCK_TICKETS = [
  {
    id: 1, type: "new_account", typeLabel: "开新户", provider: "开户商 - 小王",
    status: "completed", createdAt: "2026-05-10",
    platform: "FB", amount: "$500", remark: "尽快处理",
    completedNote: "已完成，账户 ID：act_12345678", completedAt: "2026-05-11",
  },
  {
    id: 2, type: "rebind_bm", typeLabel: "换绑 BM", provider: "开户商 - 晓敏",
    status: "pending", createdAt: "2026-05-12",
    targetBm: "BM_002", account: "act_98765432", remark: "",
    completedNote: null, completedAt: null,
  },
  {
    id: 3, type: "new_account", typeLabel: "开新户", provider: "开户商 - 张总",
    status: "pending", createdAt: "2026-05-13",
    platform: "GG", amount: "$1000", remark: "希望用张总名下的主体",
    completedNote: null, completedAt: null,
  },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 text-xs font-medium"><CheckCircle2 className="h-3 w-3" />已完成</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1 text-xs font-medium"><Clock className="h-3 w-3" />待处理</Badge>;
}

export function PitcherTickets() {
  const [tab, setTab] = useState("new");
  const [provider, setProvider] = useState("");
  const [ticketType, setTicketType] = useState("");

  // 开新户
  const [platform, setPlatform] = useState("");
  const [amount, setAmount] = useState("");
  const [newAcctRemark, setNewAcctRemark] = useState("");

  // 换绑BM
  const [targetBm, setTargetBm] = useState("");
  const [account, setAccount] = useState("");
  const [rebindRemark, setRebindRemark] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleSubmit = () => {
    if (!provider || !ticketType) return;
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setTab("history");
        setProvider(""); setTicketType("");
        setPlatform(""); setAmount(""); setNewAcctRemark("");
        setTargetBm(""); setAccount(""); setRebindRemark("");
      }, 1200);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex h-screen">
      {/* Sidebar */}
      <div className="w-52 border-r border-border bg-card flex flex-col py-4 px-3 gap-1 shrink-0">
        <div className="text-xs font-semibold text-muted-foreground px-2 mb-2">投手工作台</div>
        {["工作台", "我的账户", "每日上报", "申请充值", "团队反馈", "FB 账号配置"].map(item => (
          <div key={item} className="text-sm px-2 py-1.5 rounded-md text-muted-foreground hover:bg-muted cursor-pointer">{item}</div>
        ))}
        <div className="text-sm px-2 py-1.5 rounded-md bg-primary/10 text-primary font-medium flex items-center gap-2 cursor-pointer">
          <Ticket className="h-3.5 w-3.5" />提交工单
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          <div className="mb-5">
            <h1 className="text-xl font-bold flex items-center gap-2"><Ticket className="h-5 w-5 text-primary" />工单管理</h1>
            <p className="text-sm text-muted-foreground mt-0.5">向开户商提交开新户或换绑 BM 请求</p>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-5">
              <TabsTrigger value="new" className="gap-1.5"><Plus className="h-3.5 w-3.5" />提交新工单</TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5"><FileText className="h-3.5 w-3.5" />我的工单记录</TabsTrigger>
            </TabsList>

            {/* ---- 提交工单 ---- */}
            <TabsContent value="new">
              <div className="rounded-lg border border-border bg-card p-5 space-y-5">

                {/* ① 选开户商 */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">① 选择目标开户商</p>
                  <Select value={provider} onValueChange={setProvider}>
                    <SelectTrigger className="max-w-xs h-9"><SelectValue placeholder="选择开户商..." /></SelectTrigger>
                    <SelectContent>{PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                {/* ② 工单类型 */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">② 选择工单类型</p>
                  <div className="flex gap-3">
                    {TICKET_TYPES.map(t => (
                      <button
                        key={t.value}
                        onClick={() => setTicketType(t.value)}
                        className={[
                          "w-36 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all",
                          ticketType === t.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:border-muted-foreground/40"
                        ].join(" ")}
                      >{t.label}</button>
                    ))}
                  </div>
                </div>

                {/* ③ 资料 */}
                {ticketType === "new_account" && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">③ 填写资料</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm">广告平台 <span className="text-red-400">*</span></Label>
                        <Select value={platform} onValueChange={setPlatform}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="选择平台..." /></SelectTrigger>
                          <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">初始金额（美元）<span className="text-red-400">*</span></Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                          <Input className="pl-6 h-9" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
                        </div>
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-sm">备注</Label>
                        <Textarea rows={3} placeholder="其他要求，自由填写..." value={newAcctRemark} onChange={e => setNewAcctRemark(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                {ticketType === "rebind_bm" && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">③ 填写资料</p>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm">目标 BM <span className="text-red-400">*</span></Label>
                        <Input className="h-9" placeholder="要换绑的目标 BM ID 或名称，自由填写" value={targetBm} onChange={e => setTargetBm(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">账户 <span className="text-red-400">*</span></Label>
                        <Textarea rows={3} placeholder="涉及的广告账户，自由填写（可填多个）" value={account} onChange={e => setAccount(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">备注</Label>
                        <Textarea rows={2} placeholder="其他说明..." value={rebindRemark} onChange={e => setRebindRemark(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1 border-t border-border">
                  <Button onClick={handleSubmit} disabled={!provider || !ticketType || submitting} className="gap-1.5">
                    {submitting
                      ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />提交中...</>
                      : <><Ticket className="h-3.5 w-3.5" />提交工单</>
                    }
                  </Button>
                  {submitted && (
                    <span className="text-sm text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />已发送给开户商
                    </span>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ---- 工单记录 ---- */}
            <TabsContent value="history">
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>工单类型</TableHead>
                      <TableHead>开户商</TableHead>
                      <TableHead>提交时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="w-12">详情</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MOCK_TICKETS.map(t => (
                      <>
                        <TableRow key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                          <TableCell className="font-medium">{t.typeLabel}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.provider}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.createdAt}</TableCell>
                          <TableCell><StatusBadge status={t.status} /></TableCell>
                          <TableCell>
                            <span className="text-muted-foreground">
                              {expandedId === t.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </span>
                          </TableCell>
                        </TableRow>
                        {expandedId === t.id && (
                          <TableRow key={`${t.id}-d`} className="bg-muted/20">
                            <TableCell colSpan={5} className="py-3 px-4 text-xs space-y-1.5 text-muted-foreground">
                              {t.type === "new_account" && <>
                                <p>平台：<span className="text-foreground font-medium">{t.platform}</span></p>
                                <p>初始金额：<span className="text-foreground font-mono">{t.amount}</span></p>
                              </>}
                              {t.type === "rebind_bm" && <>
                                <p>目标 BM：<span className="text-foreground">{t.targetBm}</span></p>
                                <p>账户：<span className="text-foreground font-mono">{t.account}</span></p>
                              </>}
                              {t.remark && <p>备注：{t.remark}</p>}
                              {t.completedNote && <p className="text-emerald-400 pt-1">开户商回复：{t.completedNote}</p>}
                              {t.completedAt && <p>完成时间：{t.completedAt}</p>}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
