import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Clock, Ticket, CheckCheck, Filter, Eye } from "lucide-react";

type TicketStatus = "pending" | "completed";

interface TicketBase {
  id: number;
  typeLabel: string;
  pitcher: string;
  status: TicketStatus;
  createdAt: string;
  remark: string;
  completedNote: string | null;
  completedAt: string | null;
}

interface NewAccountTicket extends TicketBase {
  type: "new_account";
  platform: string;
  amount: string;
}

interface RebindBmTicket extends TicketBase {
  type: "rebind_bm";
  targetBm: string;
  account: string;
}

type Ticket = NewAccountTicket | RebindBmTicket;

const INIT_TICKETS: Ticket[] = [
  {
    id: 1, type: "new_account", typeLabel: "开新户", pitcher: "婧",
    status: "pending", createdAt: "2026-05-13 14:22",
    platform: "FB", amount: "$500", remark: "尽快处理，谢谢",
    completedNote: null, completedAt: null,
  },
  {
    id: 2, type: "rebind_bm", typeLabel: "换绑 BM", pitcher: "婧",
    status: "pending", createdAt: "2026-05-12 09:05",
    targetBm: "BM_002", account: "act_98765432\nact_11223344",
    remark: "", completedNote: null, completedAt: null,
  },
  {
    id: 3, type: "new_account", typeLabel: "开新户", pitcher: "Leo",
    status: "completed", createdAt: "2026-05-10 11:30",
    platform: "GG", amount: "$1000", remark: "",
    completedNote: "已完成，账户 ID：act_11112222", completedAt: "2026-05-11",
  },
  {
    id: 4, type: "rebind_bm", typeLabel: "换绑 BM", pitcher: "Leo",
    status: "completed", createdAt: "2026-05-09 16:48",
    targetBm: "BM_004", account: "act_55554321", remark: "紧急",
    completedNote: "已处理完成", completedAt: "2026-05-09",
  },
];

function StatusBadge({ status }: { status: TicketStatus }) {
  if (status === "completed")
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />已完成</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1 text-xs"><Clock className="h-3 w-3" />待处理</Badge>;
}

function TypeBadge({ type, label }: { type: string; label: string }) {
  return (
    <span className={[
      "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border",
      type === "new_account"
        ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
        : "bg-violet-500/10 text-violet-400 border-violet-500/20"
    ].join(" ")}>{label}</span>
  );
}

