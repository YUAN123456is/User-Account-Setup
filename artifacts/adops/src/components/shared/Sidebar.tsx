import { Link, useLocation } from "wouter";
import { LucideIcon, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogout } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

interface SidebarProps {
  title: string;
  subtitle?: string;
  items: NavItem[];
}

export function Sidebar({ title, subtitle, items }: SidebarProps) {
  const [location, setLocation] = useLocation();
  const { setUser } = useAuth();
  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        setUser(null);
        setLocation("/");
      },
    },
  });

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-sidebar border-r border-sidebar-border min-h-screen">
      <div className="px-4 py-5 border-b border-sidebar-border">
        <div className="text-sidebar-primary font-bold text-lg tracking-tight">{title}</div>
        {subtitle && <div className="text-sidebar-foreground text-xs mt-0.5 opacity-70">{subtitle}</div>}
      </div>
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {items.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <a
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                data-testid={`nav-${item.href.replace(/\//g, "-")}`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="ml-auto bg-destructive text-destructive-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {item.badge}
                  </span>
                )}
              </a>
            </Link>
          );
        })}
      </nav>
      <div className="px-2 pb-4">
        <button
          onClick={() => logout.mutate()}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full transition-colors"
          data-testid="btn-logout"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>退出登录</span>
        </button>
      </div>
    </aside>
  );
}
