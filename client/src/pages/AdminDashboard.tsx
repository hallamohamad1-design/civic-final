import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Users, AlertTriangle, EyeOff, BarChart3, TrendingUp, Shield, Loader2, CalendarDays, RefreshCw, Download, LogOut, Bell, Check, Trash, CheckCheck } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import * as XLSX from "xlsx";
import { format, subDays, subMonths, isAfter } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function AdminDashboard() {
  const { user, loading, logout } = useAuth();
  const { t, isRTL } = useLanguage();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  
  // Notification State
  const { data: notifications, isLoading: isNotifLoading } = trpc.notifications.list.useQuery();
  const markReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate()
  });
  const clearAllMutation = trpc.notifications.clearAll.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      toast.success(t("admin.notificationsCleared") || "Notifications cleared");
    }
  });

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [riskFilter, setRiskFilter] = useState<string | undefined>(undefined);

  const isAdmin = !!user && user.role === "admin";

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate, isAdmin]);

  // ─── Live Data Queries ────────────────────────────────────────────
  // 1. Aggregated stats from dedicated server procedure (counts, status, risk)
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = trpc.admin.getStats.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 30_000, // auto-refresh every 30s
    retry: 2,
  });

  // 2. Full issue list with user JOIN (for feed, charts, export)
  const {
    data: issues,
    isLoading: isIssuesLoading,
    error: issuesError,
    refetch: refetchIssues,
  } = trpc.admin.getAllIssues.useQuery(
    { status: statusFilter, riskLevel: riskFilter },
    {
      enabled: isAdmin,
      refetchInterval: 30_000,
      retry: 2,
    }
  );

  // 3. Hidden issues
  const {
    data: hiddenIssues,
    isLoading: hiddenLoading,
    error: hiddenError,
    refetch: refetchHidden,
  } = trpc.admin.getHiddenIssues.useQuery({}, {
    enabled: isAdmin,
    refetchInterval: 30_000,
    retry: 2,
  });

  // ─── Mutations ────────────────────────────────────────────────────
  const updateStatusMutation = trpc.admin.updateStatus.useMutation({
    onSuccess: () => {
      utils.admin.getAllIssues.invalidate();
      utils.admin.getStats.invalidate();
    }
  });

  const handleUpdateStatus = (issueId: number, status: "open" | "in-progress" | "resolved") => {
    updateStatusMutation.mutate({ issueId, status });
  };

  // ─── Debug Logging ────────────────────────────────────────────────
  useEffect(() => {
    if (stats !== undefined) console.log("Admin Stats Fetched:", stats);
    if (statsError) console.error("Admin Stats Error:", statsError);
  }, [stats, statsError]);

  useEffect(() => {
    if (issues !== undefined) console.log("Admin Issues Fetched:", issues?.length, "issues", issues);
    if (issuesError) console.error("Admin Issues Error:", issuesError);
  }, [issues, issuesError]);

  useEffect(() => {
    if (hiddenIssues !== undefined) console.log("Admin Hidden Issues Fetched:", hiddenIssues?.length);
    if (hiddenError) console.error("Admin Hidden Issues Error:", hiddenError);
  }, [hiddenIssues, hiddenError]);

  // ─── Sync All Data ────────────────────────────────────────────────
  const isSyncing = statsLoading || isIssuesLoading || hiddenLoading;

  const handleSyncAll = () => {
    refetchStats();
    refetchIssues();
    refetchHidden();
  };

  // ─── Chart Computations (derived from live issues) ────────────────
  const areaData = useMemo(() => {
    if (!issues || issues.length === 0) return [];
    const counts: Record<string, number> = {};
    issues.forEach((i: any) => {
      const area = i.address ? i.address.split(',')[0].trim() : "Unknown";
      counts[area] = (counts[area] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [issues]);

  const statusData = useMemo(() => {
    if (!issues || issues.length === 0) return [];
    const localStats = {
      solved: issues.filter((i: any) => i.status === "resolved").length,
      inProgress: issues.filter((i: any) => i.status === "in-progress").length,
      pending: issues.filter((i: any) => i.status === "open").length,
    };
    return [
      { name: "Resolved", value: localStats.solved },
      { name: "In Progress", value: localStats.inProgress },
      { name: "Open", value: localStats.pending },
    ].filter(d => d.value > 0);
  }, [issues]);

  // ─── Excel Export (uses live data) ────────────────────────────────
  const handleExport = async (timeframe: "daily" | "monthly") => {
    // Force a fresh fetch before exporting
    const freshData = await refetchIssues();
    const exportSource = freshData.data ?? issues;
    if (!exportSource || exportSource.length === 0) return;

    const now = new Date();
    const cutoffDate = timeframe === "daily" ? subDays(now, 1) : subMonths(now, 1);

    const filteredIssues = exportSource.filter((i: any) => {
      const issueDate = new Date(i.createdAt);
      return isAfter(issueDate, cutoffDate);
    });

    const exportData = filteredIssues.map((i: any) => ({
      "User Name": i.userName || "Anonymous",
      "User Email": i.userEmail || "N/A",
      "Issue Category": i.category,
      "Issue Details": i.description,
      "Location/Coordinates": `${i.address || "N/A"} (${i.latitude}, ${i.longitude})`,
      "Status": i.status,
      "Severity": i.severity || "N/A",
      "Risk Level": i.riskLevel || "N/A",
      "Date Submitted": format(new Date(i.createdAt), "yyyy-MM-dd HH:mm:ss")
    }));

    if (exportData.length === 0) {
      alert(`No issues found in the ${timeframe === "daily" ? "last 24 hours" : "last 30 days"}.`);
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Issues Report");
    XLSX.writeFile(workbook, `civicpulse_report_${timeframe}_${format(now, "yyyyMMdd")}.xlsx`);
  };

  // ─── Loading / Auth Guard ─────────────────────────────────────────
  if (loading || !user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── Stat Values (from server aggregates) ─────────────────────────
  const totalIssues = stats?.totalIssues ?? 0;
  const todayIssues = stats?.todayIssues ?? 0;
  const totalUsers = stats?.totalUsers ?? 0;
  const openCount = stats?.byStatus?.["open"] ?? 0;
  const inProgressCount = stats?.byStatus?.["in-progress"] ?? 0;
  const resolvedCount = stats?.byStatus?.["resolved"] ?? 0;
  const resolvedRate = totalIssues > 0 ? Math.round((resolvedCount / totalIssues) * 100) : 0;
  const criticalCount = stats?.byRisk?.["critical"] ?? 0;
  const highCount = stats?.byRisk?.["high"] ?? 0;
  const mediumCount = stats?.byRisk?.["medium"] ?? 0;
  const lowCount = stats?.byRisk?.["low"] ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Admin Header */}
      <div className="bg-slate-900 text-white shadow-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg border border-primary/30">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-xl tracking-tight hidden sm:inline-block">{t("admin.title")}</span>
          </div>
          <div className="flex items-center gap-4">
            {/* Notification Bell */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative text-slate-300 hover:text-white hover:bg-slate-800">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 overflow-hidden" align="end">
                <div className="bg-slate-900 text-white p-3 flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    {t("admin.notifications") || "Notifications"}
                  </h3>
                  {notifications && notifications.length > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-[10px] hover:bg-slate-800 text-slate-400 hover:text-white"
                      onClick={() => clearAllMutation.mutate()}
                    >
                      <Trash className="h-3 w-3 mr-1" />
                      {t("admin.clearAll") || "Clear All"}
                    </Button>
                  )}
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {isNotifLoading ? (
                    <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></div>
                  ) : notifications && notifications.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.map((n) => (
                        <div 
                          key={n.id} 
                          className={`p-3 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer transition-colors ${!n.isRead ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                          onClick={() => {
                            if (!n.isRead) markReadMutation.mutate(n.id);
                            // If it's a new issue notification, we could navigate or filter
                            if (n.issueId) {
                              // Custom logic to focus on this issue
                              toast.info(t("admin.navigatingToIssue") || "Navigating to issue...");
                            }
                          }}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <p className={`text-xs ${!n.isRead ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                              {n.message}
                            </p>
                            {!n.isRead && <div className="h-2 w-2 rounded-full bg-primary mt-1 flex-shrink-0" />}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {format(new Date(n.createdAt), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs italic">
                      {t("admin.noNotifications") || "No notifications yet"}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <div className="text-right hidden md:block">
              <p className="text-sm font-medium leading-none">{user.name}</p>
              <p className="text-xs text-slate-400 mt-1">{user.email}</p>
            </div>
            <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white" onClick={() => logout()}>
              <LogOut className="h-4 w-4 mr-2" />
              {t("nav.logout")}
            </Button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {(statsError || issuesError || hiddenError) && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <div className="container mx-auto flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Dashboard data loading failed</p>
              <p className="text-xs text-red-600 mt-0.5">
                {statsError && <span>Stats: {statsError.message}. </span>}
                {issuesError && <span>Issues: {issuesError.message}. </span>}
                {hiddenError && <span>Hidden: {hiddenError.message}. </span>}
              </p>
            </div>
            <Button variant="outline" size="sm" className="text-red-600 border-red-300 hover:bg-red-100" onClick={handleSyncAll}>
              Retry
            </Button>
          </div>
        </div>
      )}

      <div className="container mx-auto py-8 px-4">
        {/* Page Title & Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{t("admin.sysPref")}</h1>
            <p className="text-slate-500 dark:text-slate-400">
              {t("admin.desc")}
              {issues && <span className="ml-2 font-medium text-slate-700 dark:text-slate-300">({issues.length} {t("dash.totalIssues")})</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {statsLoading && (
              <div className="flex items-center gap-2 text-slate-400 text-sm animate-pulse mr-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading stats...
              </div>
            )}
            
            <Button variant="outline" className="bg-white dark:bg-slate-800" onClick={handleSyncAll} disabled={isSyncing}>
              {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {isSyncing ? t("settings.syncing") : t("admin.syncDb")}
            </Button>
            
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
              <DialogTrigger asChild>
                <Button className="shadow-sm">
                  <Download className="mr-2 h-4 w-4" />
                  Generate Report
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Generate Data Report</DialogTitle>
                  <DialogDescription>
                    Select the timeframe for your export. The system will fetch the latest data before generating the Excel file.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3 mt-4">
                  <Button variant="outline" className="justify-start h-12 text-left px-4" onClick={() => { handleExport("daily"); setIsModalOpen(false); }}>
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-semibold">Daily Report</span>
                      <span className="text-xs text-muted-foreground font-normal">Last 24 hours of data</span>
                    </div>
                  </Button>
                  <Button variant="outline" className="justify-start h-12 text-left px-4" onClick={() => { handleExport("monthly"); setIsModalOpen(false); }}>
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-semibold">Monthly Report</span>
                      <span className="text-xs text-muted-foreground font-normal">Last 30 days of data</span>
                    </div>
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Active Filters Display */}
        {(statusFilter || riskFilter) && (
          <div className="flex items-center gap-3 mb-6 bg-slate-100 dark:bg-slate-800 p-3 rounded-lg border">
            <span className="text-sm font-medium text-slate-500">{t("admin.activeFilters")}:</span>
            {statusFilter && (
              <Badge variant="secondary" className="gap-1 pr-1 capitalize">
                {t("detail.status")}: {statusFilter}
                <button onClick={() => setStatusFilter(undefined)} className="ml-1 hover:text-red-500 font-bold">×</button>
              </Badge>
            )}
            {riskFilter && (
              <Badge variant="secondary" className="gap-1 pr-1 capitalize">
                {t("detail.riskLevel")}: {riskFilter}
                <button onClick={() => setRiskFilter(undefined)} className="ml-1 hover:text-red-500 font-bold">×</button>
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(undefined); setRiskFilter(undefined); }} className="text-xs text-slate-500 hover:text-primary">
              {t("admin.clearAll")}
            </Button>
          </div>
        )}

        {/* Summary Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card 
            className={`cursor-pointer transition-all hover:scale-[1.02] border-0 text-white shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 ${!statusFilter && !riskFilter ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}
            onClick={() => { setStatusFilter(undefined); setRiskFilter(undefined); }}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">{t("admin.totalIssues")}</p>
                  <p className="text-4xl font-bold mt-1">{totalIssues}</p>
                </div>
                <BarChart3 className="h-10 w-10 text-blue-200 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all hover:scale-[1.02] border-0 text-white shadow-lg bg-gradient-to-br from-amber-500 to-amber-600 ${statusFilter === 'open' ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
            onClick={() => setStatusFilter('open')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-sm font-medium">{t("admin.open")}</p>
                  <p className="text-4xl font-bold mt-1">{openCount}</p>
                </div>
                <AlertCircle className="h-10 w-10 text-amber-200 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all hover:scale-[1.02] border-0 text-white shadow-lg bg-gradient-to-br from-indigo-500 to-indigo-600 ${statusFilter === 'in-progress' ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}`}
            onClick={() => setStatusFilter('in-progress')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-indigo-100 text-sm font-medium">{t("admin.inProgress")}</p>
                  <p className="text-4xl font-bold mt-1">{inProgressCount}</p>
                </div>
                <TrendingUp className="h-10 w-10 text-indigo-200 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all hover:scale-[1.02] border-0 text-white shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600 ${statusFilter === 'resolved' ? 'ring-2 ring-emerald-400 ring-offset-2' : ''}`}
            onClick={() => setStatusFilter('resolved')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium">{t("admin.resolved")}</p>
                  <p className="text-4xl font-bold mt-1">{resolvedCount}</p>
                </div>
                <Shield className="h-10 w-10 text-emerald-200 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stage Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Card 
            className={`cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800 ${statusFilter === 'open' ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
            onClick={() => setStatusFilter('open')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("admin.open")}</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{openCount}</p>
              <p className="text-xs text-slate-400 mt-1">{totalIssues > 0 ? Math.round((openCount / totalIssues) * 100) : 0}% {t("general.ofTotal")}</p>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800 ${statusFilter === 'in-progress' ? 'ring-2 ring-amber-500 ring-offset-2' : ''}`}
            onClick={() => setStatusFilter('in-progress')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-3 w-3 rounded-full bg-amber-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("admin.inProgress")}</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{inProgressCount}</p>
              <p className="text-xs text-slate-400 mt-1">{totalIssues > 0 ? Math.round((inProgressCount / totalIssues) * 100) : 0}% {t("general.ofTotal")}</p>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800 ${statusFilter === 'resolved' ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}
            onClick={() => setStatusFilter('resolved')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-3 w-3 rounded-full bg-emerald-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("admin.resolved")}</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{resolvedCount}</p>
              <p className="text-xs text-slate-400 mt-1">{totalIssues > 0 ? Math.round((resolvedCount / totalIssues) * 100) : 0}% {t("general.ofTotal")}</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts - Connected to Live Data */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.recentIssues")}</CardTitle>
              <CardDescription>{t("admin.recentDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {isIssuesLoading ? (
                <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : areaData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={areaData}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Issue Status Distribution</CardTitle>
              <CardDescription>Breakdown of all issues by current status</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {isIssuesLoading ? (
                <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Risk Level Breakdown */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                {t("admin.riskBreakdown")}
              </CardTitle>
              <CardDescription>{t("admin.riskDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div 
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all hover:scale-[1.01] ${riskFilter === 'critical' ? 'bg-red-100 ring-1 ring-red-400' : 'bg-red-50 dark:bg-red-900/20'}`}
                  onClick={() => setRiskFilter('critical')}
                >
                  <span className="font-medium text-red-700 dark:text-red-300">Critical</span>
                  <Badge variant="destructive">{criticalCount}</Badge>
                </div>
                <div 
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all hover:scale-[1.01] ${riskFilter === 'high' ? 'bg-orange-100 ring-1 ring-orange-400' : 'bg-orange-50 dark:bg-orange-900/20'}`}
                  onClick={() => setRiskFilter('high')}
                >
                  <span className="font-medium text-orange-700 dark:text-orange-300">High</span>
                  <Badge className="bg-orange-500 hover:bg-orange-600">{highCount}</Badge>
                </div>
                <div 
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all hover:scale-[1.01] ${riskFilter === 'medium' ? 'bg-yellow-100 ring-1 ring-yellow-400' : 'bg-yellow-50 dark:bg-yellow-900/20'}`}
                  onClick={() => setRiskFilter('medium')}
                >
                  <span className="font-medium text-yellow-700 dark:text-yellow-300">Medium</span>
                  <Badge className="bg-yellow-500 hover:bg-yellow-600">{mediumCount}</Badge>
                </div>
                <div 
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all hover:scale-[1.01] ${riskFilter === 'low' ? 'bg-green-100 ring-1 ring-green-400' : 'bg-green-50 dark:bg-green-900/20'}`}
                  onClick={() => setRiskFilter('low')}
                >
                  <span className="font-medium text-green-700 dark:text-green-300">Low</span>
                  <Badge className="bg-green-500 hover:bg-green-600">{lowCount}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hidden Issues (Live) */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <EyeOff className="w-5 h-5" />
                {t("admin.hiddenIssues")}
              </CardTitle>
              <CardDescription>{t("admin.hiddenDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {hiddenLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (hiddenIssues && hiddenIssues.length > 0) ? (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {hiddenIssues.map((issue: any) => (
                    <div key={issue.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{issue.title}</p>
                        <p className="text-xs text-muted-foreground">{issue.category} - {issue.riskLevel}</p>
                      </div>
                      <Badge variant="outline">{issue.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-400 py-8">{t("admin.noHidden")}</p>
              )}
            </CardContent>
          </Card>

          {/* Live Issue Feed */}
          <Card className="shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                {t("admin.recentIssues")}
                {issues && <Badge variant="secondary" className="ml-2">{issues.length} {t("dash.totalIssues")}</Badge>}
              </CardTitle>
              <CardDescription>{t("admin.recentDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {isIssuesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : issues && issues.length > 0 ? (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {issues.map((issue: any) => (
                    <div key={issue.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-primary">{issue.userName || "Anonymous Reporter"}</span>
                          <Badge variant="outline">{issue.category}</Badge>
                          {issue.severity && (
                            <Badge variant={issue.severity === "high" ? "destructive" : issue.severity === "medium" ? "default" : "secondary"}>
                              {issue.severity}
                            </Badge>
                          )}
                          {issue.isHidden === 1 && (
                            <Badge variant="outline" className="text-orange-600 border-orange-300">Hidden</Badge>
                          )}
                        </div>
                        <p className="font-medium text-sm mb-1">{issue.title}</p>
                        <p className="text-sm text-muted-foreground line-clamp-2">{issue.description}</p>
                        {issue.userEmail && (
                          <p className="text-xs text-muted-foreground mt-1">📧 {issue.userEmail}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-3 min-w-[200px]">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 mb-1">{t("admin.statusMgmt")}</span>
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant={issue.status === 'open' ? 'default' : 'outline'} 
                              className={`h-7 px-2 text-xs ${issue.status === 'open' ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                              onClick={() => handleUpdateStatus(issue.id, 'open')}
                              disabled={updateStatusMutation.isPending}
                            >
                              Open
                            </Button>
                            <Button 
                              size="sm" 
                              variant={issue.status === 'in-progress' ? 'default' : 'outline'} 
                              className={`h-7 px-2 text-xs ${issue.status === 'in-progress' ? 'bg-blue-500 hover:bg-blue-600' : ''}`}
                              onClick={() => handleUpdateStatus(issue.id, 'in-progress')}
                              disabled={updateStatusMutation.isPending}
                            >
                              Progress
                            </Button>
                            <Button 
                              size="sm" 
                              variant={issue.status === 'resolved' ? 'default' : 'outline'} 
                              className={`h-7 px-2 text-xs ${issue.status === 'resolved' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}`}
                              onClick={() => handleUpdateStatus(issue.id, 'resolved')}
                              disabled={updateStatusMutation.isPending}
                            >
                              Resolve
                            </Button>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                          🕒 {format(new Date(issue.createdAt), "MMM d, HH:mm")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed">
                  <p className="text-slate-400 mb-2 font-medium">{t("admin.noMatch")}</p>
                  <Button variant="link" onClick={() => { setStatusFilter(undefined); setRiskFilter(undefined); }}>
                    {t("admin.clearMatch")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mt-6 shadow-sm border-2 border-primary/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t("admin.quickActions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link href="/admin/settings">
                <Button variant="outline" className="w-full justify-start gap-3 h-12 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all">
                  <div className="bg-primary/10 p-1.5 rounded-md">⚙️</div>
                  <div className="flex flex-col items-start leading-tight">
                    <span className="font-semibold">{t("admin.settings")}</span>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t("admin.sysPref")}</span>
                  </div>
                </Button>
              </Link>
              <Link href="/map">
                <Button variant="outline" className="w-full justify-start gap-3 h-12">
                  <div className="bg-slate-100 p-1.5 rounded-md">🗺️</div>
                  <span className="font-semibold">{t("admin.viewSysMap")}</span>
                </Button>
              </Link>
              <Button variant="outline" className="w-full justify-start gap-3 h-12" onClick={handleSyncAll} disabled={isSyncing}>
                <div className="bg-slate-100 p-1.5 rounded-md">{isSyncing ? "⏳" : "🔄"}</div>
                <span className="font-semibold">{isSyncing ? t("settings.syncing") : t("admin.syncDb")}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
