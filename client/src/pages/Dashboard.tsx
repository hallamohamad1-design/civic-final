import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Edit2, Search } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import IssueCard from "@/components/IssueCard";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export default function Dashboard() {
  const { isAuthenticated, user } = useAuth();
  const { t } = useLanguage();
  const { data: userIssues = [], refetch } = trpc.issues.getByUser.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const deleteIssueMutation = trpc.issues.delete.useMutation();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filteredIssues = userIssues.filter((issue) => {
    const matchesSearch =
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.address.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || issue.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || issue.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const categories = Array.from(new Set(userIssues.map((i) => i.category)));

  const handleDelete = async (issueId: number) => {
    if (!confirm(t("dash.deleteConfirm"))) return;

    try {
      await deleteIssueMutation.mutateAsync(issueId);
      toast.success(t("dash.deleteSuccess"));
      refetch();
    } catch (error) {
      console.error("Failed to delete issue:", error);
      toast.error(t("dash.deleteFail"));
    }
  };

  const stats = {
    total: userIssues.length,
    open: userIssues.filter((i) => i.status === "open").length,
    inProgress: userIssues.filter((i) => i.status === "in-progress").length,
    resolved: userIssues.filter((i) => i.status === "resolved").length,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900">{t("dash.title")}</h1>
              <p className="text-slate-600 mt-2">
                {t("dash.desc")}
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/settings">
                <Button variant="outline" className="gap-2 whitespace-nowrap">
                  {t("nav.settings")}
                </Button>
              </Link>
              <Link href="/submit">
                <Button className="gap-2 whitespace-nowrap">
                  <Plus className="h-4 w-4" />
                  {t("dash.reportNew")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card className="border-none bg-white">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 font-medium">{t("dash.totalIssues")}</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{stats.total}</p>
            </CardContent>
          </Card>

          <Card className="border-none bg-white">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 font-medium">{t("dash.open")}</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{stats.open}</p>
            </CardContent>
          </Card>

          <Card className="border-none bg-white">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 font-medium">{t("dash.inProgress")}</p>
              <p className="text-3xl font-bold text-amber-600 mt-2">{stats.inProgress}</p>
            </CardContent>
          </Card>

          <Card className="border-none bg-white">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 font-medium">{t("dash.resolved")}</p>
              <p className="text-3xl font-bold text-emerald-600 mt-2">{stats.resolved}</p>
            </CardContent>
          </Card>
        </div>

        {/* Issues List */}
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-slate-900">{t("dash.yourIssues")}</h2>
            
            {userIssues.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder={t("map.search", "Search issues...")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-full sm:w-64 bg-white"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                >
                  <option value="all">{t("map.allStatus", "All Status")}</option>
                  <option value="open">{t("dash.open")}</option>
                  <option value="in-progress">{t("dash.inProgress")}</option>
                  <option value="resolved">{t("dash.resolved")}</option>
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 text-sm rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                >
                  <option value="all">{t("map.allCategories", "All Categories")}</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {userIssues.length > 0 ? (
            <div className="space-y-4">
              {filteredIssues.length > 0 ? (
                filteredIssues.map((issue) => (
                <div key={issue.id} className="relative">
                  <IssueCard issue={issue} />
                  <div className="absolute top-4 right-4 flex gap-2">
                    <Link href={`/issues/${issue.id}`}>
                      <Button size="sm" variant="outline" className="gap-1">
                        <Edit2 className="h-3 w-3" />
                        {t("dash.view")}
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(issue.id)}
                      disabled={deleteIssueMutation.isPending}
                      className="gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      {t("dash.delete")}
                    </Button>
                  </div>
                </div>
              ))
              ) : (
                <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
                  <p className="text-slate-500">{t("admin.noIssues", "No issues found matching your filters.")}</p>
                </div>
              )}
            </div>
          ) : (
            <Card className="border-none bg-white">
              <CardContent className="p-12 text-center">
                <div className="text-slate-400 mb-4">
                  <svg
                    className="h-16 w-16 mx-auto"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {t("dash.noIssuesTitle")}
                </h3>
                <p className="text-slate-600 mb-6">
                  {t("dash.noIssuesDesc")}
                </p>
                <Link href="/submit">
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t("dash.reportNew")}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
