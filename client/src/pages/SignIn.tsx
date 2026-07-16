import React from "react";
import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, Lock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function SignIn() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const loginMutation = trpc.auth.login.useMutation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const result = await loginMutation.mutateAsync({ 
        email: email.trim().toLowerCase(), 
        password 
      });
      
      if (result.success && result.user) {
        toast.success("Welcome back!");
        // Redirect based on user role
        if (result.user.role === "admin") {
          window.location.href = "/admin-dashboard";
        } else {
          window.location.href = "/dashboard";
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <Card className="w-full max-w-md shadow-lg dark:bg-slate-800 dark:border-slate-700">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-bold text-slate-900 dark:text-white">Sign In</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400 dark:text-slate-500" />
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder-slate-500"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400 dark:text-slate-500" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder-slate-500"
                  disabled={loading}
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-11 text-lg font-semibold" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              Sign In
            </Button>

            <div className="text-center mt-4 space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Don't have an account?{" "}
                <Link href="/signup" className="text-primary font-bold hover:underline">
                  Sign Up
                </Link>
              </p>
              <p>
                <Link href="/forgot-password" className="text-sm text-slate-500 dark:text-slate-400 hover:text-primary hover:underline">
                  Forgot password?
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
