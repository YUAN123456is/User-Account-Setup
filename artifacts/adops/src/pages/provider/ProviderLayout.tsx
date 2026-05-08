import { ReactNode } from "react";
import { CreditCard, Receipt } from "lucide-react";
import { Sidebar } from "@/components/shared/Sidebar";
import { useAuth } from "@/contexts/AuthContext";

export default function ProviderLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const items = [
    { label: "我的账户", href: "/provider/accounts", icon: CreditCard },
    { label: "充值订单", href: "/provider/recharge-orders", icon: Receipt },
  ];
  return (
    <div className="flex min-h-screen">
      <Sidebar title="AdOps" subtitle={user?.displayName ?? "开户商"} items={items} />
      <main className="flex-1 min-w-0 bg-background">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
