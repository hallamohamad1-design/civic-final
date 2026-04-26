import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { RefreshCw, Download, FileSpreadsheet, MapPin } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { exportToExcel } from "@/lib/exportUtils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format } from "date-fns";

/**
 * Admin Dashboard - Restricted to admin users only
 * Displays live stats, charts, recent issues feed, and export functionality
 */
export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const utils = trpc.useUtils();
  
  // Queries
  const { data: dashboardData, isLoading: isDashboardLoading, refetch } = trpc.admin.getDashboardStats.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const exportQuery = trpc.admin.getExportData.useQuery;

  // Redirect non-admins to home
  if (!authLoading && (!user || user.role !== "admin")) {
    setLocation("/");
    return null;
  }

  if (authLoading || isDashboardLoading || !dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleExport = async (filter: "daily" | "monthly") => {
    try {
      const data = await utils.client.admin.getExportData.query({ filter });
      exportToExcel(data, `CivicPulse_Report_${filter}_${format(new Date(), "yyyy-MM-dd")}`);
    } catch (error) {
      console.error("Export failed", error);
    }
  };

  const { stats, areaDensity, statusBreakdown, recentFeed } = dashboardData;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Admin Dashboard</h1>
            <p className="text-muted-foreground">Live tracking of system issues and reports</p>
          </div>
          
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2">
                  <Download className="w-4 h-4" />
                  Download Report
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("daily")} className="cursor-pointer gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" /> Daily Report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("monthly")} className="cursor-pointer gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" /> Monthly Report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Live Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border-l-4 border-l-blue-500 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Solved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.solved}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">In-Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{stats.inProgress}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{stats.pending}</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Bar Chart - Area Density */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="w-5 h-5 text-primary" />
                Report Density by Location
              </CardTitle>
              <CardDescription>Areas with the highest concentration of reports</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={areaDensity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Pie Chart - Status Breakdown */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Issue Status Breakdown</CardTitle>
              <CardDescription>Percentage distribution of current statuses</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {statusBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Recent Feed Section */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Real-time Feed</CardTitle>
            <CardDescription>Latest reported issues across the city</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {recentFeed.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No recent issues found.</div>
              ) : (
                recentFeed.map((issue) => (
                  <div key={issue.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="mb-3 sm:mb-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-base">{issue.title}</h4>
                        <Badge variant="outline" className="text-xs bg-slate-100">{issue.category}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Reported by <span className="font-medium text-slate-700">{issue.reporterName || "Anonymous"}</span> on {format(new Date(issue.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <div>
                      {issue.status === "open" && <Badge variant="destructive" className="px-3 py-1">Pending</Badge>}
                      {issue.status === "in-progress" && <Badge className="bg-yellow-500 hover:bg-yellow-600 px-3 py-1">In Progress</Badge>}
                      {issue.status === "resolved" && <Badge className="bg-green-500 hover:bg-green-600 px-3 py-1">Solved</Badge>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
