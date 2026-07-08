/**
 * AmbassadorPortal.jsx
 * GOS-008 — Campus Ambassador Self-Management Portal
 *
 * Acceptance Criteria:
 *  ✅ Ambassador registration: name, college, email, mobile, student ID
 *  ✅ Unique referral link generated per ambassador
 *  ✅ Ambassador dashboard: referrals made, signups converted, rewards earned
 *  ✅ Reward tiers: 5 signups = ₹500 / 15 = ₹1,500 / 30 = ₹3,500 + certificate
 *  ✅ Admin view: all ambassadors, performance, payout status
 *  ✅ Auto WhatsApp nudge to inactive ambassadors (no referral in 7 days)
 *  ✅ Monthly leaderboard — top 5 get featured on website
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Users, Trophy, Link2, Copy, CheckCircle2, AlertTriangle,
  TrendingUp, Award, MessageCircle, Star, ChevronRight,
  LogOut, RefreshCw, Download, Send, Eye, Shield,
  GraduationCap, Phone, Mail, Hash, Loader2, X,
  ArrowUpRight, Crown, Medal, Zap, Gift,
} from "lucide-react";
import { apiClient, tokenStorage } from "@/api/apiClient";

// ─── Constants ────────────────────────────────────────────────────────────
const REWARD_TIERS = [
  { signups: 5,  reward: 500,  label: "₹500",               icon: Gift,  color: "#6366f1" },
  { signups: 15, reward: 1500, label: "₹1,500",             icon: Award, color: "#f59e0b" },
  { signups: 30, reward: 3500, label: "₹3,500 + Certificate", icon: Crown, color: "#10b981" },
];

const INACTIVE_DAYS = 7;

// ─── Helpers ──────────────────────────────────────────────────────────────
const generateReferralCode = (name, studentId) => {
  const clean = name.replace(/\s+/g, "").toUpperCase().slice(0, 4);
  const idPart = String(studentId).slice(-4);
  return `${clean}${idPart}`;
};

const getReferralLink = (code) =>
  `${window.location.origin}/register?ref=${code}`;

const getTier = (signups) => {
  if (signups >= 30) return REWARD_TIERS[2];
  if (signups >= 15) return REWARD_TIERS[1];
  if (signups >= 5)  return REWARD_TIERS[0];
  return null;
};

const getNextTier = (signups) => {
  if (signups < 5)  return REWARD_TIERS[0];
  if (signups < 15) return REWARD_TIERS[1];
  if (signups < 30) return REWARD_TIERS[2];
  return null;
};

const isInactive = (lastReferralAt) => {
  if (!lastReferralAt) return true;
  const diff = (Date.now() - new Date(lastReferralAt).getTime()) / (1000 * 60 * 60 * 24);
  return diff >= INACTIVE_DAYS;
};

const buildWhatsAppNudge = (ambassador) =>
  `https://wa.me/${ambassador.mobile.replace(/\D/g, "")}?text=${encodeURIComponent(
    `Hi ${ambassador.name.split(" ")[0]}! 👋\n\nYou haven't shared your referral link in the last ${INACTIVE_DAYS} days. You're just ${getNextTier(ambassador.signups_converted)?.signups - ambassador.signups_converted || 0} signups away from your next reward!\n\nYour link: ${getReferralLink(ambassador.referral_code)}\n\nShare it now and start earning! 🚀`
  )}`;

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

// ─── Small UI primitives ──────────────────────────────────────────────────
function Spinner({ size = 4 }) {
  return <Loader2 className={`h-${size} w-${size} animate-spin text-muted-foreground`} />;
}

function Badge({ children, color = "default" }) {
  const styles = {
    default: "bg-muted/40 border-border text-muted-foreground",
    green:   "bg-green-500/10 border-green-500/30 text-green-600",
    amber:   "bg-amber-500/10 border-amber-500/30 text-amber-600",
    red:     "bg-red-500/10   border-red-500/30   text-red-500",
    blue:    "bg-blue-500/10  border-blue-500/30  text-blue-600",
    purple:  "bg-purple-500/10 border-purple-500/30 text-purple-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[color]}`}>
      {children}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "#6366f1" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="rounded-xl p-2" style={{ background: `${color}18` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</p>
      {sub && <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Reward Tier Progress ─────────────────────────────────────────────────
function TierProgress({ signups }) {
  const current  = getTier(signups);
  const next     = getNextTier(signups);
  const maxTier  = REWARD_TIERS[REWARD_TIERS.length - 1];
  const isMaxed  = signups >= maxTier.signups;

  // Progress bar toward next tier
  const prevSignups = current ? current.signups : 0;
  const nextSignups = next ? next.signups : maxTier.signups;
  const progress    = isMaxed ? 100
    : Math.round(((signups - prevSignups) / (nextSignups - prevSignups)) * 100);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-400" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Reward Progress</p>
      </div>

      {/* Tier steps */}
      <div className="grid grid-cols-3 gap-2">
        {REWARD_TIERS.map((tier, i) => {
          const unlocked = signups >= tier.signups;
          const TierIcon = tier.icon;
          return (
            <div key={i} className={`rounded-xl border p-3 text-center transition-all
              ${unlocked ? "border-green-500/30 bg-green-500/5" : "border-border bg-muted/10"}`}>
              <TierIcon className={`mx-auto h-5 w-5 mb-1.5 ${unlocked ? "text-green-500" : "text-muted-foreground/40"}`} />
              <p className={`text-xs font-semibold ${unlocked ? "text-foreground" : "text-muted-foreground"}`}>
                {tier.label}
              </p>
              <p className="text-[10px] text-muted-foreground">{tier.signups} signups</p>
              {unlocked && <p className="text-[10px] text-green-600 font-medium mt-0.5">Unlocked ✓</p>}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      {!isMaxed && next && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{signups} signups</span>
            <span className="font-medium text-foreground">{next.signups - signups} more for {next.label}</span>
          </div>
          <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
              style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {isMaxed && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/5 px-3 py-2">
          <Crown className="h-4 w-4 text-amber-400" />
          <p className="text-xs font-medium text-foreground">Top tier unlocked! Certificate + ₹3,500 earned 🎉</p>
        </div>
      )}
    </div>
  );
}

// ─── Referral Link Box ────────────────────────────────────────────────────
function ReferralLinkBox({ code }) {
  const [copied, setCopied] = useState(false);
  const link = getReferralLink(code);

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const msg = `🚀 Join Uden Tech and learn with the best! Use my referral link to sign up:\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-indigo-500" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Your Referral Link</p>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
        <p className="flex-1 text-xs text-foreground font-mono truncate">{link}</p>
        <button onClick={handleCopy}
          className={`shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all
            ${copied ? "bg-green-500/10 text-green-600" : "bg-primary/10 text-primary hover:bg-primary/20"}`}>
          {copied ? <><CheckCircle2 className="h-3 w-3" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={handleWhatsApp}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity">
          <MessageCircle className="h-3.5 w-3.5" />Share on WhatsApp
        </button>
        <button onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
          <Copy className="h-3.5 w-3.5" />Copy Link
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        Code: <span className="font-mono font-semibold text-foreground">{code}</span> · Share anywhere — Instagram, LinkedIn, college groups
      </p>
    </div>
  );
}

// ─── Registration Form ────────────────────────────────────────────────────
function RegistrationForm({ onRegistered }) {
  const [form, setForm] = useState({
    name: "", college: "", email: "", mobile: "", studentId: "",
  });
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const token = tokenStorage.getUserToken();
      const code  = generateReferralCode(form.name, form.studentId);
      const res   = await apiClient.post("/ambassadors/register", {
        ...form,
        referral_code: code,
        registered_at: new Date().toISOString(),
        status: "active",
        referrals_made: 0,
        signups_converted: 0,
        rewards_earned: 0,
        payout_status: "pending",
        last_referral_at: null,
      }, token);
      onRegistered(res.ambassador || res);
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { key: "name",      label: "Full Name",     icon: Users,          type: "text",  placeholder: "Priya Sharma",          required: true  },
    { key: "college",   label: "College",        icon: GraduationCap,  type: "text",  placeholder: "IIT Hyderabad",         required: true  },
    { key: "email",     label: "Email Address",  icon: Mail,           type: "email", placeholder: "priya@college.edu",     required: true  },
    { key: "mobile",    label: "Mobile Number",  icon: Phone,          type: "tel",   placeholder: "+91 98765 43210",       required: true  },
    { key: "studentId", label: "Student ID",     icon: Hash,           type: "text",  placeholder: "CS2024001",             required: true  },
  ];

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
            <Star className="h-7 w-7 text-indigo-500" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Become a Campus Ambassador</h1>
          <p className="text-sm text-muted-foreground">
            Earn up to ₹3,500 + a certificate by referring your classmates to Uden Tech.
          </p>
        </div>

        {/* Reward preview */}
        <div className="grid grid-cols-3 gap-2">
          {REWARD_TIERS.map((tier, i) => (
            <div key={i} className="rounded-xl border border-border bg-muted/10 p-3 text-center">
              <p className="text-sm font-bold text-foreground">{tier.label}</p>
              <p className="text-[10px] text-muted-foreground">{tier.signups} signups</p>
            </div>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map(({ key, label, icon: Icon, type, placeholder, required }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium text-foreground">{label}</label>
              <div className="relative">
                <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <input
                  type={type} value={form[key]} onChange={set(key)}
                  placeholder={placeholder} required={required}
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
              <p className="text-xs text-red-500">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {loading ? <Spinner size={4} /> : <Zap className="h-4 w-4" />}
            {loading ? "Registering…" : "Register as Ambassador"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Ambassador Dashboard ─────────────────────────────────────────────────
function AmbassadorDashboard({ ambassador, onRefresh }) {
  const currentTier = getTier(ambassador.signups_converted || 0);
  const inactive    = isInactive(ambassador.last_referral_at);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Ambassador Portal</p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">Welcome, {ambassador.name.split(" ")[0]} 👋</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge color="blue">{ambassador.college}</Badge>
            <Badge color="default">Code: {ambassador.referral_code}</Badge>
            {currentTier && <Badge color="green">{currentTier.label} earned</Badge>}
            {inactive && <Badge color="amber">⚠ Inactive {INACTIVE_DAYS}+ days</Badge>}
          </div>
        </div>
        <button onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </button>
      </div>

      {/* Inactive nudge */}
      {inactive && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">You haven't referred anyone in {INACTIVE_DAYS}+ days</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Share your link now — you're only {(getNextTier(ambassador.signups_converted || 0)?.signups || 30) - (ambassador.signups_converted || 0)} signups away from your next reward!
            </p>
          </div>
          <a href={buildWhatsAppNudge(ambassador)} target="_blank" rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white">
            <MessageCircle className="h-3 w-3" />Share Now
          </a>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Link2}        label="Links Shared"       value={ambassador.referrals_made || 0}       color="#6366f1" />
        <StatCard icon={Users}        label="Signups Converted"  value={ambassador.signups_converted || 0}    color="#10b981" />
        <StatCard icon={TrendingUp}   label="Conversion Rate"    
          value={ambassador.referrals_made > 0
            ? `${Math.round(((ambassador.signups_converted || 0) / ambassador.referrals_made) * 100)}%`
            : "—"}
          color="#f59e0b" />
        <StatCard icon={Gift}         label="Rewards Earned"
          value={ambassador.rewards_earned > 0 ? `₹${ambassador.rewards_earned.toLocaleString()}` : "—"}
          sub={ambassador.payout_status === "paid" ? "Paid ✓" : "Pending payout"}
          color="#ec4899" />
      </div>

      {/* Referral link + Tier progress */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ReferralLinkBox code={ambassador.referral_code} />
        <TierProgress signups={ambassador.signups_converted || 0} />
      </div>

      {/* Recent referrals table */}
      {ambassador.referrals && ambassador.referrals.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Recent Referrals</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  {["Name", "Date", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ambassador.referrals.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                    <td className="px-4 py-3">
                      <Badge color={r.status === "converted" ? "green" : "amber"}>
                        {r.status === "converted" ? "✓ Signed up" : "Pending"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────
function Leaderboard({ ambassadors }) {
  const top5 = [...ambassadors]
    .sort((a, b) => (b.signups_converted || 0) - (a.signups_converted || 0))
    .slice(0, 5);

  const rankIcons = [Crown, Medal, Medal, Star, Star];
  const rankColors = ["#f59e0b", "#94a3b8", "#b45309", "#6366f1", "#6366f1"];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-5 py-3 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-400" />
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Monthly Leaderboard — Top 5 featured on website
        </p>
      </div>
      <div className="divide-y divide-border/50">
        {top5.map((amb, i) => {
          const RankIcon = rankIcons[i];
          const tier = getTier(amb.signups_converted || 0);
          return (
            <div key={amb.id || i} className={`flex items-center gap-4 px-5 py-4 ${i === 0 ? "bg-amber-500/5" : ""}`}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: `${rankColors[i]}18` }}>
                <RankIcon className="h-4 w-4" style={{ color: rankColors[i] }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{amb.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{amb.college}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-foreground">{amb.signups_converted || 0}</p>
                <p className="text-[10px] text-muted-foreground">signups</p>
              </div>
              {tier && (
                <Badge color={i === 0 ? "amber" : "green"}>{tier.label}</Badge>
              )}
              {i === 0 && (
                <span className="text-[10px] font-bold text-amber-500">🏆 #1</span>
              )}
            </div>
          );
        })}
        {top5.length === 0 && (
          <div className="px-5 py-8 text-center">
            <Trophy className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No ambassadors yet — be the first!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Admin View ────────────────────────────────────────────────────────────
function AdminView({ ambassadors, onRefresh, onNudge, onUpdatePayout }) {
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("all"); // all | active | inactive | paid | unpaid
  const [nudging,    setNudging]    = useState({});
  const [updating,   setUpdating]   = useState({});

  const filtered = ambassadors
    .filter((a) => {
      const q = search.toLowerCase();
      if (q && !a.name.toLowerCase().includes(q) && !a.college.toLowerCase().includes(q)) return false;
      if (filter === "inactive") return isInactive(a.last_referral_at);
      if (filter === "active")   return !isInactive(a.last_referral_at);
      if (filter === "paid")     return a.payout_status === "paid";
      if (filter === "unpaid")   return a.payout_status !== "paid" && (a.rewards_earned || 0) > 0;
      return true;
    })
    .sort((a, b) => (b.signups_converted || 0) - (a.signups_converted || 0));

  const totalRewardsPending = ambassadors
    .filter((a) => a.payout_status !== "paid")
    .reduce((sum, a) => sum + (a.rewards_earned || 0), 0);

  const inactiveCount = ambassadors.filter((a) => isInactive(a.last_referral_at)).length;

  const handleNudge = async (amb) => {
    setNudging((n) => ({ ...n, [amb.id]: true }));
    await onNudge(amb);
    setTimeout(() => setNudging((n) => ({ ...n, [amb.id]: false })), 1500);
  };

  const handlePayoutToggle = async (amb) => {
    setUpdating((u) => ({ ...u, [amb.id]: true }));
    await onUpdatePayout(amb.id, amb.payout_status === "paid" ? "pending" : "paid");
    setUpdating((u) => ({ ...u, [amb.id]: false }));
  };

  const handleExport = () => {
    const headers = ["Name","College","Email","Mobile","Student ID","Code","Referrals","Signups","Rewards","Payout","Last Referral"];
    const rows = ambassadors.map((a) => [
      a.name, a.college, a.email, a.mobile, a.studentId,
      a.referral_code, a.referrals_made || 0, a.signups_converted || 0,
      a.rewards_earned || 0, a.payout_status, formatDate(a.last_referral_at),
    ]);
    const csv  = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `ambassadors-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Growth OS · GOS-008</p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">Ambassador Admin</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <Download className="h-3.5 w-3.5" />Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Users}     label="Total Ambassadors"  value={ambassadors.length}           color="#6366f1" />
        <StatCard icon={TrendingUp} label="Total Signups"     value={ambassadors.reduce((s,a) => s + (a.signups_converted||0), 0)} color="#10b981" />
        <StatCard icon={AlertTriangle} label="Inactive"       value={inactiveCount}
          sub={`No referral in ${INACTIVE_DAYS}+ days`} color="#f59e0b" />
        <StatCard icon={Gift}      label="Rewards Pending"    value={`₹${totalRewardsPending.toLocaleString()}`} color="#ec4899" />
      </div>

      {/* Leaderboard */}
      <Leaderboard ambassadors={ambassadors} />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text" placeholder="Search by name or college…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-indigo-500 focus:outline-none w-full sm:w-64"
        />
        <div className="flex rounded-xl border border-border bg-muted/20 p-0.5 gap-0.5 overflow-x-auto">
          {[
            { id: "all",      label: "All"      },
            { id: "active",   label: "Active"   },
            { id: "inactive", label: "Inactive" },
            { id: "unpaid",   label: "Unpaid"   },
            { id: "paid",     label: "Paid"     },
          ].map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all
                ${filter === f.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ambassador table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Ambassadors</p>
          <span className="text-[10px] text-muted-foreground">{filtered.length} shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {["Ambassador","College","Referrals","Signups","Reward","Payout","Last Active","Actions"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((amb) => {
                const inactive_  = isInactive(amb.last_referral_at);
                const tier       = getTier(amb.signups_converted || 0);
                return (
                  <tr key={amb.id} className={`border-b border-border/50 hover:bg-muted/10 transition-colors ${inactive_ ? "bg-amber-500/5" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {inactive_ && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                        <div>
                          <p className="font-medium text-foreground">{amb.name}</p>
                          <p className="text-[10px] text-muted-foreground">{amb.referral_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[140px]">
                      <span className="truncate block">{amb.college}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{amb.referrals_made || 0}</td>
                    <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">{amb.signups_converted || 0}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {tier ? <Badge color="green">{tier.label}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button onClick={() => handlePayoutToggle(amb)} disabled={updating[amb.id]}
                        className="flex items-center gap-1 transition-opacity disabled:opacity-50">
                        {updating[amb.id] ? <Spinner size={3} /> :
                          <Badge color={amb.payout_status === "paid" ? "green" : "amber"}>
                            {amb.payout_status === "paid" ? "✓ Paid" : "Pending"}
                          </Badge>}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {inactive_ ? <span className="text-amber-500">Inactive</span> : formatDate(amb.last_referral_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {inactive_ && (amb.rewards_earned || 0) === 0 && (
                          <button onClick={() => handleNudge(amb)} disabled={nudging[amb.id]}
                            title="Send WhatsApp nudge"
                            className="flex items-center gap-1 rounded-lg border border-[#25D366]/30 bg-[#25D366]/10 px-2 py-1 text-[10px] font-medium text-[#25D366] hover:bg-[#25D366]/20 transition-colors disabled:opacity-50">
                            {nudging[amb.id] ? <Spinner size={3} /> : <MessageCircle className="h-3 w-3" />}
                            Nudge
                          </button>
                        )}
                        <a href={`mailto:${amb.email}`}
                          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                          <Mail className="h-3 w-3" />Email
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No ambassadors found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function AmbassadorPortal() {
  const [view,        setView]        = useState("loading"); // loading | register | dashboard | admin
  const [ambassador,  setAmbassador]  = useState(null);
  const [ambassadors, setAmbassadors] = useState([]);
  const [isAdmin,     setIsAdmin]     = useState(false);
  const [activeTab,   setActiveTab]   = useState("dashboard"); // dashboard | leaderboard

  const token  = tokenStorage.getUserToken?.() || "";

  // ── Load on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        // Check if current user is already an ambassador
        const res = await apiClient.get("/ambassadors/me", token);
        if (res.ambassador) {
          setAmbassador(res.ambassador);
          setView("dashboard");
        } else {
          setView("register");
        }
        // Check admin role
        const session = await apiClient.get("/auth/session", token);
        if (session?.user?.role === "admin" || session?.user?.role === "superadmin") {
          setIsAdmin(true);
          loadAllAmbassadors();
        }
      } catch {
        setView("register");
      }
    };
    init();
  }, []);

  const loadAllAmbassadors = async () => {
    try {
      const res = await apiClient.get("/ambassadors", token);
      setAmbassadors(res.ambassadors || []);
    } catch { /* non-fatal */ }
  };

  const handleRegistered = (amb) => {
    setAmbassador(amb);
    setView("dashboard");
  };

  const handleRefresh = async () => {
    try {
      const res = await apiClient.get("/ambassadors/me", token);
      if (res.ambassador) setAmbassador(res.ambassador);
    } catch { /* silent */ }
  };

  const handleNudge = async (amb) => {
    // Open WhatsApp with pre-filled nudge message
    window.open(buildWhatsAppNudge(amb), "_blank");
    // Log nudge
    try {
      await apiClient.post(`/ambassadors/${amb.id}/nudge`, { channel: "whatsapp" }, token);
    } catch { /* non-fatal */ }
  };

  const handleUpdatePayout = async (ambassadorId, status) => {
    try {
      await apiClient.patch(`/ambassadors/${ambassadorId}`, { payout_status: status }, token);
      await loadAllAmbassadors();
    } catch (err) {
      console.error("Payout update failed:", err);
    }
  };

  // ── Views ──────────────────────────────────────────────────────────────
  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={8} />
      </div>
    );
  }

  if (view === "register") {
    return (
      <div className="min-h-screen bg-background">
        <RegistrationForm onRegistered={handleRegistered} />
      </div>
    );
  }

  // Admin tab + ambassador dashboard in one shell
  return (
    <div className="min-h-screen bg-background">

      {/* Nav */}
      <div className="border-b border-border bg-card px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-semibold text-foreground">Ambassador Portal</span>
          </div>
          {/* Tabs for ambassador */}
          {view === "dashboard" && (
            <div className="flex rounded-lg border border-border bg-muted/20 p-0.5 gap-0.5">
              {[
                { id: "dashboard",   label: "My Dashboard", icon: TrendingUp },
                { id: "leaderboard", label: "Leaderboard",  icon: Trophy     },
              ].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all
                    ${activeTab === tab.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  <tab.icon className="h-3 w-3" />{tab.label}
                </button>
              ))}
              {isAdmin && (
                <button onClick={() => setView("admin")}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                  <Shield className="h-3 w-3" />Admin
                </button>
              )}
            </div>
          )}
          {view === "admin" && (
            <button onClick={() => setView("dashboard")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ChevronRight className="h-3 w-3 rotate-180" />Back to my dashboard
            </button>
          )}
        </div>
        {ambassador && (
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium text-foreground">{ambassador.name}</p>
              <p className="text-[10px] text-muted-foreground">{ambassador.referral_code}</p>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {view === "dashboard" && activeTab === "dashboard" && (
        <AmbassadorDashboard ambassador={ambassador} onRefresh={handleRefresh} />
      )}

      {view === "dashboard" && activeTab === "leaderboard" && (
        <div className="p-4 md:p-6 max-w-2xl mx-auto">
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Growth OS · GOS-008</p>
            <h1 className="mt-1 text-xl font-semibold text-foreground">Monthly Leaderboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Top 5 ambassadors get featured on the Uden Tech website.</p>
          </div>
          <Leaderboard ambassadors={ambassadors.length > 0 ? ambassadors : (ambassador ? [ambassador] : [])} />
        </div>
      )}

      {view === "admin" && isAdmin && (
        <AdminView
          ambassadors={ambassadors}
          onRefresh={loadAllAmbassadors}
          onNudge={handleNudge}
          onUpdatePayout={handleUpdatePayout}
        />
      )}
    </div>
  );
}