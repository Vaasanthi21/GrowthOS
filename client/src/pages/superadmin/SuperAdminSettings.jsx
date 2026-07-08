import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { changeSuperAdminPassword, fetchSuperAdminSettings, updateSuperAdminSettings } from '@/services/superAdminService';
import { Save, ShieldCheck, Bell, Globe } from "lucide-react";

export default function SuperAdminSettings() {
  const queryClient = useQueryClient();
  const [general, setGeneral] = useState({
    platform_name: "Creative Studio OS",
    support_email: "support@creativestudio.com",
    max_trial_days: "14",
  });

  const [password, setPassword] = useState({
    current: "",
    new_password: "",
    confirm: "",
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['super-admin-settings'],
    queryFn: fetchSuperAdminSettings,
  });

  useEffect(() => {
    if (!settings) {
      return;
    }

    setGeneral({
      platform_name: settings.platform_name || 'Creative Studio OS',
      support_email: settings.support_email || 'support@creativestudio.com',
      max_trial_days: String(settings.max_trial_days ?? 14),
    });
  }, [settings]);

  const settingsMutation = useMutation({
    mutationFn: updateSuperAdminSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-settings'] });
      toast({ title: 'Settings updated', duration: 1800 });
    },
    onError: (error) => {
      toast({
        title: 'Unable to update settings',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: changeSuperAdminPassword,
    onSuccess: () => {
      setPassword({ current: '', new_password: '', confirm: '' });
      toast({ title: 'Password updated', duration: 1800 });
    },
    onError: (error) => {
      toast({
        title: 'Unable to update password',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSaveGeneral = (e) => {
    e.preventDefault();
    settingsMutation.mutate({
      platform_name: general.platform_name.trim(),
      support_email: general.support_email.trim().toLowerCase(),
      max_trial_days: Number(general.max_trial_days || 0),
    });
  };

  const handleChangePassword = (e) => {
    e.preventDefault();

    if (password.new_password !== password.confirm) {
      toast({
        title: 'Passwords do not match',
        description: 'Confirm the new password and try again.',
        variant: 'destructive',
      });
      return;
    }

    passwordMutation.mutate({
      current_password: password.current,
      new_password: password.new_password,
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm">Platform-wide configuration</p>
      </div>

      {/* General Settings */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Globe className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold text-foreground">General</h2>
        </div>
        <form onSubmit={handleSaveGeneral} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Platform Name</Label>
            <Input
              value={general.platform_name}
              onChange={(e) => setGeneral({ ...general, platform_name: e.target.value })}
              disabled={isLoading || settingsMutation.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Support Email</Label>
            <Input
              type="email"
              value={general.support_email}
              onChange={(e) => setGeneral({ ...general, support_email: e.target.value })}
              disabled={isLoading || settingsMutation.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default Trial Duration (days)</Label>
            <Input
              type="number"
              value={general.max_trial_days}
              onChange={(e) => setGeneral({ ...general, max_trial_days: e.target.value })}
              disabled={isLoading || settingsMutation.isPending}
            />
          </div>
          <Button type="submit" className="gap-2" disabled={isLoading || settingsMutation.isPending}>
            <Save className="w-4 h-4" /> Save Changes
          </Button>
        </form>
      </div>

      {/* Notification Settings */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Bell className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold text-foreground">Notifications</h2>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground">
          {["New company registration", "Trial expiry alerts", "Overdue billing alerts", "Suspicious login attempts"].map((item) => (
            <label key={item} className="flex items-center justify-between cursor-pointer">
              <span>{item}</span>
              <input type="checkbox" defaultChecked className="accent-orange-500 w-4 h-4" />
            </label>
          ))}
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold text-foreground">Change Password</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Current Password</Label>
            <Input
              type="password"
              value={password.current}
              onChange={(e) => setPassword({ ...password, current: e.target.value })}
              disabled={passwordMutation.isPending}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <Input
              type="password"
              value={password.new_password}
              onChange={(e) => setPassword({ ...password, new_password: e.target.value })}
              disabled={passwordMutation.isPending}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm New Password</Label>
            <Input
              type="password"
              value={password.confirm}
              onChange={(e) => setPassword({ ...password, confirm: e.target.value })}
              disabled={passwordMutation.isPending}
              required
            />
          </div>
          <Button type="submit" className="gap-2" disabled={passwordMutation.isPending}>
            <Save className="w-4 h-4" /> Update Password
          </Button>
        </form>
      </div>
    </div>
  );
}