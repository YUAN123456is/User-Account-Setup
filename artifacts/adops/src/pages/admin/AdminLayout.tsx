import { ReactNode } from "react";
import { LayoutDashboard, Users, CreditCard, BarChart3, Wallet, AlertTriangle } from "lucide-react";
import { Sidebar } from "@/components/shared/Sidebar";
import { useGetBalanceAlerts } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: alertsData } = useGetBalanceAlerts();
  const alertCount = Array.isArray(alertsData) ? alertsData.length : 0;

  const items = [
    { label: "数据看板", href: "/admin/dashboard", icon: LayoutDashboard },
    { label: "用户管理", href: "/admin/users", icon: Users },
    { label: "账户管理", href: "/admin/accounts", icon: CreditCard },
    { label: "开户商报表", href: "/admin/reports/provider", icon: BarChart3 },
    { label: "投手报表", href: "/admin/reports/pitcher", icon: BarChart3 },
    { label: "交叉报表", href: "/admin/reports/cross", icon: BarChart3 },
    { label: "财务管理", href: "/admin/finance", icon: Wallet },
    { label: "余额预警", href: "/admin/alerts", icon: AlertTriangle, badge: alertCount },
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
