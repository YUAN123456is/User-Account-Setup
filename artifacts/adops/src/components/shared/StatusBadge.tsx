import { Badge } from "@/components/ui/badge";

type AccountStatus = "idle" | "active" | "banned";
type RechargeStatus = "pending" | "completed" | "rejected";

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  if (status === "active") return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/20">运行中</Badge>;
  if (status === "banned") return <Badge variant="destructive">已封禁</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">空闲</Badge>;
}

export function RechargeStatusBadge({ status }: { status: RechargeStatus }) {
  if (status === "completed") return <Badge className="bg-green-500/15 text-green-600 border-green-500/30">已完成</Badge>;
  if (status === "rejected") return <Badge variant="destructive">已拒绝</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">待审核</Badge>;
}

export function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    FB: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    GG: "bg-red-500/15 text-red-600 border-red-500/30",
    TT: "bg-pink-500/15 text-pink-600 border-pink-500/30",
    TW: "bg-sky-500/15 text-sky-600 border-sky-500/30",
    OTHER: "bg-gray-500/15 text-gray-600 border-gray-500/30",
  };
  return <Badge className={colors[platform] ?? colors.OTHER}>{platform}</Badge>;
}
