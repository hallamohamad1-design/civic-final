import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Flag, UserX, Trash2, CheckCheck,
  Loader2, Shield, ArrowLeft, User, FileText,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState } from "react";

// ── Confirmation Dialog ───────────────────────────────────────────────────────
function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
        </div>
        <p className="text-sm text-slate-600">{description}</p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button className={`flex-1 ${confirmClass ?? "bg-red-500 hover:bg-red-600"}`} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function ModerationPanel() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const isAdmin = user?.role === "admin" || user?.email === "admincivicpulse123@gmail.com";

  const { data: flagged = [], isLoading, refetch } = trpc.moderation.getFlaggedItems.useQuery(
    undefined,
    { enabled: isAdmin, refetchInterval: 30_000 },
  );

  const blockMutation = trpc.moderation.blockAccount.useMutation({
    onSuccess: () => {
      toast.success("Account blocked. User can no longer log in.");
      refetch();
      utils.moderation.getPendingFlagCount.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to block account."),
  });

  const deleteMutation = trpc.moderation.deleteReport.useMutation({
    onSuccess: () => {
      toast.success("Report deleted and removed from the platform.");
      refetch();
      utils.moderation.getPendingFlagCount.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to delete report."),
  });

  const dismissMutation = trpc.moderation.dismissFlag.useMutation({
    onSuccess: () => {
      toast.success("Flag dismissed — no action taken.");
      refetch();
      utils.moderation.getPendingFlagCount.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to dismiss flag."),
  });

  // Confirmation dialog state
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    description: string;
    label: string;
    action: () => void;
  }>({ open: false, title: "", description: "", label: "", action: () => {} });

  const openConfirm = (title: string, description: string, label: string, action: () => void) =>
    setConfirm({ open: true, title, description, label, action });

  const closeConfirm = () => setConfirm(c => ({ ...c, open: false }));

  // Auth guard
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Shield className="h-12 w-12 text-slate-300" />
        <p className="text-slate-500 font-medium">Admin access required.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        description={confirm.description}
        confirmLabel={confirm.label}
        onConfirm={() => { closeConfirm(); confirm.action(); }}
        onCancel={closeConfirm}
      />

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-slate-900 text-white shadow-md">
          <div className="container mx-auto px-4 h-16 flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-300 hover:text-white hover:bg-slate-800"
              onClick={() => navigate("/admin-dashboard")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="bg-red-500/20 p-2 rounded-lg border border-red-500/30">
                <Flag className="w-5 h-5 text-red-400" />
              </div>
              <span className="font-bold text-xl">Content Moderation</span>
            </div>
            {flagged.length > 0 && (
              <Badge className="bg-red-500 text-white ml-2">{flagged.length} flagged</Badge>
            )}
          </div>
        </div>

        <div className="container mx-auto py-8 px-4 max-w-4xl">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : flagged.length === 0 ? (
            <div className="text-center py-20 space-y-4">
              <CheckCheck className="h-16 w-16 text-emerald-400 mx-auto" />
              <h2 className="text-xl font-bold text-slate-700">All clear!</h2>
              <p className="text-slate-500">No flagged items require review right now.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-500 mb-6">
                Items below have received 3 or more moderation reports. Review and take action.
              </p>

              {(flagged as any[]).map((item) => {
                const isAccount = item.targetType === "account";
                const count = Number(item.reportCount ?? 0);

                return (
                  <Card key={`${item.targetType}-${item.targetId}`} className="border-none shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        {/* Icon + info */}
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          <div className={`p-2.5 rounded-xl flex-shrink-0 ${isAccount ? "bg-purple-100" : "bg-orange-100"}`}>
                            {isAccount
                              ? <User className="h-5 w-5 text-purple-600" />
                              : <FileText className="h-5 w-5 text-orange-600" />
                            }
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge variant="outline" className={isAccount ? "border-purple-300 text-purple-700" : "border-orange-300 text-orange-700"}>
                                {isAccount ? "Account" : "Civic Report"}
                              </Badge>
                              <Badge className="bg-red-100 text-red-700 border-none">
                                <Flag className="h-3 w-3 mr-1" />
                                {count} {count === 1 ? "report" : "reports"}
                              </Badge>
                              {isAccount && item.userBlocked && (
                                <Badge className="bg-slate-200 text-slate-600 border-none">Already blocked</Badge>
                              )}
                            </div>

                            {isAccount ? (
                              <div>
                                <p className="font-semibold text-slate-900 text-sm truncate">
                                  {item.userName || "(no name)"} &nbsp;·&nbsp;
                                  <span className="font-normal text-slate-500">{item.userEmail}</span>
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">User ID: {item.targetId}</p>
                              </div>
                            ) : (
                              <div>
                                <p className="font-semibold text-slate-900 text-sm truncate">{item.issueTitle || "(deleted)"}</p>
                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.issueDescription}</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Status: {item.issueStatus} · Report ID: {item.targetId}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          {isAccount ? (
                            <Button
                              size="sm"
                              className="bg-red-500 hover:bg-red-600 gap-1.5 text-xs"
                              disabled={blockMutation.isPending || !!item.userBlocked}
                              onClick={() =>
                                openConfirm(
                                  "Block this account?",
                                  `This will prevent "${item.userName || item.userEmail}" from logging in. This action can be reversed via the database.`,
                                  "Block Account",
                                  () => blockMutation.mutate({ userId: item.targetId }),
                                )
                              }
                            >
                              <UserX className="h-3.5 w-3.5" />
                              {item.userBlocked ? "Blocked" : "Block Account"}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="bg-red-500 hover:bg-red-600 gap-1.5 text-xs"
                              disabled={deleteMutation.isPending}
                              onClick={() =>
                                openConfirm(
                                  "Delete this report?",
                                  `This will permanently delete the civic report "${item.issueTitle}" and cannot be undone.`,
                                  "Delete Report",
                                  () => deleteMutation.mutate({ reportId: item.targetId }),
                                )
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete Report
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs text-slate-600"
                            disabled={dismissMutation.isPending}
                            onClick={() =>
                              dismissMutation.mutate({ targetType: item.targetType, targetId: item.targetId })
                            }
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
