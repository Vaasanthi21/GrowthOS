"use client"

import { useEffect } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { useAuth } from "../lib/AuthContext"
import {
  Sparkles, Home, Layers, DollarSign, FileText, HelpCircle, Mail,
  X, ArrowRight, LogIn, UserPlus,
} from "lucide-react"

const menuItems = [
  { label: "Home", to: "/", icon: Home },
  { label: "Studios", to: "/#platform", icon: Layers },
  { label: "Pricing", to: "/pricing", icon: DollarSign },
  { label: "Blog", to: "/blog", icon: FileText },
  { label: "FAQ", to: "/faq", icon: HelpCircle },
  { label: "Contact", to: "/contact", icon: Mail },
]

export default function HamburgerMenu({ open, onClose }) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        className={`fixed inset-y-0 right-0 z-[80] flex w-full max-w-sm flex-col border-l border-white/10 bg-[#0a0705] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-6">
          <a href="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg shadow-orange-600/30">
              <Sparkles className="h-5 w-5 text-black" />
            </span>
            <span className="text-lg font-bold tracking-tight text-white">
              Creative<span className="text-orange-500">OS</span>
            </span>
          </a>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-2">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isHashLink = item.to.includes("#")
            const commonClasses = ({ isActiveOverride } = {}) =>
              `group flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm font-medium transition-all duration-200 ${
                isActiveOverride
                  ? "border-orange-500/50 bg-orange-500/[0.08] text-orange-400 shadow-[0_0_0_1px_rgba(249,115,22,0.3)]"
                  : "border-transparent text-neutral-300 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
              }`

            if (isHashLink) {
              return (
                <a
                  key={item.label}
                  href={item.to}
                  onClick={onClose}
                  className={commonClasses()}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-neutral-400" />
                </a>
              )
            }

            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === "/"}
                onClick={onClose}
                className={({ isActive }) => commonClasses({ isActiveOverride: isActive })}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-neutral-400" />
              </NavLink>
            )
          })}
        </nav>

        {/* Auth + footer */}
        <div className="border-t border-white/10 px-6 py-6">
          {!isAuthenticated ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => { onClose(); navigate("/login") }}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/10 active:scale-95"
              >
                <LogIn className="h-4 w-4" />Log in
              </button>
              <button
                onClick={() => { onClose(); navigate("/signup") }}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-orange-400 active:scale-95"
              >
                <UserPlus className="h-4 w-4" />Sign up
              </button>
            </div>
          ) : (
            <button
              onClick={() => { onClose(); navigate("/generate") }}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-orange-400 active:scale-95"
            >
              <Sparkles className="h-4 w-4" />Go to workspace
            </button>
          )}
          <p className="mt-5 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-600">
            Save 💾 and grow — usage-based
          </p>
        </div>
      </aside>
    </>
  )
}