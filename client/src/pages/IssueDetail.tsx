import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ThumbsUp, Calendar, AlertCircle, ArrowLeft, Star, Trash2, Pencil, X, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import StatusBadge from "@/components/StatusBadge";
import CategoryBadge from "@/components/CategoryBadge";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ReportModal from "@/components/ReportModal";

export default function IssueDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const { t } = useLanguage();

  const { data: issue, isLoading, refetch } = trpc.issues.getById.useQuery(Number(id));
  const upvoteMutation = trpc.issues.upvote.useMutation();
  const rateMutation = trpc.issues.rateResolution.useMutation();
  const deleteMutation = trpc.issues.delete.useMutation();
  const updateMutation = trpc.issues.update.useMutation();

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<"Roads" | "Water" | "Electricity" | "Sanitation" | "Other">("Roads");
  const [editSeverity, setEditSeverity] = useState<"low" | "medium" | "high">("medium");

  const openEdit = () => {
    if (!issue) return;
    setEditTitle(issue.title);
    setEditDescription(issue.description);
    setEditCategory(issue.category as "Roads" | "Water" | "Electricity" | "Sanitation" | "Other");
    setEditSeverity(issue.severity as "low" | "medium" | "high");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!issue) return;
    try {
      await updateMutation.mutateAsync({
        id: issue.id,
        title: editTitle.trim(),
        description: editDescription.trim(),
        category: editCategory,
        severity: editSeverity,
      });
      toast.success("Report updated successfully");
      setIsEditing(false);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update report");
    }
  };

  const handleDelete = async () => {
    if (!issue) return;
    if (!confirm("Are you sure you want to delete this report? This cannot be undone.")) return;
    try {
      await deleteMutation.mutateAsync(issue.id);
      toast.success("Report deleted");
      navigate("/map");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete report");
    }
  };

  const handleUpvote = async () => {
    if (!issue || hasUpvoted) return;

    if (!isAuthenticated) {
      toast.error(t("nav.login"));
      return;
    }

    try {
      await upvoteMutation.mutateAsync(issue.id);
      setHasUpvoted(true);
      toast.success("Vote recorded!");
    } catch (error: any) {
      console.error("Failed to upvote:", error);
      const errorMessage = error?.message || "Failed to upvote. Please try again.";
      toast.error(errorMessage);
    }
  };

  const handleRate = async () => {
    if (!issue || rating === 0) return;
    
    try {
      await rateMutation.mutateAsync({ id: issue.id, rating });
      toast.success(t("detail.ratingSuccess"));
      refetch();
    } catch (error: any) {
      console.error("Failed to rate:", error);
      toast.error(t("detail.ratingFail"));
    }
  };

  const handleMapReady = (map: any) => {
    if (issue) {
      const position: [number, number] = [parseFloat(issue.latitude), parseFloat(issue.longitude)];
      map.setView(position, 15);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-slate-500 font-medium">{t("general.loading")}</p>
        </div>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 font-medium mb-4">{t("dash.noIssuesTitle")}</p>
          <Button onClick={() => navigate("/map")} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("detail.back")}
          </Button>
        </div>
      </div>
    );
  }

  const severityColors = {
    low: "bg-green-100 text-green-800",
    medium: "bg-amber-100 text-amber-800",
    high: "bg-red-100 text-red-800",
  };

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900">Edit Report</h2>
              <button onClick={() => setIsEditing(false)} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Title</label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as "Roads" | "Water" | "Electricity" | "Sanitation" | "Other")}
                  className="w-full rounded-xl border border-slate-200 h-10 px-3 text-sm bg-white"
                >
                  {["Roads", "Water", "Electricity", "Sanitation", "Other"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Severity</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["low", "medium", "high"] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setEditSeverity(sev)}
                      className={`py-2 rounded-xl font-bold text-xs border transition-all ${
                        editSeverity === sev
                          ? sev === "low" ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                            : sev === "medium" ? "bg-amber-50 border-amber-300 text-amber-700"
                            : "bg-rose-50 border-rose-300 text-rose-700"
                          : "bg-white border-slate-200 text-slate-400"
                      }`}
                    >
                      {sev.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="rounded-xl min-h-[100px] resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <Button variant="outline" onClick={() => setIsEditing(false)} className="flex-1">Cancel</Button>
              <Button
                onClick={handleSaveEdit}
                disabled={updateMutation.isPending || !editTitle.trim()}
                className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/map")}
            className="mb-4 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("detail.back")}
          </Button>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                {issue.title}
              </h1>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={issue.status} />
                <CategoryBadge category={issue.category} />
                <Badge className={severityColors[issue.severity as keyof typeof severityColors]}>
                  {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-start">
              {/* Owner actions */}
              {user?.id === issue.userId && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openEdit}
                    className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="gap-2 border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </Button>
                </>
              )}
              {/* Report button — visible to signed-in users who don't own this report */}
              {isAuthenticated && user?.id !== issue.userId && (
                <ReportModal
                  targetType="report"
                  targetId={issue.id}
                  targetLabel={`report "${issue.title}"`}
                  trigger={(open) => (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={open}
                      className="gap-2 border-orange-200 text-orange-600 hover:bg-orange-50"
                    >
                      Flag
                    </Button>
                  )}
                />
              )}
              <Button
                onClick={handleUpvote}
                disabled={hasUpvoted || upvoteMutation.isPending}
                className="gap-2 whitespace-nowrap"
              >
                <ThumbsUp className="h-4 w-4" />
                {t("detail.upvote")} ({issue.upvotes + (hasUpvoted ? 1 : 0)})
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-8">
            {/* Description */}
            <Card className="border-none bg-white overflow-hidden">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-4">{t("submit.description")}</h2>
                {issue.imageUrl && (
                  <div className="mb-6 rounded-2xl overflow-hidden shadow-lg border border-slate-100">
                    <img 
                      src={issue.imageUrl} 
                      alt={issue.title} 
                      className="w-full h-auto max-h-[500px] object-cover"
                    />
                  </div>
                )}
                <p className="text-slate-600 leading-relaxed">{issue.description}</p>
              </CardContent>
            </Card>

            {/* Map */}
            <Card className="border-none bg-white overflow-hidden">
              <CardContent className="p-0">
                <MapView
                  className="w-full h-96"
                  initialCenter={{ lat: parseFloat(issue.latitude), lng: parseFloat(issue.longitude) }}
                  initialZoom={15}
                  onMapReady={handleMapReady}
                  issues={[issue]}
                />
              </CardContent>
            </Card>

            {/* Location */}
            <Card className="border-none bg-white">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-4">{t("detail.location")}</h2>
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-slate-900">
                      {issue.address || `${Number(issue.latitude).toFixed(6)}, ${Number(issue.longitude).toFixed(6)}`}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      Coordinates: {issue.latitude}, {issue.longitude}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Satisfaction Rating (Only visible to reporter if resolved) */}
            {issue.status === "resolved" && user?.id === issue.userId && (
              <Card className="border-none bg-gradient-to-br from-indigo-50 to-purple-50 shadow-sm border border-indigo-100">
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold text-slate-900 mb-2">{t("detail.rateResolution")}</h2>
                  <p className="text-slate-600 mb-6">{t("detail.rateDesc")}</p>
                  
                  {issue.resolutionRating ? (
                    <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm inline-flex">
                      <div>
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">{t("detail.yourRating")}</p>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-6 w-6 ${star <= issue.resolutionRating! ? "text-amber-400 fill-amber-400" : "text-slate-200"}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                      <div className="flex flex-col items-center gap-6">
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setRating(star)}
                              onMouseEnter={() => setHoverRating(star)}
                              onMouseLeave={() => setHoverRating(0)}
                              className="focus:outline-none transition-transform hover:scale-110 active:scale-95"
                            >
                              <Star
                                className={`h-12 w-12 transition-colors ${
                                  star <= (hoverRating || rating)
                                    ? "text-amber-400 fill-amber-400"
                                    : "text-slate-200"
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                        <Button 
                          onClick={handleRate} 
                          disabled={rating === 0 || rateMutation.isPending}
                          className="w-full sm:w-auto px-8 bg-indigo-600 hover:bg-indigo-700"
                        >
                          {rateMutation.isPending ? t("general.loading") : t("detail.submitRating")}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Details Card */}
            <Card className="border-none bg-white">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t("detail.status")}
                    </p>
                    <p className="mt-1">
                      <StatusBadge status={issue.status} />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t("detail.category")}
                    </p>
                    <p className="mt-1">
                      <CategoryBadge category={issue.category} />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t("detail.severity")}
                    </p>
                    <p className="mt-1">
                      <Badge className={severityColors[issue.severity as keyof typeof severityColors]}>
                        {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t("detail.upvotes", "Upvotes")}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-primary">
                      {issue.upvotes + (hasUpvoted ? 1 : 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timeline Card */}
            <Card className="border-none bg-white">
              <CardContent className="p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Timeline</h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      Reported
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {new Date(issue.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      Last Updated
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {new Date(issue.updatedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
