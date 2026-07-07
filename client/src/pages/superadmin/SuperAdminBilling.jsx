import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, History, Settings2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from "@/components/ui/use-toast";
import { fetchCreditSettings, fetchCreditTransactions, updateCreditSettings } from '@/services/superAdminService';

export default function SuperAdminBilling() {
  const queryClient = useQueryClient();
  const [defaultCredits, setDefaultCredits] = useState('');
  const [textCost, setTextCost] = useState('');
  const [imageCost, setImageCost] = useState('');
  const [videoCost, setVideoCost] = useState('');
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['super-admin-credit-settings'],
    queryFn: fetchCreditSettings,
  });
  const { data: transactionsData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['super-admin-credit-transactions'],
    queryFn: () => fetchCreditTransactions(),
  });

  const settingsMutation = useMutation({
    mutationFn: updateCreditSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-credit-settings'] });
      toast({ title: 'Credit settings updated', duration: 1800 });
    },
    onError: (error) => {
      toast({
        title: 'Unable to update settings',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const transactions = transactionsData?.transactions ?? [];
  const summary = useMemo(() => {
    return transactions.reduce(
      (accumulator, entry) => {
        if (entry.type === 'purchase_request') {
          accumulator.purchaseRequests += 1;
        }
        if (entry.amount > 0) {
          accumulator.creditsAdded += entry.amount;
        }
        if (entry.amount < 0) {
          accumulator.creditsRemoved += Math.abs(entry.amount);
        }
        return accumulator;
      },
      { purchaseRequests: 0, creditsAdded: 0, creditsRemoved: 0 }
    );
  }, [transactions]);

  const effectiveDefaultCredits = defaultCredits || String(settings?.default_signup_credits ?? '');
  const effectiveTextCost = textCost || String(settings?.text_generation_cost ?? 0);
  const effectiveImageCost = imageCost || String(settings?.image_generation_cost ?? 0);
  const effectiveVideoCost = videoCost || String(settings?.video_generation_cost ?? 0);

  const handleSave = (event) => {
    event.preventDefault();
    settingsMutation.mutate({
      default_signup_credits: Number(effectiveDefaultCredits || 0),
      text_generation_cost: Number(effectiveTextCost || 0),
      image_generation_cost: Number(effectiveImageCost || 0),
      video_generation_cost: Number(effectiveVideoCost || 0),
    });
  };

  return (
    <div className="space-y-6 w-full max-w-6xl mx-auto px-4 sm:px-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Credits</h1>
        <p className="text-muted-foreground text-sm">Configure signup and generation credit costs, then review the credit ledger</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Default Signup Credits', value: settingsLoading ? '...' : String(settings?.default_signup_credits ?? 0), icon: Settings2 },
          { label: 'Credits Added', value: summary.creditsAdded.toLocaleString(), icon: Wallet },
          { label: 'Credits Removed', value: summary.creditsRemoved.toLocaleString(), icon: CreditCard },
          { label: 'Purchase Requests', value: summary.purchaseRequests.toLocaleString(), icon: History },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">{label}</p>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
            </div>
            <p className="font-display text-2xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credit settings</CardTitle>
          <CardDescription>
            Set signup credits and per-generation charges for text, image, and video.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Credits per new user</Label>
              <Input
                type="number"
                min="0"
                value={effectiveDefaultCredits}
                onChange={(event) => setDefaultCredits(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Text generation cost</Label>
              <Input
                type="number"
                min="0"
                value={effectiveTextCost}
                onChange={(event) => setTextCost(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Image generation cost</Label>
              <Input
                type="number"
                min="0"
                value={effectiveImageCost}
                onChange={(event) => setImageCost(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Video generation cost</Label>
              <Input
                type="number"
                min="0"
                value={effectiveVideoCost}
                onChange={(event) => setVideoCost(event.target.value)}
              />
            </div>

            <Button type="submit" disabled={settingsMutation.isPending} className="md:w-fit xl:col-span-4">
              Save credit settings
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent credit activity</CardTitle>
          <CardDescription>
            Manual allocations, signup bonuses, deductions, and buy-credit requests are recorded here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-3 pr-4 font-medium">Type</th>
                  <th className="py-3 pr-4 font-medium">Amount</th>
                  <th className="py-3 pr-4 font-medium">Balance After</th>
                  <th className="py-3 pr-4 font-medium">User</th>
                  <th className="py-3 pr-4 font-medium">Note</th>
                  <th className="py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {transactionsLoading ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">Loading transactions...</td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">No credit activity recorded yet.</td>
                  </tr>
                ) : (
                  transactions.slice(0, 20).map((entry) => (
                    <tr key={entry.id} className="border-b border-border/60">
                      <td className="py-3 pr-4">{entry.type}</td>
                      <td className={`py-3 pr-4 font-medium ${entry.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {entry.amount >= 0 ? '+' : ''}{entry.amount}
                      </td>
                      <td className="py-3 pr-4">{entry.balance_after}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{entry.user_id}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{entry.note || '—'}</td>
                      <td className="py-3 text-muted-foreground">{entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}