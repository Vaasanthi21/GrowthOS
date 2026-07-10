import React, { useMemo, useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { apiClient, tokenStorage } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, isAuthenticated } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // login | forgot | reset
  const [resetEmail, setResetEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  console.log('[Login] Render - isAuthenticated:', isAuthenticated, 'redirect:', searchParams.get("redirect"));

  useEffect(() => {
    if (isAuthenticated) {
      const superAdminAuth = window.localStorage.getItem("superadmin_auth") === "true";
      const redirectPath = searchParams.get("redirect") || "/generate";
      const target = superAdminAuth ? "/superadmin/dashboard" : redirectPath;

      const timer = setTimeout(() => {
        navigate(target);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, navigate, searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const data = await signIn(normalizedEmail, password);

      if (data.user?.role === "superadmin") {
        tokenStorage.setSuperAdminToken(data.token);
        window.localStorage.setItem("superadmin_auth", "true");
        toast({
          title: "Super admin login successful!",
          duration: 2000,
        });
        return;
      }

      window.localStorage.removeItem("superadmin_auth");
      tokenStorage.clearSuperAdminToken();
      toast({
        title: "Login successful!",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Login failed",
        description:
          error.message || "Check your email and password, then try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setIsLoading(true);

    try {
      const response = await apiClient.post("/auth/forgot-password", {
        email: resetEmail.trim().toLowerCase(),
      });

      toast({
        title: "OTP Sent",
        description: response.message,
      });

      setPassword("");
      setAuthMode("reset");
      setResendCooldown(60);
    } catch (error) {
      toast({
        title: "Request failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await apiClient.post("/auth/reset-password", {
        email: resetEmail.trim().toLowerCase(),
        otp,
        newPassword,
      });

      toast({
        title: "Success",
        description: response.message,
      });

      setAuthMode("login");
      setPassword("");
      setOtp("");
      setNewPassword("");
    } catch (error) {
      toast({
        title: "Reset failed",
        description: error.message,
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

          {/* Login Form */}
          <div className="bg-card border border-border rounded-lg p-8 space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-display font-semibold text-foreground">
                {authMode === "login" && "Sign in"}
                {authMode === "forgot" && "Reset your password"}
                {authMode === "reset" && "Enter verification code"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {authMode === "login" &&
                  "Company users and super admins can sign in using their registered credentials."}
                {authMode === "forgot" &&
                  "Enter your registered email and we'll send you an OTP to reset your password."}
                {authMode === "reset" &&
                  "Enter the OTP sent to your email and create a new password."}
              </p>
              <p className="text-xs text-muted-foreground">
                {authMode === "login" &&
                  "Use the same work email you registered with."}
                {authMode !== "login" &&
                  "For security, the OTP will expire shortly."}
              </p>
            </div>

            <form
              onSubmit={
                authMode === "login"
                  ? handleSubmit
                  : authMode === "forgot"
                    ? handleForgotPassword
                    : handleResetPassword
              }
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={authMode === "login" ? email : resetEmail}
                  onChange={(e) =>
                    authMode === "login"
                      ? setEmail(e.target.value)
                      : setResetEmail(e.target.value)
                  }
                  required
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              {authMode === "login" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <svg
                          className="w-4 h-4"
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
                          className="w-4 h-4"
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
              )}

              {authMode === "reset" && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      OTP
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Enter 6-digit OTP"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      New Password
                    </label>
                    <input
                      type="password"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 bg-primary text-white font-medium rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading
                  ? authMode === "login"
                    ? "Signing in..."
                    : authMode === "forgot"
                      ? "Sending OTP..."
                      : "Resetting password..."
                  : authMode === "login"
                    ? "Sign In"
                    : authMode === "forgot"
                      ? "Send OTP"
                      : "Reset Password"}
              </button>
            </form>

            <div className="flex flex-col items-center gap-3 pt-2">
              {authMode === "login" && (
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setAuthMode("forgot");
                  }}
                  className="text-sm font-medium text-primary hover:underline transition-colors"
                >
                  Forgot password?
                </button>
              )}

              {authMode === "reset" && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isLoading || resendCooldown > 0}
                  className="text-sm font-medium text-primary hover:underline transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : "Didn't receive code? Resend OTP"}
                </button>
              )}

              {authMode !== "login" && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setPassword("");
                    setOtp("");
                    setNewPassword("");
                    setResendCooldown(0);
                  }}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back to sign in
                </button>
              )}

              <p className="text-sm text-muted-foreground">
                Need an account?{" "}
                <Link
                  to={`/register${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
                  className="font-medium text-primary hover:underline transition-colors"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
