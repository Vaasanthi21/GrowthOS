import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useQuery } from "@tanstack/react-query";
import { fetchCreditBalance } from "@/services/aiService";
import { apiClient, tokenStorage } from "@/api/apiClient";

export default function TopNav({ onToggleSidebar }) {
  const { data: creditBalance } = useQuery({
    queryKey: ["user-credit-balance"],
    queryFn: fetchCreditBalance,
  });

  const token = tokenStorage.getUserToken();

  const { data: companyPersonas = [] } = useQuery({
    queryKey: ["company-personas"],
    queryFn: async () => {
      const response = await apiClient.get("/company-personas", token);
      return Array.isArray(response) ? response : response?.items || [];
    },
    enabled: !!token,
  });

  const selectedCompanyPersonaId = localStorage.getItem(
    "selectedCompanyPersonaId",
  );

  const selectedCompanyPersona =
    companyPersonas.find(
      (persona) => persona.id === selectedCompanyPersonaId,
    ) ||
    companyPersonas[0] ||
    null;

  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const isMobile = useMediaQuery("(max-width: 640px)");

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const getPageTitle = () => {
    switch (location.pathname) {
      case "/":
        return "Content Generation";
      case "/history":
        return "Content History";
      case "/refine":
        return "Refine Content";
      case "/settings":
        return "Settings";
      case "/personas":
        return "Choose Persona";
      default:
        return "Creative Studio OS";
    }
  };

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 gap-3 shadow-sm">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-8 w-8"
          onClick={onToggleSidebar}
        >
          <Menu className="w-4 h-4" />
        </Button>

        {/* Brand dot + title */}
        <div className="flex items-center">
          <h1 className="text-base sm:text-lg font-display font-bold leading-tight text-primary">
            {getPageTitle()}
          </h1>

          {!isMobile && selectedCompanyPersona && (
            <div className="ml-2 flex items-center gap-2">
              <span className="rounded-full border border-orange-500/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                {selectedCompanyPersona.name}
              </span>

              <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-500">
                {selectedCompanyPersona.company}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-orange-500/60 bg-orange-500/5 px-4 py-2">
          <Wallet className="h-4 w-4 text-orange-500" />

          <span className="text-sm font-medium text-orange-500">
            {isMobile
              ? Number(creditBalance?.balance || 0).toLocaleString()
              : `Credits: ${Number(creditBalance?.balance || 0).toLocaleString()}`}
          </span>
        </div>

        {/* Logout */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
