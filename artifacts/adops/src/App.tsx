import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";
import MagicLoginPage from "@/pages/MagicLoginPage";
import PublicFeedbackPage from "@/pages/PublicFeedbackPage";

import AdminLayout from "@/pages/admin/AdminLayout";
import DashboardPage from "@/pages/admin/DashboardPage";
import UsersPage from "@/pages/admin/UsersPage";
import TeamsPage from "@/pages/admin/TeamsPage";
import AccountsPage from "@/pages/admin/AccountsPage";
import ProviderReportPage from "@/pages/admin/ProviderReportPage";
import PitcherReportPage from "@/pages/admin/PitcherReportPage";
import OpsReportPage from "@/pages/admin/OpsReportPage";
import CrossReportPage from "@/pages/admin/CrossReportPage";
import FinancePage from "@/pages/admin/FinancePage";
import AlertsPage from "@/pages/admin/AlertsPage";
import AdminTeamFeedbackPage from "@/pages/admin/AdminTeamFeedbackPage";
import PendingApprovalsPage from "@/pages/admin/PendingApprovalsPage";

import ProviderLayout from "@/pages/provider/ProviderLayout";
import ProviderAccountsPage from "@/pages/provider/ProviderAccountsPage";
import ProviderRechargeOrdersPage from "@/pages/provider/ProviderRechargeOrdersPage";

import PitcherLayout from "@/pages/pitcher/PitcherLayout";
import PitcherDashboardPage from "@/pages/pitcher/PitcherDashboardPage";
import PitcherAccountsPage from "@/pages/pitcher/PitcherAccountsPage";
import PitcherPoolPage from "@/pages/pitcher/PitcherPoolPage";
import DailyReportPage from "@/pages/pitcher/DailyReportPage";
import RechargeRequestPage from "@/pages/pitcher/RechargeRequestPage";
import TeamFeedbackPage from "@/pages/pitcher/TeamFeedbackPage";
import PitcherMetaTokensPage from "@/pages/pitcher/PitcherMetaTokensPage";

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

function makeAdminRoute(Page: React.ComponentType) {
  return function AdminRoute() {
    return (
      <RequireRole role="admin">
        <AdminLayout><Page /></AdminLayout>
      </RequireRole>
    );
  };
}

function makeProviderRoute(Page: React.ComponentType) {
  return function ProviderRoute() {
    return (
      <RequireRole role="provider">
        <ProviderLayout><Page /></ProviderLayout>
      </RequireRole>
    );
  };
}

function makePitcherRoute(Page: React.ComponentType) {
  return function PitcherRoute() {
    return (
      <RequireRole role="pitcher">
        <PitcherLayout><Page /></PitcherLayout>
      </RequireRole>
    );
  };
}

const AdminDashboardRoute = makeAdminRoute(DashboardPage);
const AdminUsersRoute = makeAdminRoute(UsersPage);
const AdminAccountsRoute = makeAdminRoute(AccountsPage);
const AdminTeamsRoute = makeAdminRoute(TeamsPage);
const AdminProviderReportRoute = makeAdminRoute(ProviderReportPage);
const AdminPitcherReportRoute = makeAdminRoute(PitcherReportPage);
const AdminOpsReportRoute = makeAdminRoute(OpsReportPage);
const AdminCrossReportRoute = makeAdminRoute(CrossReportPage);
const AdminFinanceRoute = makeAdminRoute(FinancePage);
const AdminAlertsRoute = makeAdminRoute(AlertsPage);
const AdminTeamFeedbackRoute = makeAdminRoute(AdminTeamFeedbackPage);
const AdminPendingApprovalsRoute = makeAdminRoute(PendingApprovalsPage);

const ProviderAccountsRoute = makeProviderRoute(ProviderAccountsPage);
const ProviderRechargeOrdersRoute = makeProviderRoute(ProviderRechargeOrdersPage);

const PitcherDashboardRoute = makePitcherRoute(PitcherDashboardPage);
const PitcherAccountsRoute = makePitcherRoute(PitcherAccountsPage);
const PitcherPoolRoute = makePitcherRoute(PitcherPoolPage);
const PitcherReportRoute = makePitcherRoute(DailyReportPage);
const PitcherRechargeRoute = makePitcherRoute(RechargeRequestPage);
const PitcherTeamFeedbackRoute = makePitcherRoute(TeamFeedbackPage);
const PitcherMetaTokensRoute = makePitcherRoute(PitcherMetaTokensPage);

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (window.location.pathname.match(/\/p\/[^/]+/)) {
    return <Route path="/p/:token" component={MagicLoginPage} />;
  }

  if (window.location.pathname.match(/\/feedback\/[^/]+/)) {
    return <Route path="/feedback/:token" component={PublicFeedbackPage} />;
  }

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
      <Route path="/admin/dashboard" component={AdminDashboardRoute} />
      <Route path="/admin/users" component={AdminUsersRoute} />
      <Route path="/admin/accounts" component={AdminAccountsRoute} />
      <Route path="/admin/teams" component={AdminTeamsRoute} />
      <Route path="/admin/reports/provider" component={AdminProviderReportRoute} />
      <Route path="/admin/reports/pitcher" component={AdminPitcherReportRoute} />
      <Route path="/admin/reports/ops" component={AdminOpsReportRoute} />
      <Route path="/admin/reports/cross" component={AdminCrossReportRoute} />
      <Route path="/admin/finance" component={AdminFinanceRoute} />
      <Route path="/admin/alerts" component={AdminAlertsRoute} />
      <Route path="/admin/team-feedback" component={AdminTeamFeedbackRoute} />
      <Route path="/admin/pending-approvals" component={AdminPendingApprovalsRoute} />
      <Route path="/admin">
        <Redirect to="/admin/dashboard" />
      </Route>

      <Route path="/provider/accounts" component={ProviderAccountsRoute} />
      <Route path="/provider/recharge-orders" component={ProviderRechargeOrdersRoute} />
      <Route path="/provider">
        <Redirect to="/provider/accounts" />
      </Route>

      <Route path="/pitcher/dashboard" component={PitcherDashboardRoute} />
      <Route path="/pitcher/accounts" component={PitcherAccountsRoute} />
      <Route path="/pitcher/pool" component={PitcherPoolRoute} />
      <Route path="/pitcher/report" component={PitcherReportRoute} />
      <Route path="/pitcher/recharge" component={PitcherRechargeRoute} />
      <Route path="/pitcher/team-feedback" component={PitcherTeamFeedbackRoute} />
      <Route path="/pitcher/meta-tokens" component={PitcherMetaTokensRoute} />
      <Route path="/pitcher">
        <Redirect to="/pitcher/dashboard" />
      </Route>

      <Route path="/login">
        <Redirect to={roleHome(user.role)} />
      </Route>

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
