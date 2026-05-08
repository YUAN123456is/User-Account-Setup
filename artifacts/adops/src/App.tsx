import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";

import AdminLayout from "@/pages/admin/AdminLayout";
import DashboardPage from "@/pages/admin/DashboardPage";
import UsersPage from "@/pages/admin/UsersPage";
import AccountsPage from "@/pages/admin/AccountsPage";
import ProviderReportPage from "@/pages/admin/ProviderReportPage";
import PitcherReportPage from "@/pages/admin/PitcherReportPage";
import CrossReportPage from "@/pages/admin/CrossReportPage";
import FinancePage from "@/pages/admin/FinancePage";
import AlertsPage from "@/pages/admin/AlertsPage";

import ProviderLayout from "@/pages/provider/ProviderLayout";
import ProviderAccountsPage from "@/pages/provider/ProviderAccountsPage";
import ProviderRechargeOrdersPage from "@/pages/provider/ProviderRechargeOrdersPage";

import PitcherLayout from "@/pages/pitcher/PitcherLayout";
import PitcherDashboardPage from "@/pages/pitcher/PitcherDashboardPage";
import PitcherAccountsPage from "@/pages/pitcher/PitcherAccountsPage";
import DailyReportPage from "@/pages/pitcher/DailyReportPage";
import RechargeRequestPage from "@/pages/pitcher/RechargeRequestPage";
import PitcherHistoryPage from "@/pages/pitcher/PitcherHistoryPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
});

function roleHome(role: string) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "provider") return "/provider/accounts";
  if (role === "pitcher") return "/pitcher/dashboard";
  return "/pitcher/accounts";
}

function RequireRole({ role, children }: { role: "admin" | "provider" | "pitcher"; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || user.role !== role) return <Redirect to={user ? roleHome(user.role) : "/login"} />;
  return <>{children}</>;
}

function AdminRoute(Layout: React.ComponentType<{ children: React.ReactNode }>, Page: React.ComponentType) {
  return () => (
    <RequireRole role="admin">
      <Layout><Page /></Layout>
    </RequireRole>
  );
}

function ProviderRoute(Layout: React.ComponentType<{ children: React.ReactNode }>, Page: React.ComponentType) {
  return () => (
    <RequireRole role="provider">
      <Layout><Page /></Layout>
    </RequireRole>
  );
}

function PitcherRoute(Layout: React.ComponentType<{ children: React.ReactNode }>, Page: React.ComponentType) {
  return () => (
    <RequireRole role="pitcher">
      <Layout><Page /></Layout>
    </RequireRole>
  );
}

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(222,50%,8%)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-[hsl(215,20%,50%)] text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  return (
    <Switch>
      {/* Admin routes — only accessible to admin role */}
      <Route path="/admin/dashboard" component={AdminRoute(AdminLayout, DashboardPage)} />
      <Route path="/admin/users" component={AdminRoute(AdminLayout, UsersPage)} />
      <Route path="/admin/accounts" component={AdminRoute(AdminLayout, AccountsPage)} />
      <Route path="/admin/reports/provider" component={AdminRoute(AdminLayout, ProviderReportPage)} />
      <Route path="/admin/reports/pitcher" component={AdminRoute(AdminLayout, PitcherReportPage)} />
      <Route path="/admin/reports/cross" component={AdminRoute(AdminLayout, CrossReportPage)} />
      <Route path="/admin/finance" component={AdminRoute(AdminLayout, FinancePage)} />
      <Route path="/admin/alerts" component={AdminRoute(AdminLayout, AlertsPage)} />
      <Route path="/admin">
        <Redirect to="/admin/dashboard" />
      </Route>

      {/* Provider routes — only accessible to provider role */}
      <Route path="/provider/accounts" component={ProviderRoute(ProviderLayout, ProviderAccountsPage)} />
      <Route path="/provider/recharge-orders" component={ProviderRoute(ProviderLayout, ProviderRechargeOrdersPage)} />
      <Route path="/provider">
        <Redirect to="/provider/accounts" />
      </Route>

      {/* Pitcher routes — only accessible to pitcher role */}
      <Route path="/pitcher/dashboard" component={PitcherRoute(PitcherLayout, PitcherDashboardPage)} />
      <Route path="/pitcher/accounts" component={PitcherRoute(PitcherLayout, PitcherAccountsPage)} />
      <Route path="/pitcher/report" component={PitcherRoute(PitcherLayout, DailyReportPage)} />
      <Route path="/pitcher/recharge" component={PitcherRoute(PitcherLayout, RechargeRequestPage)} />
      <Route path="/pitcher/history" component={PitcherRoute(PitcherLayout, PitcherHistoryPage)} />
      <Route path="/pitcher">
        <Redirect to="/pitcher/dashboard" />
      </Route>

      {/* Redirect authenticated users away from /login */}
      <Route path="/login">
        <Redirect to={roleHome(user.role)} />
      </Route>

      {/* Root redirect by role */}
      <Route path="/">
        <Redirect to={roleHome(user.role)} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
