import React from "react";
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, CreditCard, TrendingUp, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchSuperAdminMetrics } from '@/services/superAdminService';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const statusStyles = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  critical: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  suspended: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function SuperAdminDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['super-admin-metrics'],
    queryFn: fetchSuperAdminMetrics,
  });

  const stats = data
    ? [
        {
          label: 'Tracked Personas',
          value: data.totals.trackedPersonas.toLocaleString(),
          icon: Building2,
          change: 'Derived from content history records',
        },
        {
          label: 'Unique Users',
          value: data.totals.uniqueUsers.toLocaleString(),
          icon: Users,
          change: data.hasProfilesTable
            ? 'Registered users from profiles'
            : 'Users with saved generation history',
        },
        {
          label: 'Success Rate',
          value: `${data.totals.successRate}%`,
          icon: CreditCard,
          change: 'Completed history entries',
        },
        {
          label: 'Generations This Month',
          value: data.totals.generationsThisMonth.toLocaleString(),
          icon: TrendingUp,
          change: `${data.totals.totalGenerations.toLocaleString()} total generations`,
        },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-6xl px-4 sm:px-6 py-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Overview</h1>
        <p className="text-muted-foreground text-sm">Live platform metrics from MongoDB-backed content history</p>
      </div>

      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Unable to load dashboard data</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Grid wrapper scaling layout smoothly across mobile viewports */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(isLoading ? Array.from({ length: 4 }) : stats).map((item, index) => {
          if (isLoading) {
            return <div key={index} className="bg-card border border-border rounded-xl p-5 h-32 animate-pulse" />;
          }

          const { label, value, icon: Icon, change } = item;
          return (
            <div key={label} className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground font-medium">{label}</p>
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
              </div>
              <p className="font-display text-2xl font-bold text-foreground tracking-tight">{value}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{change}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="w-4 h-4 text-primary shrink-0" />
            <h2 className="font-display font-semibold text-foreground truncate">Most Active Personas</h2>
          </div>
          <Link to="/superadmin/usage" className="text-xs text-primary hover:underline shrink-0 font-medium">View usage</Link>
        </div>
        
        <div className="divide-y divide-border">
          {isLoading && Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="px-5 py-4 h-16 animate-pulse" />
          ))}
          
          {!isLoading && data?.recentActivity.map((entry) => (
            <div 
              key={entry.id} 
              className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 gap-4 transition-colors hover:bg-muted/10"
            >
              {/* Left Column Profile Stacking block */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-foreground shrink-0 border border-border">
                  {entry.company[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{entry.company}</p>
                  <p className="text-xs text-muted-foreground">{entry.apiCalls} generations</p>
                </div>
              </div>
              
              {/* Right Column Metadata Badge Block — Wraps down gracefully on mobile device screens */}
              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t border-border/40 sm:border-t-0">
                <span className="text-xs text-muted-foreground font-medium">{entry.lastUsed}</span>
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold capitalize tracking-wide shrink-0 ${statusStyles[entry.status]}`}>
                  {entry.status}
                </span>
              </div>
            </div>
          ))}
          
          {!isLoading && !data?.recentActivity.length && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No content history records found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}