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

function AdminRoutes() {
  return (
    <AdminLayout>
      <Switch>
        <Route path="/admin/dashboard" component={DashboardPage} />
        <Route path="/admin/users" component={UsersPage} />
        <Route path="/admin/accounts" component={AccountsPage} />
        <Route path="/admin/reports/provider" component={ProviderReportPage} />
        <Route path="/admin/reports/pitcher" component={PitcherReportPage} />
        <Route path="/admin/reports/cross" component={CrossReportPage} />
        <Route path="/admin/finance" component={FinancePage} />
        <Route path="/admin/alerts" component={AlertsPage} />
        <Route path="/admin">
          <Redirect to="/admin/dashboard" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}

function ProviderRoutes() {
  return (
    <ProviderLayout>
      <Switch>
        <Route path="/provider/accounts" component={ProviderAccountsPage} />
        <Route path="/provider/recharge-orders" component={ProviderRechargeOrdersPage} />
        <Route path="/provider">
          <Redirect to="/provider/accounts" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </ProviderLayout>
  );
}

function PitcherRoutes() {
  return (
    <PitcherLayout>
      <Switch>
        <Route path="/pitcher/accounts" component={PitcherAccountsPage} />
        <Route path="/pitcher/report" component={DailyReportPage} />
        <Route path="/pitcher/recharge" component={RechargeRequestPage} />
        <Route path="/pitcher/history" component={PitcherHistoryPage} />
        <Route path="/pitcher">
          <Redirect to="/pitcher/accounts" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </PitcherLayout>
  );
}

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(222,50%,8%)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-[hsl(215,20%,50%)] text-sm">Loading...</span>
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
      <Route path="/admin/:rest*" component={AdminRoutes} />
      <Route path="/provider/:rest*" component={ProviderRoutes} />
      <Route path="/pitcher/:rest*" component={PitcherRoutes} />
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
