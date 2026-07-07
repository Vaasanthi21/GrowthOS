import React, { useEffect, useState } from "react";
import { Inbox, RefreshCcw } from "lucide-react";
import { apiClient, tokenStorage } from "@/api/apiClient";
import { Button } from "@/components/ui/button";

const typeLabels = {
  credit_request: "Credit Request",
  persona_request: "Persona Request",
  bug_report: "Bug Report",
  feature_request: "Feature Request",
  general_support: "General Support",
};

export default function SuperAdminRequests() {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRequests = async () => {
    setIsLoading(true);
    setError("");

    try {
      const token = tokenStorage.getSuperAdminToken?.() || tokenStorage.getUserToken?.();
      const response = await apiClient.get("/superadmin/support-requests", token);
      setRequests(Array.isArray(response?.items) ? response.items : []);
    } catch (err) {
      setError(err?.message || "Unable to load support requests");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Support Requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Review credit, persona, bug, feature, and general support requests.
          </p>
        </div>

        <Button variant="outline" onClick={loadRequests} disabled={isLoading}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            Open Request Inbox
          </p>
          <p className="text-xs text-muted-foreground">
            Showing latest submitted requests.
          </p>
        </div>

        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">
            Loading requests...
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-destructive">{error}</div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <div className="rounded-full bg-muted p-3">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                No requests yet
              </p>
              <p className="text-xs text-muted-foreground">
                User requests will appear here after submission.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {requests.map((request) => (
              <div key={request.id} className="grid gap-3 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {typeLabels[request.type] || request.type || "Request"}
                      </span>
                      <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {request.status || "open"}
                      </span>
                    </div>

                    <h2 className="text-base font-semibold text-foreground">
                      {request.subject || "Untitled request"}
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {request.message || "No message provided."}
                    </p>
                  </div>

                  <div className="text-left text-xs text-muted-foreground sm:text-right">
                    <p>{request.createdAt ? new Date(request.createdAt).toLocaleString() : "Unknown date"}</p>
                    <p>{request.userEmail || "No email"}</p>
                    {request.company && <p>{request.company}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}