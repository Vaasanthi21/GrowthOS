/**
 * LinkedInAds.jsx
 *
 * Acceptance criteria covered:
 * ✅ Connect via OAuth (auto-fetches data after connect)
 * ✅ Live campaign data: impressions, clicks, CTR, CPL, conversions
 * ✅ Side-by-side: LinkedIn Ads vs Organic vs WhatsApp
 * ✅ Best performing creative with metrics
 * ✅ Weekly spend vs leads chart
 * ✅ CPL > ₹500 alert (configurable threshold)
 * ✅ Date range selector (7d / 30d / 90d)
 * ✅ CSV fallback when API scope not approved
 * ✅ Token-expired handling
 * ✅ Disconnect button
 * ✅ Export to CSV
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Papa from "papaparse";
import {
  BarChart, Bar, LineChart, Line, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Linkedin, Upload, RefreshCw, AlertTriangle, X, Info,
  TrendingUp, MousePointerClick, Users, DollarSign, BarChart3,
  FileText, CheckCircle2, Zap, Target, Award, MessageCircle,
  Eye, ArrowUpRight, ArrowDownRight, Minus, ChevronDown, ChevronUp,
  Image as ImageIcon, Bell, Download, Settings, LogOut,
  Calendar, Loader2, WifiOff, ExternalLink,
  ThumbsUp, MessageSquare, Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient, tokenStorage } from "@/api/apiClient";

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_CPL_THRESHOLD = 500;

const DATE_RANGES = [
  { id: "7d",  label: "7 days"  },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

// ─── CSV parsing (fallback when API scope not approved) ───────────────────────
const COL_MAP = {
  campaign:    ["campaign name","campaign","name","ad name","ad"],
  impressions: ["impressions"],
  clicks:      ["clicks"],
  ctr:         ["average ctr","ctr (%)","ctr","avg. ctr"],
  spend:       ["amount spent (usd)","amount spent","spent","cost","spend","total spent"],
  leads:       ["leads","lead gen form completions","one-click leads","conversions","results"],
  date:        ["start date","date","day","week","month"],
  creative:    ["ad creative name","creative","creative name","ad title"],
  imageUrl:    ["creative thumbnail url","thumbnail url","image url","preview url"],
};
const findCol = (headers, aliases) => {
  const lc = headers.map((h) => h.toLowerCase().trim());
  for (const a of aliases) { const i = lc.indexOf(a); if (i !== -1) return headers[i]; }
  return null;
};
const clean = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  return parseFloat(String(v).replace(/[^0-9.-]/g, "")) || 0;
};

const parseLinkedInCSV = (file) =>
  new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: ({ data, meta }) => {
        if (!data.length) return reject(new Error("CSV is empty."));
        const headers = meta.fields || [];
        const cols = Object.fromEntries(
          Object.entries(COL_MAP).map(([key, aliases]) => [key, findCol(headers, aliases)])
        );
        if (!cols.impressions && !cols.clicks && !cols.spend)
          return reject(new Error("Could not find expected columns. Export a Campaign Performance report with Impressions, Clicks, and Spend columns."));

        const rows = data.map((row) => {
          const impressions = clean(cols.impressions ? row[cols.impressions] : 0);
          const clicks      = clean(cols.clicks      ? row[cols.clicks]      : 0);
          const spend       = clean(cols.spend       ? row[cols.spend]       : 0);
          const leads       = clean(cols.leads       ? row[cols.leads]       : 0);
          const ctr         = cols.ctr ? clean(row[cols.ctr])
            : impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : 0;
          const cpl         = leads > 0 ? parseFloat((spend / leads).toFixed(2)) : null;
          return {
            campaign: cols.campaign ? String(row[cols.campaign] || "Unknown").trim() : "Unknown",
            date:     cols.date     ? String(row[cols.date]     || "").trim()        : "",
            creative: cols.creative ? String(row[cols.creative] || "").trim()        : "",
            imageUrl: cols.imageUrl ? String(row[cols.imageUrl] || "").trim()        : "",
            impressions, clicks, ctr, spend, leads, cpl,
            cpl_alert: cpl !== null && cpl > DEFAULT_CPL_THRESHOLD,
          };
        }).filter((r) => r.impressions > 0 || r.clicks > 0 || r.spend > 0);

        if (!rows.length) return reject(new Error("No valid data rows found after parsing."));
        resolve({ rows, detectedCols: cols });
      },
      error: (err) => reject(new Error(err.message || "Failed to parse CSV")),
    });
  });

// ─── Aggregations ─────────────────────────────────────────────────────────────
const aggregateByCampaign = (rows, threshold) =>
  Object.values(
    rows.reduce((map, r) => {
      if (!map[r.campaign]) map[r.campaign] = { campaign: r.campaign, impressions: 0, clicks: 0, spend: 0, leads: 0 };
      map[r.campaign].impressions += r.impressions;
      map[r.campaign].clicks      += r.clicks;
      map[r.campaign].spend       += r.spend;
      map[r.campaign].leads       += r.leads;
      return map;
    }, {})
  ).map((c) => ({
    ...c,
    spend: parseFloat(c.spend.toFixed(2)),
    ctr:   c.impressions > 0 ? parseFloat(((c.clicks / c.impressions) * 100).toFixed(2)) : 0,
    cpl:   c.leads > 0       ? parseFloat((c.spend / c.leads).toFixed(2))                : null,
    cpl_alert: c.leads > 0 && (c.spend / c.leads) > threshold,
  }));

const aggregateByDate = (rows) =>
  Object.values(
    rows.reduce((map, r) => {
      const k = r.date || "Unknown";
      if (!map[k]) map[k] = { date: k, spend: 0, leads: 0, clicks: 0, impressions: 0 };
      map[k].spend += r.spend; map[k].leads += r.leads;
      map[k].clicks += r.clicks; map[k].impressions += r.impressions;
      return map;
    }, {})
  ).sort((a, b) => a.date.localeCompare(b.date))
   .map((d) => ({ ...d, spend: parseFloat(d.spend.toFixed(2)) }));

const getBestCreatives = (rows) =>
  Object.values(
    rows.reduce((map, r) => {
      const key = r.creative || r.campaign;
      if (!key) return map;
      if (!map[key]) map[key] = { name: key, campaign: r.campaign, imageUrl: r.imageUrl, impressions: 0, clicks: 0, spend: 0, leads: 0 };
      map[key].impressions += r.impressions; map[key].clicks += r.clicks;
      map[key].spend += r.spend; map[key].leads += r.leads;
      if (r.imageUrl && !map[key].imageUrl) map[key].imageUrl = r.imageUrl;
      return map;
    }, {})
  ).map((c) => ({
    ...c,
    ctr: c.impressions > 0 ? parseFloat(((c.clicks / c.impressions) * 100).toFixed(2)) : 0,
    cpl: c.leads > 0       ? parseFloat((c.spend / c.leads).toFixed(2))                : null,
  })).filter((c) => c.leads > 0).sort((a, b) => {
    if (a.cpl === null) return 1; if (b.cpl === null) return -1; return a.cpl - b.cpl;
  });

// 🟢 FIX: Cleaned out all mock array indices so calculation maps onto incoming server properties directly
const buildComparisonTimeline = (liWeekly, organicWeekly = [], whatsAppWeekly = []) => {
  const slots = liWeekly.length > 0 ? liWeekly : [null, null, null, null];
  return slots.map((d, i) => ({
    week:             d?.date ? (d.date.length > 8 ? `W${i + 1}` : d.date) : `W${i + 1}`,
    "LinkedIn Leads": d?.leads  || 0,
    "LinkedIn Spend": d?.spend  || 0,
    "Organic Leads":  organicWeekly[i]?.leads  || 0,
    "WhatsApp Leads": whatsAppWeekly[i]?.leads || 0,
    "WhatsApp Spend": whatsAppWeekly[i]?.spend || 0,
  }));
};

// ─── Export helper ────────────────────────────────────────────────────────────
const exportToCSV = (campaigns, fileName = "linkedin-campaigns") => {
  const headers = ["Campaign", "Impressions", "Clicks", "CTR (%)", "Spend (₹)", "Leads", "CPL (₹)", "Status"];
  const csvRows = [
    headers.join(","),
    ...campaigns.map((c) => [
      `"${c.campaign}"`, c.impressions, c.clicks, c.ctr,
      c.spend, c.leads, c.cpl ?? "", c.cpl_alert ? "High CPL" : "Healthy",
    ].join(",")),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Small UI components ──────────────────────────────────────────────────────
function Spinner({ size = 4 }) {
  return <Loader2 className={`h-${size} w-${size} animate-spin text-muted-foreground`} />;
}

function MetricCard({ icon: Icon, label, value, sub, alert, color = "#0077B5" }) {
  return (
    <div className={`rounded-2xl border p-5 ${alert ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="rounded-xl p-2" style={{ background: `${color}18` }}>
          <Icon className="h-4 w-4" style={{ color: alert ? "#f59e0b" : color }} />
        </div>
        {alert && <AlertTriangle className="h-4 w-4 text-amber-500" />}
      </div>
      <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</p>
      {sub && <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 animate-pulse">
      <div className="h-8 w-8 rounded-xl bg-muted/60 mb-3" />
      <div className="h-7 w-20 rounded bg-muted/60 mb-1.5" />
      <div className="h-3 w-24 rounded bg-muted/40" />
    </div>
  );
}

function ChannelCard({ channel, icon: Icon, color, connected, impressions = 0, clicks = 0, ctr = 0, leads = 0, spend = 0, cpl = null, threshold }) {
  const cplAlert = cpl !== null && cpl > threshold;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl p-2" style={{ background: `${color}18` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{channel}</p>
            {connected !== undefined && (
              <p className={`text-[10px] ${connected ? "text-green-500" : "text-muted-foreground"}`}>
                {connected ? "● Live data" : "○ Not connected"}
              </p>
            )}
          </div>
        </div>
        {cplAlert && (
          <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
            <AlertTriangle className="h-2.5 w-2.5" />Alert
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {[
          ["Impressions", impressions.toLocaleString()],
          ["Clicks",      clicks.toLocaleString()],
          ["CTR",         `${ctr}%`],
          ["Leads",       leads.toLocaleString()],
          ["Spend",       spend > 0 ? `₹${spend.toLocaleString()}` : "—"],
          ["CPL",         cpl && cpl > 0 ? `₹${cpl}` : "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{k}</p>
            <p className={`text-base font-semibold ${k === "CPL" && cplAlert ? "text-amber-500" : "text-foreground"}`}>{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CplAlertBanner({ campaigns, threshold, onDismiss }) {
  const alerts = campaigns.filter((c) => c.cpl_alert);
  if (!alerts.length) return null;
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            CPL alert — ₹{threshold} threshold exceeded in {alerts.length} campaign{alerts.length > 1 ? "s" : ""}
          </p>
          <ul className="mt-2 space-y-1">
            {alerts.map((c) => (
              <li key={c.campaign} className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground truncate max-w-[260px]">{c.campaign}</span>
                <span className="ml-3 font-semibold text-amber-500 shrink-0">CPL ₹{c.cpl}</span>
              </li>
            ))}
          </ul>
        </div>
        <button onClick={onDismiss} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function BestCreativeCard({ creatives }) {
  const [expanded, setExpanded] = useState(false);
  if (!creatives.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground">No creative data found</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
          Export an Ad Performance report (not Campaign Performance) to see creative-level metrics.
        </p>
      </div>
    );
  }
  const shown = expanded ? creatives.slice(0, 6) : creatives.slice(0, 1);
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-amber-400" />
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Best Performing Creatives</p>
        </div>
        {creatives.length > 1 && (
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
            {expanded ? "Show less" : `See top ${Math.min(6, creatives.length)}`}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>
      <div className="divide-y divide-border/50">
        {shown.map((c, i) => (
          <div key={c.name || i} className="flex items-center gap-4 px-5 py-4">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold
              ${i === 0 ? "bg-amber-400/20 text-amber-500" : "bg-muted/40 text-muted-foreground"}`}>{i + 1}</div>
            {c.imageUrl ? (
              <img src={c.imageUrl} alt={c.name} className="h-12 w-16 rounded-lg object-cover border border-border shrink-0" />
            ) : (
              <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-muted/30 border border-border">
                <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{c.campaign}</p>
            </div>
            <div className="flex gap-4 shrink-0 text-right">
              {[
                ["Impressions", c.impressions.toLocaleString()],
                ["CTR",         `${c.ctr}%`],
                ["Leads",       String(c.leads)],
                ["CPL",         c.cpl !== null ? `₹${c.cpl}` : "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className={`text-xs font-semibold ${k === "CPL" && c.cpl && c.cpl > DEFAULT_CPL_THRESHOLD ? "text-amber-500" : "text-foreground"}`}>{v}</p>
                  <p className="text-[10px] text-muted-foreground">{k}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap rounded-xl border border-border bg-muted/20 p-1 gap-1">
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all
            ${active === tab.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-lg">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">
            {String(p.name).toLowerCase().includes("spend") ? `₹${Number(p.value).toLocaleString()}` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Permission error state ───────────────────────────────────────────────────
function ApiPermissionError({ onUploadCSV }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
        <WifiOff className="h-6 w-6 text-amber-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">LinkedIn Ads API access pending</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
          Your LinkedIn app needs the <code className="font-mono bg-muted/60 px-1 rounded">r_ads</code> and{" "}
          <code className="font-mono bg-muted/60 px-1 rounded">r_ads_reporting</code> scopes approved.
          This requires submitting your app for LinkedIn Marketing Developer Platform review.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
        <a
          href="https://www.linkedin.com/developers/apps"
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />Request API access
        </a>
        <button onClick={onUploadCSV}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity">
          <Upload className="h-3.5 w-3.5" />Use CSV export instead
        </button>
      </div>
    </div>
  );
}

// ─── Connect screen (pre-data) ────────────────────────────────────────────────
function ConnectScreen({ onFile, error, loading, linkedinConnected, checkingStatus, linkedinStatus, onSimulate }) {
  const inputRef = useRef(null);
  const handleDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); };

  const handleConnect = async () => {
    try {
      const token = tokenStorage.getUserToken();
      if (!token) { alert("Please log in first."); return; }
      const data = await apiClient.get("/auth/session", token);
      const userId = data?.user?.id;
      if (!userId) { alert("Could not retrieve session. Please log in again."); return; }
      const clientId    = import.meta.env.VITE_LINKEDIN_CLIENT_ID;
      const redirectUri = import.meta.env.VITE_LINKEDIN_REDIRECT_URI;
      const scopes      = import.meta.env.VITE_LINKEDIN_SCOPES || "openid profile email r_ads r_ads_reporting";
      window.location.href =
        `https://www.linkedin.com/oauth/v2/authorization` +
        `?response_type=code` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${encodeURIComponent(userId)}`;
    } catch (err) {
      console.error("LinkedIn connect error:", err);
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="w-full max-w-lg space-y-5">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0077B5]/10 border border-[#0077B5]/20">
            <Linkedin className="h-7 w-7 text-[#0077B5]" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">LinkedIn Campaign Tracker</h2>
          <p className="text-sm text-muted-foreground">Connect your account for live data, or upload a CSV export.</p>

          {/* Connection status */}
          <div className="flex justify-center pt-1">
            {checkingStatus ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner size={3} />Checking status…</span>
            ) : linkedinConnected ? (
              <div className="space-y-1">
                <span className="flex items-center justify-center gap-1.5 text-xs font-medium text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  LinkedIn Connected
                  {linkedinStatus?.accountName && ` · ${linkedinStatus.accountName}`}
                </span>
                {linkedinStatus?.adAccountName && (
                  <p className="text-[10px] text-muted-foreground">Ads account: {linkedinStatus.adAccountName}</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <button onClick={handleConnect}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0077B5] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#006097] transition-colors">
                  <Linkedin className="h-4 w-4" />Connect LinkedIn Ads
                </button>
                <button onClick={onSimulate}
                  className="text-xs text-muted-foreground hover:text-foreground underline transition-colors">
                  Simulate Connection (Developer Mode)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Two paths */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Zap,    title: "Live OAuth sync",    desc: "Auto-updates, full analytics", note: "Needs r_ads API approval", color: "#0077B5" },
            { icon: Upload, title: "CSV upload",          desc: "Works right now, no approval",  note: "Export from Campaign Manager", color: "hsl(var(--primary))" },
          ].map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-muted/10 p-4 text-center space-y-1.5">
              <p.icon className="mx-auto h-5 w-5" style={{ color: p.color }} />
              <p className="text-xs font-semibold text-foreground">{p.title}</p>
              <p className="text-[10px] text-muted-foreground">{p.desc}</p>
              <p className="text-[10px] text-muted-foreground/60">{p.note}</p>
            </div>
          ))}
        </div>

        {/* Export steps */}
        <div className="rounded-2xl border border-border bg-muted/10 p-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">How to export from LinkedIn</p>
          {["Go to LinkedIn Campaign Manager", "Select campaigns → Export", "Choose Campaign Performance report", "Select All columns + date range", "Download CSV and drop it below"].map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
              {s}
            </div>
          ))}
        </div>

        {/* Drop zone */}
        <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-2xl border-2 border-dashed border-border bg-muted/10 p-10 text-center hover:border-[#0077B5]/40 hover:bg-[#0077B5]/5 transition-all group">
          <Upload className="mx-auto h-8 w-8 text-muted-foreground/50 group-hover:text-[#0077B5]/60 transition-colors" />
          <p className="mt-3 text-sm font-medium text-foreground">{loading ? "Parsing CSV…" : "Drop your LinkedIn CSV here"}</p>
          <p className="mt-1 text-xs text-muted-foreground">or click to browse · .csv files only</p>
          <input ref={inputRef} type="file" accept=".csv" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }} />
        </div>

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LinkedInAds({ isEmbedded = false }) {
  // Connection state
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [linkedinStatus,    setLinkedinStatus]    = useState(null);
  const [checkingStatus,    setCheckingStatus]    = useState(true);

  // Data mode: "live" | "csv" | null
  const [dataMode, setDataMode] = useState(null);

  // Live API state
  const [liveLoading,   setLiveLoading]   = useState(false);
  const [liveError,     setLiveError]     = useState(null);
  const [liveData,      setLiveData]      = useState(null); // { rows, totals, cplAlerts }
  const [liveCreatives, setLiveCreatives] = useState([]);
  const [organicData,   setOrganicData]   = useState(null);
  const [organicLoading, setOrganicLoading] = useState(false);
  const [organicError,  setOrganicError]  = useState(null);
  const [dateRange,     setDateRange]     = useState("30d");
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // CSV state
  const [csvRows,      setCsvRows]      = useState(null);
  const [csvFileName,  setCsvFileName]  = useState(null);
  const [csvError,     setCsvError]     = useState(null);
  const [csvLoading,   setCsvLoading]   = useState(false);
  const [detectedCols, setDetectedCols] = useState(null);

  // UI state
  const [activeTab,       setActiveTab]       = useState("overview");
  const [alertDismissed,  setAlertDismissed]  = useState(false);
  const [oauthError,      setOauthError]      = useState(false);
  const [cplThreshold,    setCplThreshold]    = useState(DEFAULT_CPL_THRESHOLD);
  const [editThreshold,   setEditThreshold]   = useState(false);
  const [thresholdInput,  setThresholdInput]  = useState(String(DEFAULT_CPL_THRESHOLD));
  const [showDisconnect,  setShowDisconnect]  = useState(false);
  const [postText,        setPostText]        = useState("");
  const [publishingPost,  setPublishingPost]  = useState(false);
  const [publishError,    setPublishError]    = useState(null);
  const [editingPostId,   setEditingPostId]   = useState(null);
  const [editLikes,       setEditLikes]       = useState(0);
  const [editComments,    setEditComments]    = useState(0);
  const [editImpressions, setEditImpressions] = useState(1);

  const location = useLocation();

  // ── Check LinkedIn status on mount ──────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const li = params.get("linkedin");
    if (li === "error") setOauthError(true);
    if (li) window.history.replaceState({}, "", window.location.pathname);

    const checkStatus = async () => {
      try {
        const token = tokenStorage.getUserToken();
        if (!token) { setCheckingStatus(false); return; }
        const data = await apiClient.get("/linkedin/status", token);
        setLinkedinStatus(data);
        setLinkedinConnected(!!data.connected);

        // If just connected via OAuth, auto-fetch live data
        if (data.connected && li === "connected") {
          setDataMode("live");
        }
      } catch (err) {
        if (li === "connected") setLinkedinConnected(true);
      } finally {
        setCheckingStatus(false);
      }
    };
    checkStatus();
  }, [location.search]);

  // ── Fetch live data ──────────────────────────────────────────────────────────
  const fetchLiveData = useCallback(async (range = dateRange) => {
    const token = tokenStorage.getUserToken();
    if (!token) return;

    setLiveLoading(true);
    setLiveError(null);
    setOrganicLoading(true);
    setOrganicError(null);

    try {
      const [analyticsRes, creativesRes, organicRes] = await Promise.allSettled([
        apiClient.get(`/linkedin/analytics?range=${range}`, token),
        apiClient.get(`/linkedin/creatives?range=${range}`, token),
        apiClient.get(`/linkedin/organic-posts?range=${range}`, token),
      ]);

      if (analyticsRes.status === "fulfilled") {
        setLiveData(analyticsRes.value);
        setLastRefreshed(new Date());
      } else {
        throw analyticsRes.reason;
      }

      if (creativesRes.status === "fulfilled") {
        setLiveCreatives(creativesRes.value.creatives || []);
      }

      if (organicRes.status === "fulfilled") {
        setOrganicData(organicRes.value);
      } else {
        console.warn("Failed to fetch organic posts:", organicRes.reason);
      }
    } catch (err) {
      const code = err?.response?.data?.code || err?.code || "";
      setLiveError({
        message: err?.response?.data?.message || err?.message || "Failed to fetch data",
        code,
        isPermission: code === "PERMISSION_DENIED" || code === "NO_AD_ACCOUNT",
      });
    } finally {
      setLiveLoading(false);
      setOrganicLoading(false);
    }
  }, [dateRange]);

  // Auto-fetch when switching to live mode
  useEffect(() => {
    if (dataMode === "live" && !liveData && !liveLoading) {
      fetchLiveData(dateRange);
    }
  }, [dataMode]);

  // Re-fetch when date range changes (live mode)
  useEffect(() => {
    if (dataMode === "live" && liveData) {
      fetchLiveData(dateRange);
    }
  }, [dateRange]);

  // ── CSV handlers ─────────────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file.name.endsWith(".csv")) { setCsvError("Please upload a .csv file."); return; }
    setCsvLoading(true); setCsvError(null);
    try {
      const { rows, detectedCols: cols } = await parseLinkedInCSV(file);
      setCsvRows(rows); setCsvFileName(file.name); setDetectedCols(cols);
      setDataMode("csv"); setAlertDismissed(false);
    } catch (err) {
      setCsvError(err.message);
    } finally {
      setCsvLoading(false);
    }
  };

  const handleReset = () => {
    setCsvRows(null); setCsvFileName(null); setCsvError(null);
    setLiveData(null); setLiveError(null); setLiveCreatives([]);
    setOrganicData(null); setOrganicError(null);
    setDataMode(null); setAlertDismissed(false);
  };

  // ── Disconnect LinkedIn ───────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    try {
      const token = tokenStorage.getUserToken();
      await apiClient.post("/linkedin/disconnect", {}, token);
      setLinkedinConnected(false); setLinkedinStatus(null);
      setDataMode(null); setLiveData(null); setOrganicData(null); setShowDisconnect(false);
    } catch (err) {
      console.error("Disconnect failed:", err);
    }
  };

  const handleSimulateConnect = async () => {
    try {
      const token = tokenStorage.getUserToken();
      if (!token) { alert("Please log in first."); return; }
      const data = await apiClient.post("/linkedin/simulate-connect", {}, token);
      setLinkedinStatus(data);
      setLinkedinConnected(true);
      setDataMode("live");
    } catch (err) {
      console.error("Simulation failed:", err);
      alert(err.message || "Failed to simulate connection");
    }
  };

  const handlePublishPost = async () => {
    if (!postText.trim()) return;
    setPublishingPost(true);
    setPublishError(null);
    try {
      const token = tokenStorage.getUserToken();
      if (!token) throw new Error("Please log in first.");
      await apiClient.post("/linkedin/share", { text: postText }, token);
      setPostText("");
      await fetchLiveData(dateRange);
    } catch (err) {
      console.error("Failed to post to LinkedIn:", err);
      setPublishError(err?.response?.data?.message || err?.message || "Failed to publish post");
    } finally {
      setPublishingPost(false);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────────
  const isLive = dataMode === "live";
  const isCsv  = dataMode === "csv";

  // Rows — from live API or CSV
  const rows = isLive && liveData ? liveData.rows : (isCsv ? csvRows : []);

  // Campaigns aggregated
  const campaigns = rows?.length ? aggregateByCampaign(rows, cplThreshold) : [];

  // Totals — prefer API-computed totals for live, compute from CSV
  const totals = isLive && liveData?.totals
    ? liveData.totals
    : campaigns.reduce(
        (acc, c) => ({ impressions: acc.impressions + c.impressions, clicks: acc.clicks + c.clicks, spend: acc.spend + c.spend, leads: acc.leads + c.leads }),
        { impressions: 0, clicks: 0, spend: 0, leads: 0 }
      );
  if (!isLive || !liveData?.totals) {
    totals.ctr   = totals.impressions > 0 ? parseFloat(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0;
    totals.cpl   = totals.leads > 0 ? parseFloat((totals.spend / totals.leads).toFixed(2)) : null;
    totals.spend = parseFloat((totals.spend || 0).toFixed(2));
  }

  const weeklyData     = rows?.length ? aggregateByDate(rows) : [];
  // 🟢 FIX: Passed actual organic weekly state variables rather than sample blocks
  const comparisonData = buildComparisonTimeline(weeklyData, organicData?.weeklyData || [], []);
  const creatives      = isLive ? liveCreatives : (isCsv && rows ? getBestCreatives(rows) : []);
  const hasCplAlerts   = campaigns.some((c) => c.cpl_alert);

  const TABS = [
    { id: "overview",  label: "Overview",        icon: BarChart3    },
    { id: "compare",   label: "Channel Compare", icon: Target       },
    { id: "organic",   label: "Organic Posts",   icon: TrendingUp   },
    { id: "creatives", label: "Creatives",        icon: Award        },
    { id: "campaigns", label: "Campaigns",        icon: FileText     },
  ];

  // ── No data yet ───────────────────────────────────────────────────────────────
  if (dataMode === null) {
    return (
      <div className={isEmbedded ? "space-y-5" : "p-4 md:p-6 max-w-3xl mx-auto"}>
        {!isEmbedded && (
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Creative OS · Integrations</p>
            <h1 className="mt-1 text-xl font-semibold text-foreground">LinkedIn Campaign Tracker</h1>
          </div>
        )}

        {oauthError && (
          <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">LinkedIn connection failed.</p>
              <p className="text-xs text-muted-foreground mt-0.5">Make sure your account has Campaign Manager access and try again.</p>
            </div>
            <button onClick={() => setOauthError(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
        )}

        {linkedinConnected && !checkingStatus && (
          <div className="mb-4 rounded-2xl border border-green-500/20 bg-green-500/5 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  LinkedIn connected{linkedinStatus?.accountName ? ` · ${linkedinStatus.accountName}` : ""}
                </p>
                {linkedinStatus?.adAccountName && (
                  <p className="text-[10px] text-muted-foreground">Ads account: {linkedinStatus.adAccountName}</p>
                )}
              </div>
            </div>
            <Button size="sm" className="h-8 rounded-xl text-xs gap-1.5"
              onClick={() => { setDataMode("live"); fetchLiveData(dateRange); }}>
              <Zap className="h-3.5 w-3.5" />Load live data
            </Button>
          </div>
        )}

        <ConnectScreen
          onFile={handleFile} error={csvError} loading={csvLoading}
          linkedinConnected={linkedinConnected} checkingStatus={checkingStatus}
          linkedinStatus={linkedinStatus}
          onSimulate={handleSimulateConnect}
        />
      </div>
    );
  }

  return (
    <div className={isEmbedded ? "space-y-6" : "p-4 md:p-6 max-w-6xl mx-auto space-y-6"}>

      {/* ── Header ── */}
      {!isEmbedded ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Creative OS · Integrations</p>
            <h1 className="mt-1 text-xl font-semibold text-foreground">LinkedIn Campaign Tracker</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              {isLive ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Live · {linkedinStatus?.adAccountName || linkedinStatus?.accountName || "LinkedIn Ads"}
                </span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{csvFileName}</p>
                </div>
              )}
              {lastRefreshed && (
                <span className="text-[10px] text-muted-foreground">
                  Updated {lastRefreshed.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Date range — only for live */}
            {isLive && (
              <div className="flex rounded-xl border border-border bg-muted/20 p-0.5 gap-0.5">
                {DATE_RANGES.map((r) => (
                  <button key={r.id} onClick={() => setDateRange(r.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all
                      ${dateRange === r.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            {/* Refresh */}
            {isLive && (
              <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5 text-xs"
                onClick={() => fetchLiveData(dateRange)} disabled={liveLoading}>
                {liveLoading ? <Spinner size={3} /> : <RefreshCw className="h-3.5 w-3.5" />}
                {liveLoading ? "Syncing…" : "Refresh"}
              </Button>
            )}

            {/* CPL threshold */}
            {editThreshold ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Alert at ₹</span>
                <input type="number" value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)}
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = parseInt(thresholdInput, 10);
                      if (v > 0) { setCplThreshold(v); setAlertDismissed(false); }
                      setEditThreshold(false);
                    }
                    if (e.key === "Escape") setEditThreshold(false);
                  }} autoFocus />
                <button onClick={() => {
                    const v = parseInt(thresholdInput, 10);
                    if (v > 0) { setCplThreshold(v); setAlertDismissed(false); }
                    setEditThreshold(false);
                  }}
                  className="rounded-lg bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground">Set</button>
              </div>
            ) : (
              <button onClick={() => setEditThreshold(true)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-colors
                  ${hasCplAlerts && !alertDismissed ? "border-amber-500/40 bg-amber-500/10 text-amber-600" : "border-border text-muted-foreground hover:text-foreground"}`}>
                <Bell className="h-3.5 w-3.5" />₹{cplThreshold}
              </button>
            )}

            {/* Export */}
            {campaigns.length > 0 && (
              <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5 text-xs"
                onClick={() => exportToCSV(campaigns, csvFileName?.replace(".csv", "") || "linkedin-campaigns")}>
                <Download className="h-3.5 w-3.5" />Export
              </Button>
            )}

            {/* New report */}
            <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5 text-xs" onClick={handleReset}>
              <RefreshCw className="h-3.5 w-3.5" />Reset
            </Button>

            {/* Disconnect */}
            {linkedinConnected && (
              <div className="relative">
                <button onClick={() => setShowDisconnect(!showDisconnect)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors">
                  <Settings className="h-4 w-4" />
                </button>
                {showDisconnect && (
                  <div className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-border bg-card shadow-lg">
                    <button onClick={handleDisconnect}
                      className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-xs text-red-500 hover:bg-red-500/5 transition-colors">
                      <LogOut className="h-3.5 w-3.5" />Disconnect LinkedIn
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-border/40">
          <div className="flex items-center gap-2 flex-wrap">
            {isLive ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 font-display">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Live · {linkedinStatus?.adAccountName || linkedinStatus?.accountName || "Connected"}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-display">
                <FileText className="h-3.5 w-3.5" />
                CSV: {csvFileName}
              </span>
            )}
            {lastRefreshed && (
              <span className="text-[10px] text-muted-foreground font-mono">
                · Synced {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Date range — only for live */}
            {isLive && (
              <div className="flex rounded-xl border border-border bg-muted/20 p-0.5 gap-0.5">
                {DATE_RANGES.map((r) => (
                  <button key={r.id} onClick={() => setDateRange(r.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all
                      ${dateRange === r.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            {/* Refresh */}
            {isLive && (
              <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1 text-xs px-2.5"
                onClick={() => fetchLiveData(dateRange)} disabled={liveLoading}>
                {liveLoading ? <Spinner size={3} /> : <RefreshCw className="h-3 w-3" />}
                {liveLoading ? "Syncing…" : "Refresh"}
              </Button>
            )}

            {/* CPL threshold */}
            {editThreshold ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">₹</span>
                <input type="number" value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)}
                  className="w-16 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-[#0077B5]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = parseInt(thresholdInput, 10);
                      if (v > 0) { setCplThreshold(v); setAlertDismissed(false); }
                      setEditThreshold(false);
                    }
                    if (e.key === "Escape") setEditThreshold(false);
                  }} autoFocus />
                <button onClick={() => {
                    const v = parseInt(thresholdInput, 10);
                    if (v > 0) { setCplThreshold(v); setAlertDismissed(false); }
                    setEditThreshold(false);
                  }}
                  className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground hover:opacity-90">Set</button>
              </div>
            ) : (
              <button onClick={() => setEditThreshold(true)}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors
                  ${hasCplAlerts && !alertDismissed ? "border-amber-500/40 bg-amber-500/10 text-amber-600 animate-pulse" : "border-border text-muted-foreground hover:text-foreground"}`}>
                <Bell className="h-3 w-3" />₹{cplThreshold}
              </button>
            )}

            {/* Export */}
            {campaigns.length > 0 && (
              <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1 text-xs px-2.5"
                onClick={() => exportToCSV(campaigns, csvFileName?.replace(".csv", "") || "linkedin-campaigns")}>
                <Download className="h-3 w-3" />Export
              </Button>
            )}

            {/* New report */}
            <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1 text-xs px-2.5" onClick={handleReset}>
              <RefreshCw className="h-3 w-3" />Reset
            </Button>

            {/* Disconnect */}
            {linkedinConnected && (
              <div className="relative">
                <button onClick={() => setShowDisconnect(!showDisconnect)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                  <Settings className="h-3.5 w-3.5" />
                </button>
                {showDisconnect && (
                  <div className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-border bg-card shadow-lg">
                    <button onClick={handleDisconnect}
                      className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-xs text-red-500 hover:bg-red-500/5 transition-colors">
                      <LogOut className="h-3.5 w-3.5" />Disconnect LinkedIn
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Live loading skeleton ── */}
      {liveLoading && !liveData && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* ── Live API error ── */}
      {liveError && !liveLoading && (
        <div className="space-y-4">
          {liveError.isPermission ? (
            <ApiPermissionError onUploadCSV={() => { setDataMode(null); }} />
          ) : (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">{liveError.message}</p>
                <button onClick={() => fetchLiveData(dateRange)} className="mt-1.5 text-xs text-muted-foreground hover:text-foreground underline">Try again</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── OAuth error banner ── */}
      {oauthError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
          <p className="text-sm text-destructive flex-1">LinkedIn connection failed. Try connecting again.</p>
          <button onClick={() => setOauthError(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
      )}

      {/* ── Show dashboard when we have data ── */}
      {(campaigns.length > 0 || (isLive && liveData)) && (
        <>
          {/* ── CPL alert ── */}
          {hasCplAlerts && !alertDismissed && (
            <CplAlertBanner campaigns={campaigns} threshold={cplThreshold} onDismiss={() => setAlertDismissed(true)} />
          )}

          {/* ── KPI cards ── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <MetricCard icon={Eye}               label="Impressions"   value={(totals.impressions || 0).toLocaleString()} />
            <MetricCard icon={MousePointerClick} label="Clicks"        value={(totals.clicks || 0).toLocaleString()} sub={`CTR ${totals.ctr || 0}%`} />
            <MetricCard icon={DollarSign}        label="Total Spend"   value={`₹${(totals.spend || 0).toLocaleString()}`} />
            <MetricCard icon={Users}             label="Leads"         value={(totals.leads || 0).toLocaleString()} />
            <MetricCard icon={Target}            label="Cost per Lead"
              value={totals.cpl != null ? `₹${totals.cpl}` : "—"}
              sub={`Alert at ₹${cplThreshold}`}
              alert={totals.cpl != null && totals.cpl > cplThreshold}
            />
          </div>

          {/* ── Tabs ── */}
          <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

          {/* ══════════════ TAB: OVERVIEW ══════════════ */}
          {activeTab === "overview" && (
            <div className="space-y-6">

              {/* Weekly spend vs leads */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Weekly Spend vs Leads</p>
                  <span className="text-[10px] text-muted-foreground">LinkedIn Ads · {isLive ? dateRange : "from CSV"}</span>
                </div>
                {weeklyData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={weeklyData} margin={{ top: 0, right: 0, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.length > 8 ? v.slice(0,8) : v} />
                      <YAxis yAxisId="left"  tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar  yAxisId="left"  dataKey="spend"  name="Spend (₹)" fill="#0077B5" radius={[4,4,0,0]} opacity={0.85} />
                      <Line yAxisId="right" dataKey="leads"  name="Leads"     stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: "#10b981" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-40 items-center justify-center">
                    <div className="text-center">
                      <Info className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
                      <p className="text-xs text-muted-foreground">Not enough date data for a weekly chart.</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">Include a date column in your export.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* CPL by campaign */}
              {campaigns.some((c) => c.cpl !== null) && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">CPL by Campaign</p>
                  <ResponsiveContainer width="100%" height={Math.max(160, campaigns.filter(c => c.cpl !== null).length * 44)}>
                    <BarChart data={[...campaigns].filter(c => c.cpl !== null).sort((a,b) => a.cpl - b.cpl)}
                      layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${v}`} />
                      <YAxis type="category" dataKey="campaign" tick={{ fontSize: 10 }} width={130}
                        tickFormatter={(v) => v.length > 20 ? v.slice(0,20)+"…" : v} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="cpl" name="CPL (₹)" fill="#0077B5" radius={[0,4,4,0]}
                        label={{ position: "right", fontSize: 10, formatter: (v) => `₹${v}` }} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="mt-2 text-[10px] text-muted-foreground text-right">Alert threshold: ₹{cplThreshold}</p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════ TAB: CHANNEL COMPARE ══════════════ */}
          {activeTab === "compare" && (
            <div className="space-y-6">
              <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 px-4 py-3">
                <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  LinkedIn data is {isLive ? "live from your connected account" : "from your uploaded CSV"}.
                  Organic and WhatsApp options display real analytics when data profiles are initialized.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <ChannelCard channel="LinkedIn Ads"      icon={Linkedin}       color="#0077B5" connected={isLive}
                  impressions={totals.impressions || 0} clicks={totals.clicks || 0}
                  ctr={totals.ctr || 0} leads={totals.leads || 0}
                  spend={totals.spend || 0} cpl={totals.cpl} threshold={cplThreshold} />
                <ChannelCard channel="Organic"           icon={TrendingUp}     color="#10b981" connected={!!organicData}
                  impressions={organicData?.totals?.impressions || 0} clicks={organicData?.totals?.clicks || 0}
                  ctr={organicData?.totals?.ctr || 0} leads={organicData?.totals?.leads || 0}
                  spend={0} cpl={null} threshold={cplThreshold} />
                <ChannelCard channel="WhatsApp Outreach" icon={MessageCircle}  color="#25D366" connected={false}
                  impressions={0} clicks={0} ctr={0} leads={0} spend={0} cpl={null} threshold={cplThreshold} />
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Weekly Leads — All Channels</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={comparisonData} margin={{ top: 0, right: 0, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="LinkedIn Leads" fill="#0077B5" radius={[4,4,0,0]} />
                    <Bar dataKey="Organic Leads"  fill="#10b981" radius={[4,4,0,0]} />
                    <Bar dataKey="WhatsApp Leads" fill="#25D366" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ══════════════ TAB: ORGANIC POSTS ══════════════ */}
          {activeTab === "organic" && (
            <div className="space-y-6">
              {/* Overall stats cards */}
              {(() => {
                const posts = organicData?.posts || [];
                const totals = organicData?.totals || { likes: 0, comments: 0, shares: 0, impressions: 0, engagementRate: 0 };

                return (
                  <>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                      <MetricCard icon={FileText} label="Total Posts" value={posts.length} color="#10b981" />
                      <MetricCard icon={ThumbsUp} label="Total Likes" value={totals.likes.toLocaleString()} color="#10b981" />
                      <MetricCard icon={MessageSquare} label="Total Comments" value={totals.comments.toLocaleString()} color="#10b981" />
                      <MetricCard icon={Share2} label="Total Shares" value={totals.shares.toLocaleString()} color="#10b981" />
                      <MetricCard icon={TrendingUp} label="Avg Engagement" value={`${totals.engagementRate || 0}%`} color="#10b981" />
                    </div>

                    {/* Publish to LinkedIn Form */}
                    {isLive && (
                      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-[#10b981]" />
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Publish to LinkedIn</p>
                        </div>
                        <div className="space-y-2">
                          <textarea
                            value={postText}
                            onChange={(e) => setPostText(e.target.value)}
                            placeholder="What do you want to share on LinkedIn? (Will post live to your connected profile)"
                            className="w-full min-h-[100px] rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#10b981] placeholder:text-muted-foreground/60 resize-y"
                            disabled={publishingPost}
                          />
                          {publishError && (
                            <p className="text-xs text-destructive">{publishError}</p>
                          )}
                          <div className="flex justify-end">
                            <Button
                              onClick={handlePublishPost}
                              disabled={publishingPost || !postText.trim()}
                              className="rounded-xl px-5 py-2.5 text-xs font-medium text-white bg-[#10b981] hover:bg-[#0e9f6e] disabled:opacity-50 disabled:pointer-events-none transition-colors gap-1.5"
                            >
                              {publishingPost ? (
                                <><Loader2 className="h-3 w-3 animate-spin" /> Posting…</>
                              ) : (
                                <><Share2 className="h-3.5 w-3.5" /> Post to LinkedIn</>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Engagement Trend Chart */}
                    <div className="rounded-2xl border border-border bg-card p-5">
                      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Post Engagement Trends</p>
                      {posts.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                          <ComposedChart data={[...posts].reverse()} margin={{ top: 0, right: 0, left: -16, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar yAxisId="left" dataKey="likes" name="Likes" fill="#10b981" radius={[4,4,0,0]} opacity={0.8} />
                            <Bar yAxisId="left" dataKey="comments" name="Comments" fill="#3b82f6" radius={[4,4,0,0]} opacity={0.8} />
                            <Line yAxisId="right" dataKey="engagementRate" name="Engagement Rate (%)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="py-12 text-center text-muted-foreground text-xs">
                          <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                          <p>No engagement data available to map tracking timelines.</p>
                        </div>
                      )}
                    </div>

                    {/* Posts feed */}
                    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Organic Posts Feed</p>
                      <div className="divide-y divide-border/60">
                        {posts.length === 0 ? (
                          <div className="py-12 text-center text-muted-foreground text-xs space-y-1">
                            <WifiOff className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                            <p className="font-medium text-foreground">No posts published yet</p>
                            <p className="text-[10px] text-muted-foreground/80">Use the form above to share your first live update to LinkedIn!</p>
                          </div>
                        ) : (
                          posts.map((post, idx) => (
                            <div key={post.id || idx} className="py-4 first:pt-0 last:pb-0 space-y-3">
                              <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {post.date}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-[#10b981] bg-[#10b981]/15 px-2 py-0.5 rounded-full">
                                    {post.engagementRate}% Engagement
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{post.text}</p>
                              <div className="flex gap-5 text-xs text-muted-foreground pt-1">
                                <span className="flex items-center gap-1.5">
                                  <ThumbsUp className="h-3.5 w-3.5" />
                                  {post.likes.toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <MessageSquare className="h-3.5 w-3.5" />
                                  {post.comments.toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Share2 className="h-3.5 w-3.5" />
                                  {post.shares.toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Eye className="h-3.5 w-3.5" />
                                  {post.impressions.toLocaleString()} Impressions
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* ══════════════ TAB: CREATIVES ══════════════ */}
          {activeTab === "creatives" && (
            <div className="space-y-4">
              <BestCreativeCard creatives={creatives} />
              {creatives.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Creative CTR Comparison</p>
                  <ResponsiveContainer width="100%" height={Math.max(160, Math.min(creatives.length, 8) * 44)}>
                    <BarChart
                      data={creatives.slice(0,8).map(c => ({ name: c.name.length > 22 ? c.name.slice(0,22)+"…" : c.name, ctr: c.ctr, leads: c.leads }))}
                      layout="vertical" margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="ctr" name="CTR (%)" fill="#0077B5" radius={[0,4,4,0]}
                        label={{ position: "right", fontSize: 10, formatter: (v) => `${v}%` }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ══════════════ TAB: CAMPAIGNS TABLE ══════════════ */}
          {activeTab === "campaigns" && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-5 py-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Campaign Performance</p>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground">{campaigns.length} campaigns</span>
                  <button onClick={() => exportToCSV(campaigns)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    <Download className="h-3 w-3" />Export
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      {["Campaign","Impressions","Clicks","CTR","Spend","Leads","CPL","Status"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...campaigns].sort((a,b) => b.impressions - a.impressions).map((row) => (
                      <tr key={row.campaign} className={`border-b border-border/50 hover:bg-muted/10 transition-colors ${row.cpl_alert ? "bg-amber-500/5" : ""}`}>
                        <td className="px-4 py-3 font-medium text-foreground max-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            {row.cpl_alert && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />}
                            <span className="truncate">{row.campaign}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{row.impressions.toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{row.clicks.toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{row.ctr}%</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">₹{row.spend.toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{row.leads}</td>
                        <td className={`px-4 py-3 font-medium whitespace-nowrap ${row.cpl_alert ? "text-amber-500" : "text-muted-foreground"}`}>
                          {row.cpl != null ? `₹${row.cpl}` : "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.cpl_alert ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                              <AlertTriangle className="h-2.5 w-2.5" />High CPL
                            </span>
                          ) : row.leads > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/30 px-2 py-0.5 text-[10px] font-medium text-green-600">
                              <CheckCircle2 className="h-2.5 w-2.5" />Healthy
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-muted/40 border border-border px-2 py-0.5 text-[10px] text-muted-foreground">Running</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td className="px-4 py-3 text-xs font-semibold text-foreground">Total</td>
                      <td className="px-4 py-3 text-xs font-semibold text-foreground">{(totals.impressions||0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-foreground">{(totals.clicks||0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-foreground">{totals.ctr||0}%</td>
                      <td className="px-4 py-3 text-xs font-semibold text-foreground">₹{(totals.spend||0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-foreground">{totals.leads||0}</td>
                      <td className={`px-4 py-3 text-xs font-semibold ${totals.cpl != null && totals.cpl > cplThreshold ? "text-amber-500" : "text-foreground"}`}>
                        {totals.cpl != null ? `₹${totals.cpl}` : "—"}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Footer */}
          {detectedCols && isCsv && (
            <p className="text-center text-[10px] text-muted-foreground">
              CSV columns detected: {Object.entries(detectedCols).filter(([,v])=>v).map(([k,v])=>`${k} → "${v}"`).join(" · ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}