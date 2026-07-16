import React, { useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function useQueryParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const token = useQueryParam("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState("");

  const resetMutation = trpc.auth.resetPassword.useMutation();

  // No token in URL — show a clear error immediately
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="pt-10 pb-8 text-center space-y-4">
            <AlertCircle className="h-14 w-14 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-slate-800">Invalid Reset Link</h2>
            <p className="text-slate-600 text-sm">
              This link is missing a reset token. Please use the link from your email,
              or request a new one.
            </p>
            <Link href="/forgot-password">
              <Button className="w-full mt-2">Request New Link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await resetMutation.mutateAsync({ token, newPassword });
      setSuccess(true);
      setTimeout(() => navigate("/signin"), 3000);
    } catch (error: any) {
      const msg = error.message || "Something went wrong. Please try again.";
      setServerError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="pt-10 pb-8 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto animate-bounce" />
            <h2 className="text-2xl font-bold text-slate-800">Password Updated!</h2>
            <p className="text-slate-600">
              Your password has been changed successfully. Redirecting you to
              Sign In…
            </p>
            <Link href="/signin">
              <Button className="w-full mt-2">Sign In Now</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-bold">Set New Password</CardTitle>
          <CardDescription>
            Choose a strong password for your CivicPulse account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serverError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <Input
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10"
                  minLength={8}
                  disabled={loading}
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <Input
                  type="password"
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  minLength={8}
                  disabled={loading}
                />
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-lg font-semibold"
              disabled={loading || (!!confirmPassword && newPassword !== confirmPassword)}
            >
              {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              Update Password
            </Button>

            <div className="text-center mt-2">
              <Link href="/signin">
                <span className="text-sm text-slate-500 hover:text-primary cursor-pointer">
                  Back to Sign In
                </span>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
