import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import Home from "./pages/Home";
import MapPage from "./pages/MapPage";
import SubmitIssue from "./pages/SubmitIssue";
import IssueDetail from "./pages/IssueDetail";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AdminSettings from "./pages/AdminSettings";
import SignUp from "./pages/SignUp";
import SignIn from "./pages/SignIn";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ModerationPanel from "./pages/ModerationPanel";
import Settings from "./pages/Settings";
import ComponentShowcase from "./pages/ComponentShowcase";
import ChatPage from "./pages/ChatPage";
import Navbar from "./components/Navbar";
import { useLocation } from "wouter";

function Layout() {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/admin-dashboard") || location.startsWith("/admin/");

  return (
    <div className="flex flex-col min-h-screen">
      {!isAdminRoute && <Navbar />}
      <main className="flex-1">
        <Router />
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/map"} component={MapPage} />
      <Route path={"/submit"} component={SubmitIssue} />
      <Route path={"/issues/:id"} component={IssueDetail} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/admin-dashboard"} component={AdminDashboard} />
      <Route path={"/admin/settings"} component={AdminSettings} />
      <Route path={"/signup"} component={SignUp} />
      <Route path={"/signin"} component={SignIn} />
      <Route path={"/forgot-password"} component={ForgotPassword} />
      <Route path={"/reset-password"} component={ResetPassword} />
      <Route path={"/moderation"} component={ModerationPanel} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/chat"} component={ChatPage} />
      <Route path={"/showcase"} component={ComponentShowcase} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Layout />
        </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
