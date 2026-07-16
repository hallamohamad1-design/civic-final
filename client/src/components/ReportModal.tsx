import { useState } from "react";
import { Flag, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const REASONS = [
  "Spam or misleading",
  "Abusive or harmful content",
  "Harassment or bullying",
  "Fake or duplicate",
  "Other",
];

interface ReportModalProps {
  targetType: "account" | "report";
  targetId: number;
  targetLabel?: string;
  /** Render prop — receives open handler so caller can wire a button */
  trigger?: (open: () => void) => React.ReactNode;
}

export default function ReportModal({ targetType, targetId, targetLabel, trigger }: ReportModalProps) {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");

  const submitMutation = trpc.moderation.submitReport.useMutation({
    onSuccess: () => {
      toast.success("Report submitted. Thank you for helping keep CivicPulse safe.");
      setOpen(false);
      setReason("");
      setCustom("");
    },
    onError: (err) => {
      if (err.message.includes("already reported")) {
        toast.error("You've already reported this item.");
      } else {
        toast.error(err.message || "Failed to submit report.");
      }
    },
  });

  const handleOpen = () => {
    if (!isAuthenticated) {
      toast.error("Please sign in to report content.");
      return;
    }
    setOpen(true);
  };

  const handleSubmit = () => {
    const finalReason = reason === "Other" ? custom.trim() : reason;
    submitMutation.mutate({ targetType, targetId, reason: finalReason || undefined });
  };

  const label = targetLabel ?? (targetType === "account" ? "account" : "report");

  return (
    <>
      {trigger ? (
        trigger(handleOpen)
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"
          title={`Report this ${label}`}
        >
          <Flag className="h-3.5 w-3.5" />
          Report
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Flag className="h-5 w-5 text-red-500" />
                <h2 className="text-base font-bold text-slate-900">
                  Report {label}
                </h2>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-500">
                Why are you reporting this {label}? Your report is anonymous.
              </p>
              <div className="space-y-2">
                {REASONS.map((r) => (
                  <label key={r} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-primary cursor-pointer transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input
                      type="radio"
                      name="reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      className="accent-primary"
                    />
                    <span className="text-sm text-slate-700">{r}</span>
                  </label>
                ))}
              </div>

              {reason === "Other" && (
                <textarea
                  placeholder="Please describe the issue..."
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-5 pt-0">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600"
                disabled={!reason || submitMutation.isPending || (reason === "Other" && !custom.trim())}
                onClick={handleSubmit}
              >
                {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Report
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
