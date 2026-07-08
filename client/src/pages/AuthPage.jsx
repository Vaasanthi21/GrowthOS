"use client"
import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Sparkles, ArrowRight, Mail } from "lucide-react";
import PageShell from "@/components/PageShell";
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/AuthContext";

export default function AuthPage({ mode = "login" }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login, signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isSignup = mode === "signup";

  const submit = (e) => {
    e.preventDefault();
    if (!email || !password) return;
    if (isSignup) signup(email);
    else login(email);
    const redirect = params.get("redirect") || "/";
    navigate(redirect);
  };

  return (
    <PageShell testid={`${mode}-page`}>
      <SEO
        title={isSignup ? "Sign up" : "Log in"}
        description={
          isSignup
            ? "Create your CreativeOS account and get 100 free credits. Usage-based, no subscription."
            : "Log in to CreativeOS and pick up where you left off."
        }
        path={isSignup ? "/signup" : "/login"}
      />

      <section className="mx-auto flex min-h-[80vh] max-w-md items-center px-5 pt-32 pb-16">
        <div className="w-full rounded-3xl border border-white/10 bg-white/[0.03] p-8">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600">
            <Sparkles className="h-6 w-6 text-black" />
          </span>
          <h1 className="mt-6 text-3xl font-bold text-white">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            {isSignup
              ? "Get 100 free credits. No credit card. No subscription."
              : "Log in to keep creating."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4" data-testid={`${mode}-form`}>
            <div>
              <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                Email
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3">
                <Mail className="h-4 w-4 shrink-0 text-orange-500" />
                <input
                  required
                  type="email"
                  data-testid={`${mode}-email`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-neutral-600"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                Password
              </label>
              <input
                required
                type="password"
                data-testid={`${mode}-password`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-orange-500/50"
              />
            </div>
            <button
              type="submit"
              data-testid={`${mode}-submit`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-orange-400 active:scale-95"
            >
              {isSignup ? "Create account" : "Log in"} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-500">
            {isSignup ? (
              <>
                Already have an account?{" "}
                <Link
                  to="/login"
                  data-testid="switch-to-login"
                  className="font-semibold text-orange-400 hover:underline"
                >
                  Log in
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link
                  to="/signup"
                  data-testid="switch-to-signup"
                  className="font-semibold text-orange-400 hover:underline"
                >
                  Create an account
                </Link>
              </>
            )}
          </p>
        </div>
      </section>
    </PageShell>
  );
}