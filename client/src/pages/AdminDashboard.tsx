import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Users, AlertTriangle, EyeOff, BarChart3, TrendingUp, Shield, Loader2, CalendarDays, RefreshCw, Download, LogOut } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import * as XLSX from "xlsx";
import { format, subDays, subMonths, isAfter } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function AdminDashboard() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);

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
    refetch: refetchStats,
  } = trpc.admin.getStats.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  // 2. Full issue list with user JOIN (for feed, charts, export)
  const {
    data: issues,
    isLoading: isIssuesLoading,
    refetch: refetchIssues,
  } = trpc.admin.getAllIssues.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  // 3. Hidden issues
  const {
    data: hiddenIssues,
    isLoading: hiddenLoading,
    refetch: refetchHidden,
  } = trpc.admin.getHiddenIssues.useQuery({}, {
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

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
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <span className="font-bold text-xl tracking-tight">CivicPulse Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-300 hidden md:block">Welcome, {user.name}</span>
            <Button variant="ghost" onClick={logout} className="text-red-400 hover:text-red-300 hover:bg-slate-800 transition-colors">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto py-8 px-4">
        {/* Page Title & Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-1">Dashboard Overview</h1>
            <p className="text-slate-500 dark:text-slate-400">
              Live data from your database — auto-refreshes every 30 seconds.
              {issues && <span className="ml-2 font-medium text-slate-700 dark:text-slate-300">({issues.length} total issues)</span>}
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
              {isSyncing ? "Syncing..." : "Sync Data"}
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

        {/* Stats Grid - Row 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Total Issues</p>
                  <p className="text-4xl font-bold mt-1">{totalIssues}</p>
                </div>
                <BarChart3 className="h-10 w-10 text-blue-200 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Today's Issues</p>
                  <p className="text-4xl font-bold mt-1">{todayIssues}</p>
                </div>
                <CalendarDays className="h-10 w-10 text-green-200 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Total Users</p>
                  <p className="text-4xl font-bold mt-1">{totalUsers}</p>
                </div>
                <Users className="h-10 w-10 text-purple-200 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium">Resolution Rate</p>
                  <p className="text-4xl font-bold mt-1">{resolvedRate}%</p>
                </div>
                <TrendingUp className="h-10 w-10 text-emerald-200 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stage Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Open</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{openCount}</p>
              <p className="text-xs text-slate-400 mt-1">{totalIssues > 0 ? Math.round((openCount / totalIssues) * 100) : 0}% of total</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-3 w-3 rounded-full bg-amber-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">In Progress</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{inProgressCount}</p>
              <p className="text-xs text-slate-400 mt-1">{totalIssues > 0 ? Math.round((inProgressCount / totalIssues) * 100) : 0}% of total</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-3 w-3 rounded-full bg-emerald-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Resolved</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{resolvedCount}</p>
              <p className="text-xs text-slate-400 mt-1">{totalIssues > 0 ? Math.round((resolvedCount / totalIssues) * 100) : 0}% of total</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts - Connected to Live Data */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Reports by Geographic Area</CardTitle>
              <CardDescription>Top 5 areas with most reported issues</CardDescription>
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
                AI Risk Level Breakdown
              </CardTitle>
              <CardDescription>Issues categorized by AI-detected risk</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <span className="font-medium text-red-700 dark:text-red-300">Critical</span>
                  <Badge variant="destructive">{criticalCount}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <span className="font-medium text-orange-700 dark:text-orange-300">High</span>
                  <Badge className="bg-orange-500 hover:bg-orange-600">{highCount}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <span className="font-medium text-yellow-700 dark:text-yellow-300">Medium</span>
                  <Badge className="bg-yellow-500 hover:bg-yellow-600">{mediumCount}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
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
                Hidden Issues
              </CardTitle>
              <CardDescription>Issues flagged and hidden from the public</CardDescription>
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
                <p className="text-center text-slate-400 py-8">No hidden issues</p>
              )}
            </CardContent>
          </Card>

          {/* Live Issue Feed */}
          <Card className="shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Live Issue Feed
                {issues && <Badge variant="secondary" className="ml-2">{issues.length} issues</Badge>}
              </CardTitle>
              <CardDescription>All reported civic issues from the database, newest first</CardDescription>
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
                      <div className="flex flex-col items-end gap-2 min-w-[120px]">
                        <Badge variant={issue.status === 'resolved' ? 'default' : issue.status === 'in-progress' ? 'secondary' : 'destructive'}>
                          {issue.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(issue.createdAt), "MMM d, yyyy HH:mm")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-400 py-8">No issues reported yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mt-6 shadow-sm">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Link href="/settings">
                <Button variant="outline" className="w-full justify-start gap-2">
                  ⚙️ Settings
                </Button>
              </Link>
              <Link href="/map">
                <Button variant="outline" className="w-full justify-start gap-2">
                  🗺️ View Map
                </Button>
              </Link>
              <Link href="/submit">
                <Button variant="outline" className="w-full justify-start gap-2">
                  📝 Submit Issue
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" className="w-full justify-start gap-2">
                  📊 User Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
