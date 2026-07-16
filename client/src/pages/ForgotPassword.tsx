import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, ArrowLeft, CheckCircle2, Lock, KeyRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [success, setSuccess] = useState(false);

  const requestResetMutation = trpc.auth.requestPasswordResetOtp.useMutation();
  const verifyOtpMutation = trpc.auth.verifyPasswordResetOtp.useMutation();
  const resetPasswordMutation = trpc.auth.resetPasswordWithToken.useMutation();

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    setLoading(true);
    try {
      await requestResetMutation.mutateAsync({ email: email.trim().toLowerCase() });
      setSubmitted(true);
      toast.success("Verification code sent to your email!");
    } catch (error: any) {
      // Even on error, show the submitted state to protect user privacy
      setSubmitted(true);
      toast.success("Verification code sent to your email!");
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      toast.error("Please enter a valid 6-digit OTP code");
      return;
    }
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
      // 1. Verify OTP to get reset token
      const verifyRes = await verifyOtpMutation.mutateAsync({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      });

      if (!verifyRes.success || !verifyRes.resetToken) {
        toast.error("Invalid or expired OTP");
        return;
      }

      // 2. Use reset token to set new password
      await resetPasswordMutation.mutateAsync({
        resetToken: verifyRes.resetToken,
        newPassword,
      });

      toast.success("Password updated successfully!");
      setSuccess(true);
      setTimeout(() => {
        navigate("/signin");
      }, 3000);
    } catch (error: any) {
      toast.error(error.message || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-bold">Forgot Password</CardTitle>
          <CardDescription>
            {success
              ? "Password Updated"
              : submitted
              ? "Verify Code & Reset Password"
              : "Enter your email and we'll send you a verification code"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-6 text-center py-4">
              <div className="flex justify-center">
                <CheckCircle2 className="h-16 w-16 text-green-500 animate-bounce" />
              </div>
              <p className="text-slate-700 text-base leading-relaxed">
                Your password has been changed successfully. Redirecting you to Sign In…
              </p>
              <Link href="/signin">
                <Button className="w-full mt-2">Sign In Now</Button>
              </Link>
            </div>
          ) : submitted ? (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <p className="text-sm text-slate-600 text-center mb-4">
                If an account exists for <strong>{email}</strong>, we've sent a 6-digit OTP code.
              </p>

              <div className="space-y-2">
                <label className="text-sm font-medium">Verification Code (OTP)</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <Input
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    className="pl-10 text-center tracking-widest font-semibold text-lg"
                    disabled={loading}
                    autoFocus
                  />
                </div>
              </div>

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
                disabled={loading || !otp || !newPassword || newPassword !== confirmPassword}
              >
                {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                Reset Password
              </Button>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="text-sm text-slate-600 hover:text-primary flex items-center justify-center gap-1 mx-auto"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Change Email Address
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRequestSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                    autoFocus
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-lg font-semibold"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                Send Verification Code
              </Button>

              <div className="text-center mt-2">
                <Link href="/signin">
                  <button
                    type="button"
                    className="text-sm text-slate-600 hover:text-primary flex items-center justify-center gap-1 mx-auto"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Sign In
                  </button>
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
