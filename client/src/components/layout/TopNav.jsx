import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, LogOut, Wallet, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useQuery } from "@tanstack/react-query";
import { fetchCreditBalance } from "@/services/aiService";
import { apiClient, tokenStorage } from "@/api/apiClient";
import UserGuideModal from "./UserGuideModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function TopNav({ onToggleSidebar }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const { data: creditBalance } = useQuery({
    queryKey: ["user-credit-balance"],
    queryFn: fetchCreditBalance,
  });

  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  const isMobile = useMediaQuery("(max-width: 640px)");

  useEffect(() => {
    if (user?.email) {
      const hasSeen = localStorage.getItem(`hasSeenUserGuide_${user.email}`);
      if (!hasSeen) {
        setGuideOpen(true);
      }
    }
  }, [user?.email]);

  const handleGuideOpenChange = (open) => {
    setGuideOpen(open);
    if (!open && user?.email) {
      localStorage.setItem(`hasSeenUserGuide_${user.email}`, "true");
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const getPageTitle = () => {
    switch (location.pathname) {
      case "/":
        return "Content Studio";
      case "/brand-setup":
        return "Brand Setup";
      case "/blog-studio":
        return "Blog Studio";
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

        {/* User Guide */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setGuideOpen(true)}
          title="User Guide"
        >
          <HelpCircle className="w-4 h-4" />
        </Button>

        {/* Logout */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setLogoutConfirmOpen(true)}
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>

      <UserGuideModal open={guideOpen} onOpenChange={handleGuideOpenChange} />

      {/* Logout Confirmation Modal */}
      <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <DialogContent className="max-w-md p-6 bg-background border border-border sm:rounded-2xl shadow-xl space-y-4">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-base font-display font-bold">Confirm Sign Out</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to sign out of your account? Any unsaved edits in active generation studios may be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLogoutConfirmOpen(false)}
              className="text-xs font-semibold px-4 py-2 border border-border hover:bg-secondary text-foreground hover:text-foreground rounded-xl transition-all"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setLogoutConfirmOpen(false);
                handleLogout();
              }}
              className="text-xs font-semibold px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl transition-all"
            >
              Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}