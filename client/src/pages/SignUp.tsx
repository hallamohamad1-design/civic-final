import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, Lock, User, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function SignUp() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"form" | "otp" | "success">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const registerMutation = trpc.auth.register.useMutation();
  const sendOtpMutation = trpc.auth.sendOtp.useMutation();
  const verifyOtpMutation = trpc.auth.verifyOtp.useMutation();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    setLoading(true);
    try {
      const result = await sendOtpMutation.mutateAsync({ email: email.trim().toLowerCase() });
      if (result.success) {
        toast.success("Account validation started!");
        if (result.demoOtp) {
          // Show the OTP directly in the UI for the demo
          toast.info(`Demo Mode OTP: ${result.demoOtp} (This code is only visible to you)`, {
            duration: 30000, // Increased to 30 seconds
            style: { fontSize: '18px', fontWeight: 'bold' }
          });
        }
        setStep("otp");
      } else {
        toast.error(result.error || "Failed to send OTP");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      // 1. Verify the OTP
      await verifyOtpMutation.mutateAsync({ email: email.trim().toLowerCase(), code: otp });
      
      // 2. If successful, register the user
      const result = await registerMutation.mutateAsync({ 
        name: name.trim(),
        email: email.trim().toLowerCase(), 
        password 
      });
      
      if (result.success) {
        toast.success("Account created successfully!");
        setStep("success");
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2000);
      }
    } catch (error: any) {
      toast.error(error.message || "Invalid OTP or failed to register");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-bold">Create Account</CardTitle>
          <CardDescription>
            {step === "form" ? "Join CivicPulse and start making a difference" : "Welcome aboard!"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "form" ? (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <Input
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                  />
                </div>
              </div>

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
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full h-11 text-lg font-semibold" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                Sign Up
              </Button>

              <div className="text-center mt-4">
                <p className="text-sm text-slate-600">
                  Already have an account?{" "}
                  <Link href="/signin" className="text-primary font-bold hover:underline">
                    Sign In
                  </Link>
                </p>
              </div>
            </form>
          ) : step === "otp" ? (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2 text-center mb-6">
                <p className="text-sm text-slate-600">
                  We've sent a 6-digit code to <strong>{email}</strong>
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Enter OTP Code</label>
                <Input
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-widest h-14"
                  disabled={loading}
                />
              </div>

              <Button type="submit" className="w-full h-11 text-lg font-semibold" disabled={loading || otp.length !== 6}>
                {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                Verify & Create Account
              </Button>
              
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full" 
                onClick={() => setStep("form")}
                disabled={loading}
              >
                Back
              </Button>
            </form>
          ) : (
            <div className="space-y-6 text-center py-8">
              <div className="flex justify-center">
                <CheckCircle2 className="h-20 w-20 text-green-500 animate-bounce" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-slate-900">Success!</h3>
                <p className="text-slate-600">
                  Your account has been created. Redirecting to your dashboard...
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