function DetailPanel({ ticket, onComplete }: { ticket: Ticket; onComplete: (id: number, note: string) => void }) {
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const handleConfirm = () => {
    setDone(true);
    setTimeout(() => {
      setDone(false);
      setConfirming(false);
      onComplete(ticket.id, note);
    }, 900);
  };

  return (
    <div className="space-y-4">
      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-xs text-muted-foreground mb-0.5">工单类型</p><TypeBadge type={ticket.type} label={ticket.typeLabel} /></div>
        <div><p className="text-xs text-muted-foreground mb-0.5">投手</p><p className="font-medium">{ticket.pitcher}</p></div>
        <div><p className="text-xs text-muted-foreground mb-0.5">提交时间</p><p>{ticket.createdAt}</p></div>
        <div><p className="text-xs text-muted-foreground mb-0.5">状态</p><StatusBadge status={ticket.status} /></div>
      </div>

      {/* 资料 */}
      <div className="rounded-lg bg-muted/40 px-3 py-3 space-y-2.5 text-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">工单资料</p>
        {ticket.type === "new_account" && (
          <>
            <div className="flex gap-8">
              <div><p className="text-xs text-muted-foreground">平台</p><p className="font-medium">{ticket.platform}</p></div>
              <div><p className="text-xs text-muted-foreground">初始金额</p><p className="font-mono font-medium">{ticket.amount}</p></div>
            </div>
          </>
        )}
        {ticket.type === "rebind_bm" && (
          <>
            <div><p className="text-xs text-muted-foreground">目标 BM</p><p className="font-mono">{ticket.targetBm}</p></div>
            <div><p className="text-xs text-muted-foreground">账户</p><p className="font-mono whitespace-pre-line">{ticket.account}</p></div>
          </>
        )}
        {ticket.remark && (
          <div><p className="text-xs text-muted-foreground">备注</p><p className="italic text-muted-foreground">"{ticket.remark}"</p></div>
        )}
      </div>

      {/* 完成区 */}
      {ticket.status === "completed" ? (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-sm space-y-1">
          <p className="text-xs text-emerald-400 font-medium">完成回复</p>
          <p className="text-emerald-300">{ticket.completedNote}</p>
          <p className="text-xs text-muted-foreground">完成时间：{ticket.completedAt}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <Label className="text-sm">完成回复（发给投手）</Label>
          <Textarea rows={3} placeholder="例：已完成，账户 ID：act_xxxxxxxx" value={note} onChange={e => setNote(e.target.value)} />
          <Button
            onClick={() => setConfirming(true)}
            disabled={done}
            className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {done ? <><CheckCheck className="h-4 w-4" />已标记完成</> : <><CheckCheck className="h-4 w-4" />标记为已完成</>}
          </Button>

          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>确认完成工单？</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">标记后投手将收到通知，此操作不可撤销。</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirming(false)}>取消</Button>
                <Button onClick={handleConfirm} className="bg-emerald-600 hover:bg-emerald-500 text-white">确认完成</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

export function ProviderTickets() {
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const [tickets, setTickets] = useState<Ticket[]>(INIT_TICKETS);
  const [selectedId, setSelectedId] = useState<number>(1);

  const filtered = filter === "all" ? tickets : tickets.filter(t => t.status === filter);
  const pending = tickets.filter(t => t.status === "pending").length;
  const selected = tickets.find(t => t.id === selectedId) ?? null;

  const handleComplete = (id: number, note: string) => {
    setTickets(prev => prev.map(t =>
      t.id === id ? { ...t, status: "completed" as TicketStatus, completedNote: note || "已处理完成", completedAt: "2026-05-13" } : t
    ));
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex h-screen">
      {/* Sidebar */}
      <div className="w-52 border-r border-border bg-card flex flex-col py-4 px-3 gap-1 shrink-0">
        <div className="text-xs font-semibold text-muted-foreground px-2 mb-2">开户商后台</div>
        {["账户管理", "充值订单"].map(item => (
          <div key={item} className="text-sm px-2 py-1.5 rounded-md text-muted-foreground hover:bg-muted cursor-pointer">{item}</div>
        ))}
        <div className="text-sm px-2 py-1.5 rounded-md bg-primary/10 text-primary font-medium flex items-center gap-2 cursor-pointer">
          <Ticket className="h-3.5 w-3.5" />工单管理
          {pending > 0 && (
            <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{pending}</span>
          )}
        </div>
      </div>

      {/* Ticket list */}
      <div className="w-72 border-r border-border flex flex-col shrink-0">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="font-bold flex items-center gap-1.5 text-sm"><Ticket className="h-4 w-4 text-primary" />投手工单</h1>
            {pending > 0 && <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">{pending} 待处理</Badge>}
          </div>
          <div className="flex gap-1">
            {(["all", "pending", "completed"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={["flex-1 text-xs py-1 rounded-md transition-colors", filter === f ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"].join(" ")}>
                {f === "all" ? "全部" : f === "pending" ? "待处理" : "已完成"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {filtered.map(t => (
            <button key={t.id} onClick={() => setSelectedId(t.id)}
              className={["w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors", selectedId === t.id ? "bg-muted/60 border-l-2 border-primary" : ""].join(" ")}>
              <div className="flex items-center justify-between mb-1">
                <TypeBadge type={t.type} label={t.typeLabel} />
                <StatusBadge status={t.status} />
              </div>
              <p className="text-sm font-medium mt-1">投手：{t.pitcher}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.createdAt}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">暂无工单</div>
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {selected ? (
          <div className="max-w-md">
            <div className="flex items-center gap-2 mb-5">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">工单详情 #{selected.id}</h2>
            </div>
            <DetailPanel key={selected.id} ticket={selected} onComplete={handleComplete} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Filter className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">选择左侧工单查看详情</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
