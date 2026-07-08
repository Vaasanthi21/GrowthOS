/**
 * PublishingAccounts.jsx
 * 
 * Vasanthi – Account Management UI + Platform Health Dashboard (Phase 7)
 * 
 * MODULAR & REUSABLE DESIGN:
 * - Uses Platform classes from ./platforms/ for each social platform
 * - BasePlatform provides reusable common logic
 * - Each platform (WordPress, Hashnode, Dev.to, Instagram) extends BasePlatform
 * - Adding new platform = create new class extending BasePlatform
 * 
 * Pages:
 *  - Connected Accounts (connect / disconnect / re-verify)
 *  - Token / Permission Status per platform
 *  - Platform Health overview (WordPress, Hashnode, Dev.to)
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2, AlertTriangle, X, Loader2, RefreshCw,
  Link, Unlink, Eye, EyeOff, ExternalLink, Info,
  Wifi, WifiOff, Clock, Shield, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiClient, tokenStorage } from "@/api/apiClient";

// MODULAR: Import platform manager instead of hardcoded metadata
import AnalyticsDashboard from "./AnalyticsDashboard";
import { getActivePlatforms, getPlatform } from "./platforms/platformManager";

// ─── Platform metadata (colours + icons as emoji for portability) ─────────
// DEPRECATED: Use platform.getMeta() instead (from platform classes)
const PLATFORM_META = {
  wordpress: { label: "WordPress",  color: "#21759B", emoji: "🔵", authLabel: "Application Password" },
  hashnode:  { label: "Hashnode",   color: "#2962FF", emoji: "🔷", authLabel: "Personal Access Token" },
  devto:     { label: "Dev.to",     color: "#0A0A0A", emoji: "⬛", authLabel: "API Key"             },
};


const RESEARCH_PLATFORMS = [
  { id: "medium",    label: "Medium",    color: "#000000", emoji: "⚫", note: "API deprecated — manual import only" },
  { id: "substack",  label: "Substack",  color: "#FF6719", emoji: "🟠", note: "No public API — planned newsletter digest workflow" },
  { id: "instagram", label: "Instagram", color: "#E4405F", emoji: "🟣", note: "Coming soon — Instagram Basic Display API integration" },
];


// ─── Helpers ──────────────────────────────────────────────────────────────
function Spinner({ size = 4 }) {
  return <Loader2 className={`h-${size} w-${size} animate-spin`} />;
}


function StatusBadge({ status }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/30 px-2 py-0.5 text-[10px] font-medium text-green-600">
        <CheckCircle2 className="h-2.5 w-2.5" />Active
      </span>
    );
  }
  if (status === "error" || status === "expired") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/30 px-2 py-0.5 text-[10px] font-medium text-red-500">
        <AlertTriangle className="h-2.5 w-2.5" />{status === "expired" ? "Expired" : "Error"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
      {status}
    </span>
  );
}


// ─── Get platform auth fields (MODULAR: from platform class) ──────────────
function getPlatformAuthFields(platformId) {
  // MODULAR: Get platform instance and use its authFields
  const platform = getPlatform(platformId);
  return platform.authFields || [];
}


// ─── Connect form for a platform ──────────────────────────────────────────
function ConnectForm({ platform, fields, onConnect, onCancel, loading }) {
  const [values, setValues] = useState(
    Object.fromEntries(fields.map((f) => [f.key, ""]))
  );
  const [showPasswords, setShowPasswords] = useState({});


  const handleSubmit = (e) => {
    e.preventDefault();
    onConnect(values);
  };


  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2">
      {fields.map((field) => {
        const isPassword = field.type === "password";
        const show       = showPasswords[field.key];
        return (
          <div key={field.key} className="space-y-1">
            <label className="text-xs font-medium text-foreground">{field.label}</label>
            <div className="relative">
              <input
                type={isPassword && !show ? "password" : "text"}
                value={values[field.key]}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                placeholder={field.placeholder || ""}
                required={field.required}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none pr-9"
              />
              {isPassword && (
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPasswords((s) => ({ ...s, [field.key]: !s[field.key] }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            {field.hint && <p className="text-[10px] text-muted-foreground">{field.hint}</p>}
          </div>
        );
      })}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {loading ? <Spinner size={3} /> : <Link className="h-3.5 w-3.5" />}
          {loading ? "Connecting…" : "Connect"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}


// ─── Single platform card ──────────────────────────────────────────────────
function PlatformCard({ platformId, account, onConnect, onDisconnect, onVerify }) {
  // MODULAR: Get platform metadata from platform class
  const platform = getPlatform(platformId);
  const meta = platform.getMeta();
  
  const [showForm,        setShowForm]        = useState(false);
  const [connecting,      setConnecting]      = useState(false);
  const [disconnecting,   setDisconnecting]   = useState(false);
  const [verifying,       setVerifying]       = useState(false);
  const [verifyResult,    setVerifyResult]    = useState(null);
  const [connectError,    setConnectError]    = useState(null);
  const [expanded,        setExpanded]        = useState(false);


  const handleConnect = async (credentials) => {
    setConnecting(true); setConnectError(null);
    try {
      await onConnect({ platformId, credentials });
      setShowForm(false);
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };


  const handleDisconnect = async () => {
    if (!window.confirm(`Disconnect ${meta.label}? You'll need to reconnect to publish.`)) return;
    setDisconnecting(true);
    try { await onDisconnect(platformId); }
    finally { setDisconnecting(false); }
  };


  const handleVerify = async () => {
    setVerifying(true); setVerifyResult(null);
    try {
      const result = await onVerify(platformId);
      setVerifyResult(result);
    } catch (err) {
      setVerifyResult({ valid: false, error: err.message });
    } finally {
      setVerifying(false);
    }
  };


  const isConnected = Boolean(account);


  return (
    <div className={`rounded-2xl border bg-card overflow-hidden transition-all
      ${isConnected ? "border-border" : "border-dashed border-border/60"}`}>


      {/* Header */}
      <div className="flex items-center gap-3 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
          style={{ background: `${meta.color}18` }}>
          {meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{meta.label}</p>
            {isConnected && <StatusBadge status={account.status} />}
          </div>
          {isConnected ? (
            <p className="text-xs text-muted-foreground truncate">
              {account.account_name || account.account_email || account.site_url || "Connected"}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{meta.authLabel}</p>
          )}
        </div>


        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {isConnected ? (
            <>
              <button onClick={handleVerify} disabled={verifying}
                title="Verify credentials"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                {verifying ? <Spinner size={3} /> : <Shield className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => setExpanded(!expanded)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors">
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              <button onClick={handleDisconnect} disabled={disconnecting}
                title="Disconnect"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/30 text-red-500/70 hover:text-red-500 hover:bg-red-500/5 transition-colors disabled:opacity-50">
                {disconnecting ? <Spinner size={3} /> : <Unlink className="h-3.5 w-3.5" />}
              </button>
            </>
          ) : (
            <button onClick={() => { setShowForm(!showForm); setConnectError(null); }}
              className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
              <Link className="h-3.5 w-3.5" />Connect
            </button>
          )}
        </div>
      </div>


      {/* Verify result */}
      {verifyResult && (
        <div className={`mx-5 mb-3 rounded-xl border px-3 py-2 text-xs
          ${verifyResult.valid
            ? "border-green-500/30 bg-green-500/5 text-green-600"
            : "border-red-500/30 bg-red-500/5 text-red-500"}`}>
          {verifyResult.valid
            ? `✓ Credentials verified — ${meta.label} is reachable`
            : `✗ ${verifyResult.error}`}
        </div>
      )}


      {/* Connect form */}
      {!isConnected && showForm && (
        <div className="border-t border-border px-5 pb-5">
          {connectError && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
              {connectError}
            </div>
          )}
          <ConnectForm
            platform={platformId}
            fields={getPlatformAuthFields(platformId)}
            onConnect={handleConnect}
            onCancel={() => { setShowForm(false); setConnectError(null); }}
            loading={connecting}
          />
        </div>
      )}


      {/* Expanded details */}
      {isConnected && expanded && (
        <div className="border-t border-border px-5 py-4 space-y-2">
          {[
            ["Account",       account.account_name],
            ["Email",         account.account_email],
            ["Site URL",      account.site_url],
            ["Publication",   account.publication_id],
            ["Connected",     account.connected_at ? new Date(account.connected_at).toLocaleDateString() : null],
            ["Last Verified", account.last_verified_at ? new Date(account.last_verified_at).toLocaleString() : null],
            ["Token Expires", account.expires_at ? new Date(account.expires_at).toLocaleDateString() : "Never (API Key)"],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Platform Health Dashboard ────────────────────────────────────────────
function PlatformHealthDashboard({ health }) {
  if (!health || !health.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <WifiOff className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No platforms connected yet</p>
      </div>
    );
  }


  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {health.map((h) => {
        const meta      = PLATFORM_META[h.platform];
        const isHealthy = h.status === "active" && !h.isExpired;
        return (
          <div key={h.platform}
            className={`rounded-2xl border p-4 space-y-3
              ${isHealthy ? "border-border bg-card" : "border-amber-500/30 bg-amber-500/5"}`}>
            <div className="flex items-center gap-2.5">
              <span className="text-lg">{meta?.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{h.displayName}</p>
                <StatusBadge status={h.isExpired ? "expired" : h.status} />
              </div>
              {isHealthy
                ? <Wifi className="h-4 w-4 text-green-500 shrink-0" />
                : <WifiOff className="h-4 w-4 text-amber-500 shrink-0" />}
            </div>
            <div className="space-y-1">
              {h.accountName && (
                <p className="text-xs text-muted-foreground truncate">{h.accountName}</p>
              )}
              {h.lastVerifiedAt && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Verified {new Date(h.lastVerifiedAt).toLocaleString()}
                </p>
              )}
              {h.isExpired && (
                <p className="text-[10px] text-amber-500 font-medium">Token expired — reconnect to restore publishing</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ─── Main component ────────────────────────────────────────────────────────
export default function PublishingAccounts() {
  const [accounts,    setAccounts]    = useState([]);
  const [health,      setHealth]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [activeTab,   setActiveTab]   = useState("accounts");
  const [successMsg,  setSuccessMsg]  = useState(null);
  const [errorMsg,    setErrorMsg]    = useState(null);


  const token = tokenStorage.getUserToken?.() || "";


  // MODULAR: Get active platforms from platform manager
  const activePlatforms = getActivePlatforms();


  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const [acRes, hlRes] = await Promise.all([
        apiClient.get("/publish/accounts",       token),
        apiClient.get("/publish/accounts/health", token),
      ]);
      setAccounts(acRes.accounts || []);
      setHealth(hlRes.health     || []);
    } catch (err) {
      setErrorMsg(err.message || "Failed to load account data");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [token]);


  useEffect(() => { load(); }, [load]);


  const handleConnect = async ({ platformId, credentials }) => {
    const res = await apiClient.post("/publish/accounts/connect", { platform: platformId, credentials }, token);
    setSuccessMsg(res.message || `${platformId} connected`);
    setTimeout(() => setSuccessMsg(null), 4000);
    await load(true);
  };


  const handleDisconnect = async (platformId) => {
    await apiClient.post("/publish/accounts/disconnect", { platform: platformId }, token);
    setSuccessMsg(`${PLATFORM_META[platformId]?.label || platformId} disconnected`);
    setTimeout(() => setSuccessMsg(null), 3000);
    await load(true);
  };


  const handleVerify = async (platformId) => {
    const res = await apiClient.post(`/publish/accounts/${platformId}/verify`, {}, token);
    await load(true);
    return res;
  };


  const accountMap = Object.fromEntries(accounts.map((a) => [a.platform, a]));


  const TABS = [
    { id: "accounts", label: "Connected Accounts" },
    { id: "health",   label: "Platform Health"    },
    { id: "analytics", label: "Analytics"          },
  ];


  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">


      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Publishing Module</p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">Platform Accounts</h1>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
          {refreshing ? <Spinner size={3} /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>


      {/* Alerts */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-600 flex-1">{successMsg}</p>
          <button onClick={() => setSuccessMsg(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{errorMsg}</p>
          <button onClick={() => setErrorMsg(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
      )}


      {/* Tabs */}
      <div className="flex rounded-xl border border-border bg-muted/20 p-1 gap-1">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all
              ${activeTab === tab.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {tab.label}
          </button>
        ))}
      </div>


      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size={6} />
        </div>
      ) : (
        <>
          {/* ── Accounts tab ── */}
          {activeTab === "accounts" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Connect your blog publishing accounts. Credentials are encrypted and stored securely.
              </p>


              {/* Active platforms */}
              <div className="space-y-3">
                {activePlatforms.map((platform) => (
                  <PlatformCard
                    key={platform.name}
                    platformId={platform.name}
                    account={accountMap[platform.name] || null}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onVerify={handleVerify}
                  />
                ))}
              </div>


              {/* Research platforms (read-only info) */}
              <div className="space-y-2 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Research Phase — Coming Later</p>
                {RESEARCH_PLATFORMS.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-border/50 bg-muted/10 px-4 py-3">
                    <span className="text-lg">{p.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{p.label}</p>
                      <p className="text-[10px] text-muted-foreground">{p.note}</p>
                    </div>
                    <span className="rounded-full border border-border bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">Research</span>
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* ── Health tab ── */}
          {activeTab === "health" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/10 px-4 py-3">
                <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Health shows the last known status of each connected account. Use the verify button on each platform card to run a live check.
                </p>
              </div>
              <PlatformHealthDashboard health={health} />


              {health.some((h) => h.isExpired) && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                  <p className="text-sm text-amber-700">
                    One or more platform tokens have expired. Go to the Accounts tab and reconnect those platforms to restore publishing.
                  </p>
                </div>
              )}


              {health.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Connect a platform account to see its health status here.
                </p>
              )}
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="p-6">
              <AnalyticsDashboard />
            </div>
          )}
        </>
      )}

    </div>
  );
}
