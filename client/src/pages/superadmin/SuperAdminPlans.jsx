import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Pencil, Trash2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import {
  fetchSuperAdminPlans,
  createSuperAdminPlan,
  updateSuperAdminPlan,
  deleteSuperAdminPlan
} from '@/services/superAdminService';

export default function SuperAdminPlans() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['super-admin-plans'],
    queryFn: fetchSuperAdminPlans,
  });

  const [isOpen, setIsOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null); // null means creating

  const [name, setName] = useState("");
  const [priceMonthly, setPriceMonthly] = useState("0");
  const [creditsLimit, setCreditsLimit] = useState("0");
  const [personaLimit, setPersonaLimit] = useState("1");
  const [status, setStatus] = useState("active");

  const resetForm = () => {
    setName("");
    setPriceMonthly("0");
    setCreditsLimit("0");
    setPersonaLimit("1");
    setStatus("active");
    setEditingPlan(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsOpen(true);
  };

  const handleOpenEdit = (plan) => {
    setEditingPlan(plan);
    setName(plan.name);
    setPriceMonthly(String(plan.price_monthly ?? 0));
    setCreditsLimit(String(plan.credits_limit ?? 0));
    setPersonaLimit(String(plan.persona_limit ?? 1));
    setStatus(plan.status || "active");
    setIsOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: createSuperAdminPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-plans'] });
      toast({ title: "Plan created successfully", duration: 3000 });
      setIsOpen(false);
      resetForm();
    },
    onError: (err) => {
      toast({ title: "Error creating plan", description: err.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateSuperAdminPlan(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-plans'] });
      toast({ title: "Plan updated successfully", duration: 3000 });
      setIsOpen(false);
      resetForm();
    },
    onError: (err) => {
      toast({ title: "Error updating plan", description: err.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSuperAdminPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-plans'] });
      toast({ title: "Plan deleted successfully", duration: 3000 });
    },
    onError: (err) => {
      toast({ title: "Error deleting plan", description: err.message, variant: "destructive" });
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Plan name is required", variant: "destructive" });
      return;
    }

    const payload = {
      name: name.trim(),
      price_monthly: Number(priceMonthly),
      credits_limit: Number(creditsLimit),
      persona_limit: Number(personaLimit),
      status,
    };

    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id || editingPlan._id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (planId) => {
    if (window.confirm("Are you sure you want to delete this subscription plan?")) {
      deleteMutation.mutate(planId);
    }
  };

  const hasPlans = (data ?? []).length > 0;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Subscription Plans</h1>
          <p className="text-muted-foreground text-sm">Configure and manage subscription tiers, pricing, and limits.</p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2 self-start sm:self-auto">
          <Plus className="w-4 h-4" /> Create Plan
        </Button>
      </div>

      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Unable to load plans</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-48 animate-pulse" />
          ))}
        </div>
      ) : hasPlans ? (
        <div className="grid gap-4 md:grid-cols-3">
          {(data ?? []).map((plan) => (
            <Card key={plan.id || plan._id}>
              <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    {plan.name}
                  </CardTitle>
                  <CardDescription className="capitalize">Status: {plan.status || 'active'}</CardDescription>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-muted-foreground hover:text-foreground"
                    onClick={() => handleOpenEdit(plan)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(plan.id || plan._id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly price</span>
                  <span className="font-semibold text-foreground">${plan.price_monthly ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Credits limit</span>
                  <span className="font-semibold text-foreground">{plan.credits_limit ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Persona cap</span>
                  <span className="font-semibold text-foreground">{plan.persona_limit ?? 1}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardHeader className="text-center py-10">
            <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <CardTitle>No Plans Configured</CardTitle>
            <CardDescription>
              Create a subscription tier to get started managing customer plans.
            </CardDescription>
            <div className="mt-4">
              <Button onClick={handleOpenCreate} className="gap-2">
                <Plus className="w-4 h-4" /> Create First Plan
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingPlan ? "Edit Subscription Plan" : "Create Subscription Plan"}</DialogTitle>
              <DialogDescription>
                Configure pricing, credit allocation, and persona limits for this tier.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Plan Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Pro, Growth, Enterprise"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="price">Monthly Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    value={priceMonthly}
                    onChange={(e) => setPriceMonthly(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="credits">Credits Limit</Label>
                  <Input
                    id="credits"
                    type="number"
                    min="0"
                    value={creditsLimit}
                    onChange={(e) => setCreditsLimit(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="personas">Persona Limit</Label>
                  <Input
                    id="personas"
                    type="number"
                    min="1"
                    value={personaLimit}
                    onChange={(e) => setPersonaLimit(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingPlan ? "Save Changes" : "Create Plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
