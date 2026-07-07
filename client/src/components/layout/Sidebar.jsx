import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Clock,
  Settings,
  Sparkles,
  LogOut,
  Building2,
  PanelLeftClose,
  PanelLeftOpen,
  Linkedin,
  Instagram,
  Facebook,
  Youtube,
  Github,
  Twitter,
  MessageCircle,
  LifeBuoy
} from "lucide-react";
import { getPersonaById } from "@/lib/personas";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/AuthContext";

const navItems = [
  { icon: Sparkles, label: "Generate", path: "/" },
  { icon: Building2, label: "Company Personas", path: "/personas" },
  { icon: Clock, label: "History", path: "/history" },
  { icon: Settings, label: "Settings", path: "/settings" },
  { icon: LifeBuoy, label: "Support Center", path: "/support" },
];

export default function Sidebar({
  activePersona,
  onPersonaChange,
  collapsed,
  onToggleCollapse,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const persona = getPersonaById(activePersona);

  const platformIcons = {
    linkedin: Linkedin,
    instagram: Instagram,
    facebook: Facebook,
    youtube: Youtube,
    github: Github,
    twitter: Twitter,
    "x/twitter": Twitter,
    x: Twitter,
    threads: MessageCircle,
  };

  const PlatformIcon =
    platformIcons[activePersona?.toLowerCase()] || Linkedin;

  const sidebarIconColor =
    ["github", "twitter", "x/twitter", "threads"].includes(activePersona?.toLowerCase())
      ? "#9CA3AF"
      : persona.color;

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside
      className={`flex flex-col bg-card border-r border-border h-full transition-all duration-200 ${
        collapsed ? "w-16" : "w-52"
      }`}
    >
      {/* Persona badge */}
      <div
        className={`h-16 border-b border-border flex items-center ${
          collapsed
            ? "justify-between px-2 py-3"
            : "gap-2.5 px-3 py-3"
        }`}
      >
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-display font-bold shrink-0"
          style={{
            background: `${persona.color}1f`,
            border: `1px solid ${persona.color}`,
            color: sidebarIconColor,
          }}
        >
          <PlatformIcon className="w-4 h-4 text-current" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-xs font-display font-semibold text-foreground truncate">
              {persona.label}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Active Platform
            </p>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors mr-2"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}

        {collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex shrink-0 items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground px-2 pb-1">
          {!collapsed && "Menu"}
        </span>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <TooltipProvider key={item.path} delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-secondary-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent
                    side="right"
                    className="border border-primary/40 bg-card text-primary"
                  >
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </nav>

      {/* Sign Out */}
      <div className="px-2 py-3 border-t border-border">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                {!collapsed && <span>Sign Out</span>}
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent
                side="right"
                className="border border-primary/40 bg-card text-primary"
              >
                Sign Out
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </aside>
  );
}
