import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

type SignUpStep = "email" | "otp" | "success";

export default function SignUp() {
  const [, navigate] = useLocation();
  const { refresh } = useAuth();
  const [step, setStep] = useState<SignUpStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);

  const sendOtpMutation = trpc.otp.sendOtp.useMutation();
  const verifyOtpMutation = trpc.otp.verifyOtp.useMutation();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === "otp" && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [step, timeLeft]);

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email) {
      toast.error("Please enter your email");
      return;
    }

    setLoading(true);
    try {
      const result = await sendOtpMutation.mutateAsync({ email }) as any;
      
      if (result && result.success === false) {
        toast.error(result.error || "Failed to send OTP. Check your SMTP settings.");
        return;
      }

      toast.success("OTP sent to your email!");
      setTimeLeft(60);
      setStep("otp");
    } catch (error) {
      toast.error("Failed to send OTP. Please try again.");
      console.error("Send OTP error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      const result = await verifyOtpMutation.mutateAsync({ email, code: otp });
      if (result.success) {
        toast.success("Email verified! You can now sign in.");
        setStep("success");
        
        // Refresh user session and determine redirect path
        const sessionInfo = await refresh();
        const user = sessionInfo.data;
        
        setTimeout(() => {
          if (user?.role === "admin") {
            navigate("/admin/dashboard");
          } else {
            navigate("/");
          }
        }, 2000);
      } else {
        toast.error(result.error || "Invalid OTP. Please try again.");
      }
    } catch (error) {
      toast.error("Failed to verify OTP. Please try again.");
      console.error("Verify OTP error:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTimerColor = () => {
    if (timeLeft > 30) return "bg-green-500";
    if (timeLeft > 10) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>
            {step === "email" && "Enter your email to get started"}
            {step === "otp" && "Enter the OTP sent to your email"}
            {step === "success" && "Account created successfully!"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" && (
            <form onSubmit={handleSendOtp} className="space-y-4">
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send OTP
              </Button>
              <p className="text-xs text-center text-gray-500">
                We'll send a one-time password to your email
              </p>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Enter OTP</label>
                <Input
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                  disabled={loading}
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500 font-medium px-1">
                  <span>Time remaining</span>
                  <span>{timeLeft}s</span>
                </div>
                {timeLeft > 0 ? (
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 overflow-hidden">
                    <div 
                      className={`h-2.5 rounded-full transition-all duration-1000 ease-linear ${getTimerColor()}`} 
                      style={{ width: `${(timeLeft / 60) * 100}%` }}
                    ></div>
                  </div>
                ) : (
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => handleSendOtp()}
                    disabled={loading}
                  >
                    Resend OTP
                  </Button>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading || timeLeft === 0}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify OTP
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                }}
                disabled={loading}
              >
                Back
              </Button>
            </form>
          )}

          {step === "success" && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
              </div>
              <p className="text-sm text-gray-600">
                Your account has been created successfully!
              </p>
              <p className="text-xs text-gray-500">
                Redirecting to home page...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
