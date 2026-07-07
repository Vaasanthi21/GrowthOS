import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldCheck, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from "@/components/ui/use-toast";
import { allocateCredits, fetchCreditUsers, updateUserPersonaLimit } from '@/services/superAdminService';

const statusStyles = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  trial: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  suspended: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function SuperAdminUsers() {
  const [search, setSearch] = useState("");
  const [creditForm, setCreditForm] = useState({});
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['super-admin-credit-users'],
    queryFn: fetchCreditUsers,
  });

  const allocationMutation = useMutation({
    mutationFn: allocateCredits,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-credit-users'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-credit-transactions'] });
      toast({ title: 'Credits updated', duration: 1800 });
    },
    onError: (mutationError) => {
      toast({
        title: 'Unable to update credits',
        description: mutationError.message,
        variant: 'destructive',
      });
    },
  });

  const personaLimitMutation = useMutation({
    mutationFn: ({ userId, persona_limit }) => updateUserPersonaLimit(userId, { persona_limit }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-credit-users'] });
      toast({ title: 'Persona limit updated', duration: 1800 });
    },
    onError: (mutationError) => {
      toast({
        title: 'Unable to update persona limit',
        description: mutationError.message,
        variant: 'destructive',
      });
    },
  });

  const users = data?.users ?? [];
  const filtered = users.filter(
    (u) =>
      (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.company || '').toLowerCase().includes(search.toLowerCase())
  );

  const totals = useMemo(() => {
    return users.reduce(
      (accumulator, user) => {
        accumulator.balance += Number(user.credits_balance || 0);
        accumulator.allocated += Number(user.credits_total_allocated || 0);
        accumulator.used += Number(user.credits_total_used || 0);
        return accumulator;
      },
      { balance: 0, allocated: 0, used: 0 }
    );
  }, [users]);

  const handleCreditFieldChange = (userId, field, value) => {
    setCreditForm((current) => ({
      ...current,
      [userId]: {
        amount: current[userId]?.amount ?? '',
        note: current[userId]?.note ?? '',
        [field]: value,
      },
    }));
  };

  const handleAllocate = (userId) => {
    const form = creditForm[userId] || {};
    allocationMutation.mutate({
      userId,
      amount: Number(form.amount || 0),
      note: form.note || '',
      type: 'manual_adjustment',
    });
  };

  const handlePersonaLimitSave = (userId) => {
    const form = creditForm[userId] || {};
    personaLimitMutation.mutate({
      userId,
      persona_limit: Number(form.personaLimit || 0),
    });
  };

  return (
    <div className="space-y-6 w-full max-w-6xl mx-auto px-4 sm:px-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Users</h1>
        <p className="text-muted-foreground text-sm">Manage user balances and manual credit allocations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current balance</CardTitle>
            <CardDescription>{totals.balance.toLocaleString()} credits across all users</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allocated</CardTitle>
            <CardDescription>{totals.allocated.toLocaleString()} total credits granted</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Used or deducted</CardTitle>
            <CardDescription>{totals.used.toLocaleString()} credits consumed or removed</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Unable to load users</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Search */}
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
            Loading users...
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
            No users found
          </div>
        ) : (
          filtered.map((u) => (
            <div key={u.id} className="bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-foreground flex-shrink-0">
                    {(u.full_name || 'U')[0]}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold text-foreground truncate">{u.full_name || 'Unknown'}</p>
                    <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate max-w-full">{u.company || 'No company'}</span>
                      <span className="text-border">•</span>
                      <span className={`inline-flex items-center gap-1 ${u.role === 'admin' ? 'text-primary' : ''}`}>
                        {u.role === 'admin' && <ShieldCheck className="w-3 h-3" />}
                        {u.role}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 lg:flex-col lg:items-end lg:text-right">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${statusStyles[u.status] || ''}`}>
                    {u.status}
                  </span>
                  <div className="text-xs text-muted-foreground">
                    <p>Joined</p>
                    <p className="text-foreground font-medium">{u.joined || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-secondary/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Credits balance</p>
                  <div className="mt-2 flex items-center gap-2 text-foreground">
                    <Wallet className="w-4 h-4 text-primary" />
                    <p className="text-lg font-semibold">{Number(u.credits_balance || 0).toLocaleString()}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Allocated {Number(u.credits_total_allocated || 0).toLocaleString()}</p>
                </div>

                <div className="rounded-xl border border-border bg-secondary/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Persona limit</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{Number(u.persona_limit || 0).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Per-user creation cap</p>
                </div>

                <div className="rounded-xl border border-border bg-secondary/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Usage</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{Number(u.credits_total_used || 0).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Credits consumed or removed</p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-xl border border-border p-4 space-y-3">
                  <div>
                    <Label>Adjust persona limit</Label>
                    <p className="text-xs text-muted-foreground mt-1">Set how many company personas this user can create.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[120px_auto]">
                    <Input
                      type="number"
                      min="1"
                      placeholder="Limit"
                      value={creditForm[u.id]?.personaLimit ?? u.persona_limit ?? ''}
                      onChange={(e) => handleCreditFieldChange(u.id, 'personaLimit', e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handlePersonaLimitSave(u.id)}
                      disabled={personaLimitMutation.isPending}
                    >
                      Save limit
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border p-4 space-y-3">
                  <div>
                    <Label>Allocate credits</Label>
                    <p className="text-xs text-muted-foreground mt-1">Add or deduct credits manually with an optional note.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)_auto]">
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={creditForm[u.id]?.amount ?? ''}
                      onChange={(e) => handleCreditFieldChange(u.id, 'amount', e.target.value)}
                    />
                    <Input
                      placeholder="Reason"
                      value={creditForm[u.id]?.note ?? ''}
                      onChange={(e) => handleCreditFieldChange(u.id, 'note', e.target.value)}
                    />
                    <Button
                      type="button"
                      onClick={() => handleAllocate(u.id)}
                      disabled={allocationMutation.isPending}
                    >
                      Save credits
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}