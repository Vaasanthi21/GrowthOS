import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users,
  Inbox,
  Loader2,
  PlusCircle,
  MinusCircle,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  ShieldCheck,
  Wallet,
  Ticket,
} from "lucide-react";
import { apiClient, tokenStorage } from "@/api/apiClient";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initialsOf(email) {
  if (!email) return "?";
  const name = email.split("@")[0];
  const parts = name.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Credits Modal ────────────────────────────────────────────────────────────

function CreditsModal({ user, onClose }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("add"); // "add" | "remove"
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const token = tokenStorage.getUserToken();

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = parseInt(amount, 10);
      if (!parsed || parsed <= 0) throw new Error("Enter a valid amount.");
      return apiClient.put(`/admin/users/${user.id}/credits`, {
        action: mode,
        amount: parsed,
      }, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["admin-users"]);
      onClose();
    },
    onError: (err) => {
      setError(err.message || "Something went wrong.");
    },
  });

  const handleSubmit = () => {
    setError("");
    if (!amount || isNaN(parseInt(amount, 10)) || parseInt(amount, 10) <= 0) {
      setError("Please enter a valid positive number.");
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card p-6 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.85)]">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
              {initialsOf(user.email)}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Adjust Credits
              </p>
              <h2 className="mt-0.5 text-base font-semibold text-foreground">
                {user.email}
              </h2>
              <p className="text-xs text-muted-foreground">
                Current balance:{" "}
                <span className="font-medium text-foreground">
                  {(user.credits ?? user.credit_balance ?? 0).toLocaleString()} credits
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Add / Remove toggle */}
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => setMode("add")}
            className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all ${
              mode === "add"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <PlusCircle className="h-4 w-4 text-primary" />
            Add Credits
          </button>
          <button
            type="button"
            onClick={() => setMode("remove")}
            className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all ${
              mode === "remove"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MinusCircle className="h-4 w-4 text-destructive" />
            Remove Credits
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Amount
            </Label>
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 100"
              className="h-11 rounded-2xl border-border/70 bg-muted/30 text-sm placeholder:text-muted-foreground"
            />
          </div>

          {error && (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-2xl bg-muted text-sm font-semibold text-foreground hover:bg-muted/70"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className={`h-11 flex-1 rounded-2xl text-sm font-semibold text-white transition-all duration-200 ${
                mode === "remove"
                  ? "bg-destructive hover:bg-destructive/90"
                  : "bg-primary hover:shadow-[0_10px_24px_-12px_rgba(249,115,22,0.45)]"
              }`}
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "add" ? (
                "Add Credits"
              ) : (
                "Remove Credits"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card/95 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.85)]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-2xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Users Table ──────────────────────────────────────────────────────────────

function UsersTab() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("email");
  const [sortDir, setSortDir] = useState("asc");
  const [selectedUser, setSelectedUser] = useState(null);
  const token = tokenStorage.getUserToken();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/users", token);
      return Array.isArray(response) ? response : response?.users || response?.items || [];
    },
    enabled: !!token,
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filtered = users
    .filter((u) =>
      (u.email || "").toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const aVal = sortField === "email" ? a.email : (a.credits ?? a.credit_balance ?? 0);
      const bVal = sortField === "email" ? b.email : (b.credits ?? b.credit_balance ?? 0);
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const totalCredits = users.reduce((sum, u) => sum + (u.credits ?? u.credit_balance ?? 0), 0);
  const adminCount = users.filter((u) => u.role === "admin" || u.role === "superadmin").length;

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  return (
    <>
      {selectedUser && (
        <CreditsModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}

      {/* Stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Total users" value={users.length.toLocaleString()} />
        <StatCard icon={Wallet} label="Total credits in circulation" value={totalCredits.toLocaleString()} />
        <StatCard icon={ShieldCheck} label="Admins" value={adminCount.toLocaleString()} />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email…"
            className="h-11 rounded-2xl border-border/70 bg-muted/30 pl-9 text-sm placeholder:text-muted-foreground"
          />
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {filtered.length} user{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/30">
              <th
                className="cursor-pointer px-5 py-3.5 text-left"
                onClick={() => handleSort("email")}
              >
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  User <SortIcon field="email" />
                </span>
              </th>
              <th
                className="cursor-pointer px-5 py-3.5 text-left"
                onClick={() => handleSort("credits")}
              >
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Credits <SortIcon field="credits" />
                </span>
              </th>
              <th className="px-5 py-3.5 text-left">
                <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Role
                </span>
              </th>
              <th className="px-5 py-3.5 text-right">
                <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Actions
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  No users found.
                </td>
              </tr>
            ) : (
              filtered.map((user, i) => (
                <tr
                  key={user.id}
                  className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${
                    i === filtered.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-semibold text-primary">
                        {initialsOf(user.email)}
                      </div>
                      <span className="font-medium text-foreground">{user.email}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-foreground">
                    {(user.credits ?? user.credit_balance ?? 0).toLocaleString()}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                        user.role === "admin" || user.role === "superadmin"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {user.role || "user"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button
                      onClick={() => setSelectedUser(user)}
                      className="h-8 rounded-xl bg-muted px-3 text-xs font-semibold text-foreground hover:bg-muted/70"
                    >
                      Adjust Credits
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Support Inbox ────────────────────────────────────────────────────────────

function InboxTab() {
  const [expanded, setExpanded] = useState(null);
  const token = tokenStorage.getUserToken();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/tickets", token);
      return Array.isArray(response) ? response : response?.tickets || response?.items || [];
    },
    enabled: !!token,
  });

  const statusColors = {
    open: "bg-primary/10 text-primary",
    closed: "bg-muted text-muted-foreground",
    pending: "bg-yellow-500/10 text-yellow-600",
  };

  const openCount = tickets.filter((t) => (t.status || "open") === "open").length;
  const pendingCount = tickets.filter((t) => t.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Inbox} label="Total tickets" value={tickets.length.toLocaleString()} />
        <StatCard icon={Ticket} label="Open" value={openCount.toLocaleString()} />
        <StatCard icon={Loader2} label="Pending" value={pendingCount.toLocaleString()} />
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-3xl border border-border/70 bg-muted/20 py-16 text-center text-sm text-muted-foreground">
            No support tickets yet.
          </div>
        ) : (
          tickets.map((ticket) => {
            const isOpen = expanded === ticket.id;
            const status = ticket.status || "open";
            return (
              <div
                key={ticket.id}
                className="overflow-hidden rounded-3xl border border-border/70 bg-card/95"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : ticket.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/20"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-semibold text-primary">
                      {initialsOf(ticket.email || ticket.user_email)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                            statusColors[status] || statusColors.open
                          }`}
                        >
                          {status}
                        </span>
                        <p className="truncate text-sm font-semibold text-foreground">
                          {ticket.subject || "No subject"}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ticket.email || ticket.user_email} ·{" "}
                        {ticket.created_at
                          ? new Date(ticket.created_at).toLocaleDateString()
                          : ""}
                      </p>
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-border/50 px-5 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Message
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                      {ticket.message || "No message content."}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      {/* Header */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          <span className="inline-block h-px w-3 bg-muted-foreground" />
          Admin
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Admin Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage users, credits, and support tickets.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.85)]">
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
              activeTab === "users"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-4 w-4" />
            User Management
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("inbox")}
            className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
              activeTab === "inbox"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Inbox className="h-4 w-4" />
            Support Inbox
          </button>
        </div>

        {activeTab === "users" ? <UsersTab /> : <InboxTab />}
      </div>
    </div>
  );
}