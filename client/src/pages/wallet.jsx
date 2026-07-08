import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, Zap, CheckCircle2, Sparkles } from "lucide-react";
import { apiClient, tokenStorage } from "@/api/apiClient";
import { toast } from "@/components/ui/use-toast";
const PRICING_TIERS = [
  {
    id: "starter",
    label: "Starter",
    price: 1000,
    credits: 100,
    pricePerCredit: 10,
    badge: null,
    description: "Perfect for trying out the platform.",
    features: ["100 credits", "Valid forever", "All content types"],
  },
  {
    id: "growth",
    label: "Growth",
    price: 4500,
    credits: 500,
    pricePerCredit: 9,
    badge: "Most Popular",
    description: "Best for regular content creators.",
    features: ["500 credits", "Valid forever", "All content types", "10% savings vs Starter"],
  },
  {
    id: "pro",
    label: "Pro",
    price: 8000,
    credits: 1000,
    pricePerCredit: 8,
    badge: "Best Value",
    description: "For teams running campaigns at scale.",
    features: ["1000 credits", "Valid forever", "All content types", "20% savings vs Starter"],
  },
];

const CREDIT_COSTS = [
  { type: "Text Only", credits: 1 },
  { type: "Image", credits: 3 },
  { type: "Text + Image", credits: 4 },
  { type: "Video", credits: 10 },
  { type: "Text + Video", credits: 11 },
];

const BLOG_CREDIT_COSTS = [
  { type: "AI Brand Setup", credits: 10 },
  { type: "Canonical Blog + SEO Research", credits: 10 },
  { type: "Platform Rendering", credits: 5 },
  { type: "Cover Image", credits: 3 },
  { type: "Auto Optimize SEO", credits: 5 },
];

export default function WalletPage() {
  const [loadingTierId, setLoadingTierId] = useState(null);
  const token = tokenStorage.getUserToken();

  const { data: walletData, isLoading: walletLoading } = useQuery({
    queryKey: ["wallet"],
    queryFn: async () => {
      const response = await apiClient.get("/wallet", token);
      return response;
    },
    enabled: !!token,
  });

  const creditBalance = walletData?.credits ?? walletData?.balance ?? 0;

  const handleBuy = async (tier) => {
  if (loadingTierId) return;
  setLoadingTierId(tier.id);
  try {
    const response = await apiClient.post("/wallet/recharge", {
      tier_id: tier.id,
      amount: tier.price,
      credits: tier.credits,
    }, token);
    if (response?.checkout_url || response?.url) {
      window.location.href = response.checkout_url || response.url;
    } else {
      toast({
        title: "Request submitted successfully",
        description: "Payment gateway integration is coming soon.",
      });
    }
  } catch (error) {
    console.error("Recharge failed:", error);
  } finally {
    setLoadingTierId(null);
  }
};
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      {/* Header */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          <span className="inline-block h-px w-3 bg-muted-foreground" />
          Credits
        </p>
        <h1 className="text-2xl font-semibold text-foreground">Wallet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Purchase credits to generate content across all platforms and formats.
        </p>
      </div>

      {/* Balance Card */}
      <div className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.85)]">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Wallet className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Current Balance
              </p>
              {walletLoading ? (
                <div className="mt-1 h-8 w-24 animate-pulse rounded-lg bg-muted" />
              ) : (
                <p className="mt-0.5 text-3xl font-bold text-foreground">
                  {creditBalance.toLocaleString()}
                  <span className="ml-2 text-base font-medium text-muted-foreground">
                    credits
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Credit Costs
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3">
              <div className="space-y-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary/70">
                  Content Studio
                </p>
                <div className="space-y-1">
                  {CREDIT_COSTS.map((item) => (
                    <div key={item.type} className="flex items-center justify-between gap-4 text-xs">
                      <span className="text-muted-foreground">{item.type}</span>
                      <span className="font-medium text-foreground">
                        {item.credits} {item.credits === 1 ? "credit" : "credits"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 border-l border-border/60 pl-6">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary/70">
                  Blog Studio
                </p>
                <div className="space-y-1">
                  {BLOG_CREDIT_COSTS.map((item) => (
                    <div key={item.type} className="flex items-center justify-between gap-4 text-xs">
                      <span className="text-muted-foreground">{item.type}</span>
                      <span className="font-medium text-foreground">
                        {item.credits} {item.credits === 1 ? "credit" : "credits"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Tiers */}
      <div>
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Recharge Options
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {PRICING_TIERS.map((tier) => {
            const isPopular = tier.badge === "Most Popular";
            const isBestValue = tier.badge === "Best Value";
            const isHighlighted = isPopular || isBestValue;
            const isLoading = loadingTierId === tier.id;

            return (
              <div
                key={tier.id}
                className={`relative flex flex-col rounded-3xl border p-6 transition-all duration-200 ${
                  isHighlighted
                    ? "border-primary/40 bg-primary/[0.04] shadow-[0_16px_48px_-24px_rgba(249,115,22,0.3)]"
                    : "border-border/70 bg-card/95"
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-foreground">
                      {tier.badge}
                    </span>
                  </div>
                )}

                <div className="mb-4 flex items-center gap-2">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      isHighlighted ? "bg-primary/10" : "bg-muted/50"
                    }`}
                  >
                    {isHighlighted ? (
                      <Sparkles className="h-4 w-4 text-primary" />
                    ) : (
                      <Zap className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground">{tier.label}</p>
                </div>

                <div className="mb-1">
                  <span className="text-3xl font-bold text-foreground">
                    ₹{tier.price.toLocaleString()}
                  </span>
                </div>
                <p className="mb-1 text-sm font-semibold text-primary">
                  {tier.credits.toLocaleString()} Credits
                </p>
                <p className="mb-5 text-xs text-muted-foreground">
                  ₹{tier.pricePerCredit} per credit · {tier.description}
                </p>

                <ul className="mb-6 space-y-2">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-xs text-foreground/80">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleBuy(tier)}
                  disabled={!!loadingTierId}
                  className={`mt-auto h-11 w-full rounded-2xl text-sm font-semibold transition-all duration-200 ${
                    isHighlighted
                      ? "bg-primary text-primary-foreground hover:shadow-[0_10px_24px_-12px_rgba(249,115,22,0.45)]"
                      : "bg-muted text-foreground hover:bg-muted/70"
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Redirecting…
                    </>
                  ) : (
                    `Buy ${tier.credits} Credits`
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-muted-foreground">
        All purchases are one-time. Credits never expire. Payments are processed securely.
      </p>
    </div>
  );
}