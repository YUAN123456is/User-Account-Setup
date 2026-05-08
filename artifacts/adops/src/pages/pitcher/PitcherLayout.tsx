import { ReactNode } from "react";
import { LayoutDashboard, CreditCard, BarChart3, PlusCircle, History } from "lucide-react";
import { Sidebar } from "@/components/shared/Sidebar";
import { useAuth } from "@/contexts/AuthContext";

export default function PitcherLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const items = [
    { label: "工作台", href: "/pitcher/dashboard", icon: LayoutDashboard },
    { label: "我的账户", href: "/pitcher/accounts", icon: CreditCard },
    { label: "每日上报", href: "/pitcher/report", icon: BarChart3 },
    { label: "申请充值", href: "/pitcher/recharge", icon: PlusCircle },
    { label: "上报记录", href: "/pitcher/history", icon: History },
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
