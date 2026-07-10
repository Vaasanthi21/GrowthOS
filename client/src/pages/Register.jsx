import React, { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import OtpSplitInput from "@/components/ui/OtpSplitInput";

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signUp, verifyEmail, resendVerificationOtp, isAuthenticated } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    company: "",
    password: "",
    confirm_password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [isPendingVerification, setIsPendingVerification] = useState(false);
  const [verificationOtp, setVerificationOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Verification code resend timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  console.log('[Register] Render - isAuthenticated:', isAuthenticated, 'redirect:', searchParams.get("redirect"));

  useEffect(() => {
    if (isAuthenticated) {
      const redirectPath = searchParams.get("redirect") || "/generate";
      const timer = setTimeout(() => {
        navigate(redirectPath);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, navigate, searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const submitted = {
      full_name: String(formData.get("full_name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      company: String(formData.get("company") || "").trim(),
      password: String(formData.get("password") || ""),
      confirm_password: String(formData.get("confirm_password") || ""),
    };

    if (submitted.password !== submitted.confirm_password) {
      toast({
        title: "Passwords do not match",
        description: "Please make sure both passwords match",
        variant: "destructive",
      });
      return;
    }

    if (submitted.password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await signUp(
        submitted.email,
        submitted.password,
        submitted.full_name,
        submitted.company,
        submitted.phone,
      );
      toast({
        title: "Verification Code Sent!",
        description: "Please enter the 6-digit verification code sent to your email.",
      });
      setRegisteredEmail(submitted.email);
      setIsPendingVerification(true);
      setResendCooldown(60);
    } catch (error) {
      toast({
        title: "Registration failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    if (verificationOtp.length !== 6) {
      toast({
        title: "Verification failed",
        description: "Please enter the complete 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await verifyEmail(registeredEmail, verificationOtp);
      toast({
        title: "Verified successfully!",
        description: "Welcome to Creative Studio OS!",
      });
    } catch (error) {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid or expired verification code",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    try {
      await resendVerificationOtp(registeredEmail);
      toast({
        title: "OTP Resent",
        description: "A new verification code has been sent to your email address.",
      });
      setResendCooldown(60);
      setVerificationOtp("");
    } catch (error) {
      toast({
        title: "Resend failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full">
        <div className="text-center space-y-6">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <span className="font-display text-2xl font-bold text-foreground">
              Creative Studio OS
            </span>
          </div>

          {/* Register / Verification Form */}
          <div className="bg-card border border-border rounded-lg p-8 space-y-6">
            {isPendingVerification ? (
              <>
                <div className="space-y-2">
                  <h1 className="text-2xl font-display font-semibold text-foreground">
                    Verify your email
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    We've sent a 6-digit verification code to <strong className="text-foreground">{registeredEmail}</strong>. Enter it below to activate your account.
                  </p>
                </div>

                <form onSubmit={handleVerifyEmail} className="space-y-6">
                  <div className="space-y-2">
                    <OtpSplitInput
                      value={verificationOtp}
                      onChange={setVerificationOtp}
                      disabled={isLoading}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2 px-4 bg-primary text-white font-medium rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? "Activating..." : "Activate Account"}
                  </button>
                </form>

                <div className="flex flex-col items-center gap-3 pt-2 text-sm">
                  {resendCooldown > 0 ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground bg-secondary/60 px-3 py-1.5 rounded-full border border-border/40 select-none">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <span>Resend code in <strong className="font-mono text-primary">{resendCooldown}s</strong></span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={isLoading}
                      className="font-medium text-primary hover:underline transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Didn't receive code? Resend OTP
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsPendingVerification(false);
                      setVerificationOtp("");
                      setResendCooldown(0);
                    }}
                    className="text-primary hover:underline font-medium"
                  >
                    Back to signup
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <h1 className="text-2xl font-display font-semibold text-foreground">
                    Create your account
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Get started with Creative Studio OS
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Full Name
                    </label>
                    <input
                      type="text"
                      name="full_name"
                      placeholder="John Doe"
                      value={form.full_name}
                      onChange={(e) =>
                        setForm({ ...form, full_name: e.target.value })
                      }
                      required
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Work Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      placeholder="you@company.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      placeholder="Enter 10-15 digit number"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      required
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Company Name
                    </label>
                    <input
                      type="text"
                      name="company"
                      placeholder="Acme Corp"
                      value={form.company}
                      onChange={(e) =>
                        setForm({ ...form, company: e.target.value })
                      }
                      required
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        placeholder="••••••••"
                        value={form.password}
                        onChange={(e) =>
                          setForm({ ...form, password: e.target.value })
                        }
                        required
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      name="confirm_password"
                      placeholder="Re-enter password"
                      value={form.confirm_password}
                      onChange={(e) =>
                        setForm({ ...form, confirm_password: e.target.value })
                      }
                      required
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2 px-4 bg-primary text-white font-medium rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? "Creating account..." : "Create Account"}
                  </button>
                </form>

                <div className="text-center pt-2">
                  <p className="text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link
                      to={`/login${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
                      className="text-primary hover:underline font-medium"
                    >
                      Sign in
                    </Link>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
