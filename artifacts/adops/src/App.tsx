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

function A(Layout: React.ComponentType<{ children: React.ReactNode }>, Page: React.ComponentType) {
  return () => <Layout><Page /></Layout>;
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
      {/* Admin routes — flat listing avoids Wouter v3 nested-context path stripping */}
      <Route path="/admin/dashboard" component={A(AdminLayout, DashboardPage)} />
      <Route path="/admin/users" component={A(AdminLayout, UsersPage)} />
      <Route path="/admin/accounts" component={A(AdminLayout, AccountsPage)} />
      <Route path="/admin/reports/provider" component={A(AdminLayout, ProviderReportPage)} />
      <Route path="/admin/reports/pitcher" component={A(AdminLayout, PitcherReportPage)} />
      <Route path="/admin/reports/cross" component={A(AdminLayout, CrossReportPage)} />
      <Route path="/admin/finance" component={A(AdminLayout, FinancePage)} />
      <Route path="/admin/alerts" component={A(AdminLayout, AlertsPage)} />
      <Route path="/admin">
        <Redirect to="/admin/dashboard" />
      </Route>

      {/* Provider routes */}
      <Route path="/provider/accounts" component={A(ProviderLayout, ProviderAccountsPage)} />
      <Route path="/provider/recharge-orders" component={A(ProviderLayout, ProviderRechargeOrdersPage)} />
      <Route path="/provider">
        <Redirect to="/provider/accounts" />
      </Route>

      {/* Pitcher routes */}
      <Route path="/pitcher/accounts" component={A(PitcherLayout, PitcherAccountsPage)} />
      <Route path="/pitcher/report" component={A(PitcherLayout, DailyReportPage)} />
      <Route path="/pitcher/recharge" component={A(PitcherLayout, RechargeRequestPage)} />
      <Route path="/pitcher/history" component={A(PitcherLayout, PitcherHistoryPage)} />
      <Route path="/pitcher">
        <Redirect to="/pitcher/accounts" />
      </Route>

      {/* Redirect authenticated users away from /login */}
      <Route path="/login">
        {user.role === "admin" ? <Redirect to="/admin/dashboard" /> :
         user.role === "provider" ? <Redirect to="/provider/accounts" /> :
         <Redirect to="/pitcher/accounts" />}
      </Route>

      {/* Root redirect by role */}
      <Route path="/">
        {user.role === "admin" ? <Redirect to="/admin/dashboard" /> :
         user.role === "provider" ? <Redirect to="/provider/accounts" /> :
         <Redirect to="/pitcher/accounts" />}
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
