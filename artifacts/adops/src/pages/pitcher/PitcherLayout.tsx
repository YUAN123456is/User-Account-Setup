import { ReactNode } from "react";
import { LayoutDashboard, CreditCard, BarChart3, UserCheck, MessageSquare, Facebook, Wallet } from "lucide-react";
import { Sidebar } from "@/components/shared/Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useListAccounts } from "@workspace/api-client-react";

export default function PitcherLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const canAssign = user?.canAssignAccounts ?? false;

  const { data } = useListAccounts({});
  const idleCount = canAssign
    ? (Array.isArray(data) ? (data as { pitcherId: number | null }[]).filter((a) => a.pitcherId === null).length : 0)
    : 0;

  const items = [
    { label: "工作台", href: "/pitcher/dashboard", icon: LayoutDashboard },
    { label: "我的账户", href: "/pitcher/accounts", icon: CreditCard },
    ...(canAssign
      ? [{ label: "账户分配", href: "/pitcher/pool", icon: UserCheck, badge: idleCount > 0 ? idleCount : undefined }]
      : []),
    { label: "每日上报", href: "/pitcher/report", icon: BarChart3 },
    { label: "申请充值", href: "/pitcher/recharge", icon: Wallet },
    { label: "团队反馈", href: "/pitcher/team-feedback", icon: MessageSquare },
    { label: "FB 账号配置", href: "/pitcher/meta-tokens", icon: Facebook },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar title="AdOps" subtitle={user?.displayName ?? "投手"} items={items} />
      <main className="flex-1 min-w-0 bg-background">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
