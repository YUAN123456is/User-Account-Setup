import { ReactNode, useEffect, useState } from "react";
import { LayoutDashboard, Users, CreditCard, BarChart3, Wallet, AlertTriangle, UsersRound, TrendingUp, GitMerge, LineChart, MessageSquare, Facebook, ClipboardCheck } from "lucide-react";
import { Sidebar } from "@/components/shared/Sidebar";
import { useGetLowBalanceAlerts } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: alertsData } = useGetLowBalanceAlerts({ threshold: 100 });
  const alertCount = Array.isArray(alertsData) ? alertsData.length : 0;

  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    fetch("/api/daily-stats/pending")
      .then((r) => r.ok ? r.json() : [])
      .then((d: unknown[]) => setPendingCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
    const t = setInterval(() => {
      fetch("/api/daily-stats/pending")
        .then((r) => r.ok ? r.json() : [])
        .then((d: unknown[]) => setPendingCount(Array.isArray(d) ? d.length : 0))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const items = [
    { label: "数据看板", href: "/admin/dashboard", icon: LayoutDashboard },
    { label: "用户管理", href: "/admin/users", icon: Users },
    { label: "团队管理", href: "/admin/teams", icon: UsersRound },
    { label: "账户管理", href: "/admin/accounts", icon: CreditCard },
    { label: "开户商报表", href: "/admin/reports/provider", icon: BarChart3 },
    { label: "投手报表", href: "/admin/reports/pitcher", icon: LineChart },
    { label: "运营报表", href: "/admin/reports/ops", icon: TrendingUp },
    { label: "交叉报表", href: "/admin/reports/cross", icon: GitMerge },
    { label: "财务管理", href: "/admin/finance", icon: Wallet },
    { label: "余额预警", href: "/admin/alerts", icon: AlertTriangle, badge: alertCount },
    { label: "待审核上报", href: "/admin/pending-approvals", icon: ClipboardCheck, badge: pendingCount },
    { label: "FB 消耗数据", href: "/admin/fb-spend", icon: Facebook },
    { label: "团队反馈", href: "/admin/team-feedback", icon: MessageSquare },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar
        title="AdOps"
        subtitle={user?.displayName ?? "超级管理员"}
        items={items}
      />
      <main className="flex-1 min-w-0 bg-background">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
