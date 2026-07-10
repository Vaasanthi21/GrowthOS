"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../lib/AuthContext"
import { useToast } from "../components/ui/use-toast"
import Spline from "@splinetool/react-spline"
import HamburgerMenu from "../components/HamburgerMenu"
import {
  Sparkles, ArrowUpRight, ArrowRight, ImageIcon, Video, FileText,
  BarChart3, Wand2, Check, Play, Hash, TrendingUp, Download, Zap,
  Layers, Command, Eye, Pencil, Menu, X,
} from "lucide-react"

/* ================================================================== */
/*  Root                                                              */
/* ================================================================== */

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-[#0a0705] font-sans text-neutral-200 antialiased selection:bg-orange-500/30">
      <GlobalMotionStyles />
      <ScrollProgress />
      <SplineBackground />
      <Nav />
      <main className="pointer-events-none relative z-10 [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_form]:pointer-events-auto [&_textarea]:pointer-events-auto">
        <Hero />
        <StudioCoverflow />
        <ContentStudio />
        <ImageStudio />
        <VideoStudio />
        <BlogStudio />
        <TrackerStudio />
        <PlatformStudio />
        <Waitlist />
      </main>
      <Footer />
    </div>
  )
}

/* ============================== Motion kit ========================= */

function useReveal(threshold = 0.15) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.unobserve(el)
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return [ref, visible]
}

function Reveal({ children, className = "", delay = 0, y = 24, as: Tag = "div" }) {
  const [ref, visible] = useReveal()
  return (
    <Tag
      ref={ref}
      style={{
        transitionDelay: `${delay}ms`,
        transform: visible ? "translateY(0)" : `translateY(${y}px)`,
      }}
      className={`transition-all duration-700 ease-out ${visible ? "opacity-100" : "opacity-0"} ${className}`}
    >
      {children}
    </Tag>
  )
}

function TiltCard({ children, className = "", max = 8, style = {} }) {
  const ref = useRef(null)
  const onMove = (e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    const rx = (py - 0.5) * -max
    const ry = (px - 0.5) * max
    el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px) scale(1.015)`
  }
  const reset = () => { if (ref.current) ref.current.style.transform = "" }
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={reset} style={style}
      className={`transition-transform duration-200 ease-out will-change-transform ${className}`}>
      {children}
    </div>
  )
}

function Magnetic({ children, strength = 0.25, className = "" }) {
  const ref = useRef(null)
  const onMove = (e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = e.clientX - r.left - r.width / 2
    const y = e.clientY - r.top - r.height / 2
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`
  }
  const reset = () => { if (ref.current) ref.current.style.transform = "" }
  return (
    <span ref={ref} onMouseMove={onMove} onMouseLeave={reset}
      className={`inline-block transition-transform duration-200 ease-out ${className}`}>
      {children}
    </span>
  )
}

function splitStat(value) {
  const m = String(value).match(/^([\d.,]+)(.*)$/)
  if (!m) return { num: 0, suffix: String(value), decimals: 0 }
  const numStr = m[1].replace(/,/g, "")
  const decimals = numStr.includes(".") ? numStr.split(".")[1].length : 0
  return { num: parseFloat(numStr), suffix: m[2], decimals }
}

function StatValue({ value, visible, duration = 1200 }) {
  const { num, suffix, decimals } = useMemo(() => splitStat(value), [value])
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (!visible) return
    let raf, start = null
    const step = (ts) => {
      if (start === null) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(num * eased)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [visible, num, duration])
  return (<>{display.toFixed(decimals)}{suffix}</>)
}

function ScrollProgress() {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    let raf = null
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        const h = document.documentElement
        const scrolled = h.scrollTop
        const max = h.scrollHeight - h.clientHeight
        setPct(max > 0 ? (scrolled / max) * 100 : 0)
        raf = null
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] bg-transparent">
      <div className="h-full bg-gradient-to-r from-orange-600 via-orange-400 to-orange-600 transition-[width] duration-150 ease-out"
        style={{ width: `${pct}%` }} />
    </div>
  )
}

function GlobalMotionStyles() {
  return (
    <style>{`
      html, body {
        overscroll-behavior-y: none;
        height: 100%;
      }
      @keyframes cos-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      @keyframes cos-pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(249,115,22,0.35); } 70% { box-shadow: 0 0 0 14px rgba(249,115,22,0); } 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); } }
      @keyframes cos-shimmer { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
      @keyframes cos-glass-sheen { 0% { transform: translateX(-120%); } 60%, 100% { transform: translateX(120%); } }
      .cos-logo-icon { animation: cos-float 3.2s ease-in-out infinite; }
      .cos-core-ring { animation: cos-pulse-ring 2.4s ease-out infinite; }
      .cos-shimmer-text {
        background-image: linear-gradient(100deg, #fb923c, #f97316 45%, #fdba74 55%, #fb923c);
        background-size: 220% 100%;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: cos-shimmer 5s linear infinite;
      }
      .cos-liquid-glass {
        position: relative;
        isolation: isolate;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.02) 100%),
          radial-gradient(120% 200% at 50% -40%, rgba(255,255,255,0.18), rgba(255,255,255,0) 55%),
          rgba(12, 10, 9, 0.35);
        backdrop-filter: blur(22px) saturate(180%);
        -webkit-backdrop-filter: blur(22px) saturate(180%);
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow:
          0 1px 0 rgba(255,255,255,0.14) inset,
          0 -1px 0 rgba(255,255,255,0.04) inset,
          0 8px 32px rgba(0,0,0,0.35),
          0 0 0 1px rgba(255,255,255,0.03);
      }
      .cos-liquid-glass::before {
        content: "";
        position: absolute; inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: linear-gradient(140deg, rgba(255,255,255,0.35), rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.18));
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
                mask-composite: exclude;
        pointer-events: none;
      }
      .cos-liquid-glass::after {
        content: "";
        position: absolute; inset: 0;
        border-radius: inherit;
        overflow: hidden;
        pointer-events: none;
        background:
          radial-gradient(60% 120% at 20% 0%, rgba(255,255,255,0.10), rgba(255,255,255,0) 60%),
          radial-gradient(80% 120% at 90% 100%, rgba(249,115,22,0.10), rgba(249,115,22,0) 60%);
      }
      .cos-liquid-glass--scrolled {
        background:
          linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.03) 100%),
          radial-gradient(120% 200% at 50% -40%, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%),
          rgba(10, 7, 5, 0.55);
        backdrop-filter: blur(28px) saturate(200%);
        -webkit-backdrop-filter: blur(28px) saturate(200%);
      }
      .cos-liquid-sheen {
        position: absolute; inset: 0;
        border-radius: inherit;
        overflow: hidden;
        pointer-events: none;
      }
      .cos-liquid-sheen::before {
        content: "";
        position: absolute; top: 0; bottom: 0; left: 0;
        width: 40%;
        background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.10) 45%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.10) 55%, transparent 100%);
        filter: blur(2px);
        transform: translateX(-120%);
        animation: cos-glass-sheen 7.5s ease-in-out infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .cos-logo-icon, .cos-core-ring, .cos-shimmer-text, .cos-liquid-sheen::before { animation: none !important; }
        * { transition-duration: 0.001ms !important; }
      }
    `}</style>
  )
}

/* ------------------------------- Nav ------------------------------- */

function Logo({ className = "" }) {
  return (
    <a href="#" className={`flex items-center gap-2.5 ${className}`} data-testid="nav-logo">
      <span className="cos-logo-icon grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg shadow-orange-600/30">
        <Sparkles className="h-5 w-5 text-black" />
      </span>
      <span className="text-lg font-bold tracking-tight text-white">
        Creative<span className="text-orange-500">OS</span>
      </span>
    </a>
  )
}

export function Nav() {
  const links = ["Content", "Image", "Video", "Blog", "Tracker", "Platform"]
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <>
      <header
        data-testid="site-nav"
        className={`cos-liquid-glass pointer-events-auto fixed inset-x-0 z-50 mx-auto flex max-w-6xl items-center justify-between rounded-full transition-all duration-500 ease-out md:px-6 ${
          scrolled ? "cos-liquid-glass--scrolled top-2 px-4 py-2" : "top-4 px-4 py-2.5"
        }`}
      >
        <span className="cos-liquid-sheen" aria-hidden />
        <Logo />
        <nav className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a
              key={l}
              data-testid={`nav-link-${l.toLowerCase()}`}
              href={`#${l.toLowerCase()}`}
              className="relative text-sm text-neutral-300 transition-colors duration-300 hover:text-white after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-orange-500 after:transition-all after:duration-300 hover:after:w-full"
            >
              {l}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Magnetic strength={0.3} className="hidden sm:inline-block">
            <a href="#waitlist" data-testid="nav-join-waitlist"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_6px_18px_rgba(0,0,0,0.25)] transition-transform hover:scale-[1.03] active:scale-95">
              Join waitlist
            </a>
          </Magnetic>
          <button
            type="button"
            data-testid="nav-hamburger"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}

/* ------------------------------ Hero ------------------------------- */

function Hero() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const stats = [
    { v: "20K+", l: "Assets Generated" },
    { v: "12K", l: "Creators Onboarded" },
    { v: "4", l: "Integrated Studios" },
    { v: "99.9%", l: "Uptime SLA" },
  ]
  const [statsRef, statsVisible] = useReveal(0.3)
  const blobRef = useRef(null)

  useEffect(() => {
    let raf = null
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        if (blobRef.current) {
          const y = Math.min(window.scrollY, 800)
          blobRef.current.style.transform = `translate(-50%, ${y * 0.18}px) scale(${1 + y * 0.0002})`
        }
        raf = null
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <section className="relative mx-auto max-w-6xl px-5 pt-40 pb-24 text-center md:pt-48">
      <div ref={blobRef} className="pointer-events-none absolute left-1/2 top-24 -z-10 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-orange-600/20 blur-[140px]" />
      <Reveal y={16}>
        <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-xs text-neutral-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
          v1.0 — Now in beta
        </span>
      </Reveal>
      <Reveal delay={80} y={26}>
        <h1 className="mx-auto mt-8 max-w-4xl text-balance text-5xl font-extrabold leading-[0.98] tracking-tight text-white md:text-7xl lg:text-8xl">
          Create Stunning<br />Content with <span className="cos-shimmer-text italic">AI</span>
        </h1>
      </Reveal>
      <Reveal delay={160} y={22}>
        <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-neutral-400 md:text-lg">
          Generate images, videos, blogs, and professional LinkedIn content — all from one intelligent workspace.
        </p>
      </Reveal>
      <Reveal delay={240} y={18}>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Magnetic strength={0.25}>
            <button data-testid="hero-start-creating"
              onClick={() => navigate(isAuthenticated ? "/generate" : "/login?redirect=/generate")}
              className="group inline-flex items-center gap-2 rounded-full bg-orange-500 px-7 py-3.5 text-sm font-semibold text-black transition-all hover:bg-orange-400 hover:shadow-lg hover:shadow-orange-500/30 active:scale-95">
              <Sparkles className="h-4 w-4" />
              Start Creating
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </Magnetic>
          <Magnetic strength={0.25}>
            <a href="#content" data-testid="hero-explore-platform"
              className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10 hover:-translate-y-0.5 active:scale-95">
              Explore the platform
            </a>
          </Magnetic>
        </div>
      </Reveal>
      <div ref={statsRef} className="pointer-events-auto mx-auto mt-20 grid max-w-4xl grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] md:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.l}
            style={{ transitionDelay: `${i * 90}ms`, transform: statsVisible ? "translateY(0)" : "translateY(16px)" }}
            className={`px-6 py-7 transition-all duration-700 ease-out hover:-translate-y-0.5 hover:bg-white/[0.05] ${statsVisible ? "opacity-100" : "opacity-0"} ${i !== 0 ? "md:border-l md:border-white/10" : ""} ${i % 2 !== 0 ? "border-l border-white/10 md:border-l" : ""} ${i >= 2 ? "border-t border-white/10 md:border-t-0" : ""}`}>
            <div className="text-3xl font-bold text-white"><StatValue value={s.v} visible={statsVisible} /></div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-neutral-500">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ------------------------- Studio Coverflow ------------------------- */

function StudioCoverflow() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { toast } = useToast()
  const cards = [
    { title: "Content Studio", desc: "One universal prompt bar to generate posts, images and videos in one flow.", path: "/generate", icon: Layers },
    { title: "Image Studio", desc: "Turn a sentence into a full visual world — four HD styles in seconds.", path: "/generate?tab=images", icon: ImageIcon },
    { title: "Video Studio", desc: "Describe a scene, get cinematic footage with timeline and export ready.", path: "/generate?tab=videos", icon: Video },
    { title: "Blog Studio", desc: "SEO-tuned, source-cited long-form articles in a Notion-style editor.", path: "/blog-studio", icon: FileText },
    { title: "LinkedIn Tracker", desc: "A living dashboard for impressions, engagement, CTR and follower growth.", path: "/linkedinads", icon: BarChart3 },
    { title: "Platform Core", desc: "One workspace, four studios, zero context-switching.", path: "/generate", icon: Sparkles },
  ]
  const cardCount = cards.length
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [sectionRef, sectionVisible] = useReveal(0.2)

  useEffect(() => {
    if (isPaused || !sectionVisible) return
    const timer = setInterval(() => setActiveIndex((prev) => (prev + 1) % cardCount), 2600)
    return () => clearInterval(timer)
  }, [isPaused, sectionVisible, cardCount])

  const getOffset = (idx) => {
    let diff = idx - activeIndex
    if (diff > cardCount / 2) diff -= cardCount
    if (diff < -cardCount / 2) diff += cardCount
    return diff
  }

  return (
    <section ref={sectionRef} className="mx-auto max-w-6xl px-5 pb-24"
      style={{ transitionDelay: "80ms", transform: sectionVisible ? "translateY(0)" : "translateY(24px)" }}>
      <div className={`text-center transition-all duration-700 ease-out ${sectionVisible ? "opacity-100" : "opacity-0"}`}>
        <div className="flex justify-center"><SectionLabel>Studio Index</SectionLabel></div>
        <h2 className="mx-auto mt-5 max-w-xl text-balance text-3xl font-bold tracking-tight text-white md:text-4xl">
          Six studios, one prompt bar away.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-neutral-500">
          Cycles automatically — hover to pause, click any card to jump straight to it.
        </p>
      </div>

      <div className="pointer-events-auto relative mt-14 flex h-[440px] items-center justify-center sm:h-[480px]"
        style={{ perspective: "1600px" }}
        onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
        {cards.map((card, idx) => {
          const offset = getOffset(idx)
          const abs = Math.abs(offset)
          const isActive = offset === 0
          if (abs > 2) return null
          const translateX = offset * 260
          const scale = isActive ? 1 : abs === 1 ? 0.82 : 0.64
          const rotateY = isActive ? 0 : offset > 0 ? -36 : 36
          const opacity = isActive ? 1 : abs === 1 ? 0.55 : 0.22
          const zIndex = 20 - abs
          return (
            <div key={card.title}
              data-testid={`coverflow-card-${card.title.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => {
                if (isActive) {
                  if (isAuthenticated) navigate(card.path)
                  else {
                    toast({ title: "Authentication Required", description: "Please login or create an account to access the studios." })
                    navigate(`/login?redirect=${card.path}`)
                  }
                } else setActiveIndex(idx)
              }}
              style={{
                transform: `translateX(${translateX}px) scale(${scale}) rotateY(${rotateY}deg)`,
                opacity, zIndex, transformStyle: "preserve-3d",
                transition: "transform 550ms cubic-bezier(0.22, 1, 0.36, 1), opacity 550ms ease-out",
              }}
              className="absolute h-[380px] w-[300px] cursor-pointer rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-sm sm:h-[420px] sm:w-[330px] sm:p-8">
              <div className="flex h-full flex-col justify-between gap-8">
                <div>
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-orange-500/10 text-orange-500">
                    <card.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-6 text-2xl font-bold text-white">{card.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-500">{card.desc}</p>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-orange-500">
                  <span>Open studio</span><ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
              {isActive && (
                <div className="pointer-events-none absolute -inset-px -z-10 rounded-2xl blur-2xl"
                  style={{ background: "radial-gradient(200px circle, rgba(249,115,22,0.16) 0%, transparent 80%)" }} />
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2">
        {cards.map((card, idx) => (
          <button key={card.title} data-testid={`coverflow-dot-${idx}`} onClick={() => setActiveIndex(idx)}
            aria-label={`Show ${card.title}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${idx === activeIndex ? "w-6 bg-orange-500" : "w-1.5 bg-white/15"}`} />
        ))}
      </div>
    </section>
  )
}

/* --------------------------- Shared bits --------------------------- */

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-8 bg-orange-500" />
      <span className="font-mono text-xs uppercase tracking-widest text-orange-500">{children}</span>
    </div>
  )
}

function StudioHeading({ label, title, desc }) {
  return (
    <div className="max-w-2xl">
      <SectionLabel>{label}</SectionLabel>
      <h2 className="mt-5 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-5xl">{title}</h2>
      <p className="mt-5 text-pretty text-lg leading-relaxed text-neutral-400">{desc}</p>
    </div>
  )
}

function FeatureRow({ icon: Icon, title, status }) {
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-500/30 hover:bg-white/[0.05]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-500 transition-transform duration-300 group-hover:scale-110">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">{title}</div>
        <div className="text-xs text-neutral-500">{status}</div>
      </div>
    </div>
  )
}

/* -------------------------- Content Studio ------------------------- */

function ContentStudio() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { toast } = useToast()
  const [mode, setMode] = useState("single")
  const [topic, setTopic] = useState("Launch teaser for our new AI video studio — audience: B2C marketers.")
  const [type, setType] = useState("Text + Image")
  const [keywords, setKeywords] = useState("AI, launch, marketing, creators")

  const contentTypes = [
    { label: "Text Only", credits: 1, icon: FileText },
    { label: "Image", credits: 3, icon: ImageIcon },
    { label: "Video", credits: 69, icon: Video },
    { label: "Text + Image", credits: 4, icon: Sparkles },
    { label: "Text + Video", credits: 70, icon: Wand2 },
  ]

  const go = () => {
    if (isAuthenticated) navigate("/generate", { state: { topic, type, keywords, mode } })
    else {
      toast({ title: "Authentication Required", description: "Please login or create an account to access Content Studio." })
      navigate("/login?redirect=/generate")
    }
  }

  return (
    <section id="content" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <StudioHeading label="00 — Content Studio" title="One prompt bar. Every format."
          desc="Text, image, video, or all three — a single brief routes through the right models with your brand voice, keywords and logo baked in." />
      </Reveal>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_320px]">
        <Reveal delay={100} className="pointer-events-auto rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 p-1">
            {[{ id: "single", label: "Single Post" }, { id: "batch", label: "Batch Generation" }].map((m) => (
              <button key={m.id} data-testid={`content-mode-${m.id}`} onClick={() => setMode(m.id)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${mode === m.id ? "bg-orange-500 text-black" : "text-neutral-400 hover:text-white"}`}>
                {m.label}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">Topic</label>
              <span className="font-mono text-[11px] text-neutral-600">{topic.length}/500</span>
            </div>
            <textarea data-testid="content-topic" value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, 500))} rows={4}
              placeholder="Describe the post idea, campaign angle, or announcement you want to turn into content."
              className="w-full resize-none rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-200 outline-none transition-colors placeholder:text-neutral-600 focus:border-orange-500/40" />
          </div>

          <div className="mt-5">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-neutral-500">Content Type</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {contentTypes.map((c) => {
                const Icon = c.icon
                const active = type === c.label
                return (
                  <button key={c.label}
                    data-testid={`content-type-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    onClick={() => setType(c.label)}
                    className={`group rounded-xl border p-3 text-left transition-all ${active ? "border-orange-500/60 bg-orange-500/[0.08] shadow-[0_0_0_1px_rgba(249,115,22,0.35)]" : "border-white/10 bg-white/[0.02] hover:border-orange-500/25 hover:bg-white/[0.05]"}`}>
                    <Icon className={`h-4 w-4 ${active ? "text-orange-400" : "text-neutral-400"}`} />
                    <div className={`mt-2 text-xs font-semibold ${active ? "text-white" : "text-neutral-200"}`}>{c.label}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-neutral-500">{c.credits} credits</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-neutral-500">Keywords</div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 transition-colors focus-within:border-orange-500/40">
              <Hash className="h-4 w-4 shrink-0 text-orange-500" />
              <input data-testid="content-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)}
                placeholder="AI, release notes, hiring, open source"
                className="min-w-0 flex-1 bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600" />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-500">
              <Command className="h-3.5 w-3.5 text-orange-500" />
              <span>Ctrl / Cmd + Enter to generate</span>
            </div>
            <Magnetic strength={0.2}>
              <button data-testid="content-generate-btn" onClick={go}
                className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-orange-400 hover:shadow-lg hover:shadow-orange-500/30 active:scale-95">
                <Sparkles className="h-4 w-4" />Generate content<ArrowRight className="h-4 w-4" />
              </button>
            </Magnetic>
          </div>
        </Reveal>

        <Reveal delay={200} className="space-y-4">
          <div className="pointer-events-auto rounded-2xl border border-orange-500/25 bg-orange-500/[0.06] p-5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-orange-400">Shortcut</div>
            <p className="mt-3 text-sm leading-relaxed text-neutral-200">
              Press <kbd className="mx-1 rounded-md border border-white/15 bg-black/40 px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
              + <kbd className="mx-1 rounded-md border border-white/15 bg-black/40 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
              to generate from anywhere in this brief.
            </p>
          </div>
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">In this workflow</div>
            <ul className="mt-3 space-y-2.5">
              {["Single or batch generation", "5 content formats", "Brand voice + logo integrity", "Keywords for on-brand copy"].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-neutral-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />{t}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------- Image Studio --------------------------- */

function ImageStudio() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { toast } = useToast()
  const [prompt, setPrompt] = useState("A futuristic cyberpunk city at sunset.")
  const images = ["/cyberpunk-1.png", "/cyberpunk-2.png", "/cyberpunk-3.png", "/cyberpunk-4.png"]
  const [gridRef, gridVisible] = useReveal(0.2)

  return (
    <section id="image" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <StudioHeading label="01 — Image Studio" title="Turn a sentence into a whole visual world."
          desc="Describe anything. Get four production-ready images in seconds — each in a different style, all at HD quality." />
      </Reveal>
      <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <Reveal delay={100} className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <FeatureRow icon={Wand2} title="Text-to-Image" status="Enabled" />
          <FeatureRow icon={ImageIcon} title="Multiple Styles" status="Enabled" />
          <FeatureRow icon={Sparkles} title="HD Quality" status="Enabled" />
          <FeatureRow icon={Zap} title="Instant Generation" status="Enabled" />
        </Reveal>
        <Reveal delay={180} className="pointer-events-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
          <form onSubmit={(e) => {
              e.preventDefault()
              if (isAuthenticated) navigate("/generate?tab=images", { state: { prompt } })
              else {
                toast({ title: "Authentication Required", description: "Please login or create an account to access the studios." })
                navigate(`/login?redirect=/generate?tab=images`, { state: { prompt } })
              }
            }}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 p-2 pl-4 transition-colors duration-300 focus-within:border-orange-500/40">
            <Sparkles className="h-4 w-4 shrink-0 text-orange-500" />
            <input data-testid="image-prompt-input" value={prompt} onChange={(e) => setPrompt(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600"
              placeholder="Describe your image..." aria-label="Image prompt" />
            <button type="submit" data-testid="image-generate-btn"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-orange-400 hover:scale-[1.03] active:scale-95">
              Generate
            </button>
          </form>
          <div ref={gridRef} className="mt-4 grid grid-cols-2 gap-3">
            {images.map((src, i) => (
              <TiltCard key={src} max={10} className="rounded-xl" style={{ transitionDelay: `${i * 100}ms` }}>
                <div style={{ transitionDelay: `${i * 100}ms`, transform: gridVisible ? "translateY(0) scale(1)" : "translateY(14px) scale(0.97)" }}
                  className={`group relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 transition-all duration-700 ease-out ${gridVisible ? "opacity-100" : "opacity-0"}`}>
                  <img src={src || "/placeholder.svg"} alt="AI generated preview"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm">v{i + 1}</span>
                </div>
              </TiltCard>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-neutral-500">
            <span>Rendered in 1.8s · Seed 042817</span>
            <span className="text-orange-500">HD · 2048×1536</span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------- Video Studio --------------------------- */

function VideoStudio() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { toast } = useToast()
  const ratios = ["16:9", "9:16", "1:1", "4:5"]
  const [barRef, barVisible] = useReveal(0.3)
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef(null)

  // Reset to poster if the section scrolls out of view while playing (saves battery/data on mobile)
  useEffect(() => {
    if (!playing) return
    const el = videoRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setPlaying(false)
      },
      { threshold: 0.2 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [playing])

  return (
    <section id="video" className="mx-auto max-w-6xl px-5 py-24">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <Reveal delay={100} y={30} className="order-2 lg:order-1">
          <TiltCard max={4} className="pointer-events-auto overflow-hidden rounded-2xl">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <Video className="h-4 w-4 shrink-0 text-orange-500" />
                <span className="truncate text-xs text-neutral-400">A drone flying through snowy mountains during sunrise.</span>
              </div>

              <div ref={videoRef} className="relative aspect-video overflow-hidden rounded-xl border border-white/10">
                {playing ? (
                  <video
                    src="/video-preview.mp4"
                    poster="/snowy-mountains.png"
                    className="h-full w-full cursor-pointer object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                    aria-label="Drone flying through snowy mountains during sunrise — playing"
                    onClick={() => setPlaying(false)}
                  />
                ) : (
                  <img src="/snowy-mountains.png" alt="Snowy mountains sunrise" className="h-full w-full object-cover" />
                )}

                {!playing && (
                  <button
                    type="button"
                    aria-label="Play preview"
                    data-testid="video-play-btn"
                    onClick={() => setPlaying(true)}
                    className="absolute inset-0 m-auto grid h-14 w-14 place-items-center rounded-full bg-white/90 text-black backdrop-blur transition-transform duration-300 hover:scale-110 active:scale-95">
                    <Play className="h-6 w-6 translate-x-0.5 fill-black" />
                  </button>
                )}

                <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">16:9</span>

                {!playing && (
                  <div ref={barRef} className="absolute inset-x-3 bottom-3">
                    <div className="flex items-center justify-between font-mono text-[10px] text-white/80">
                      <span>Rendering · Pass 2 of 3</span><span>62%</span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/20">
                      <div className="h-full rounded-full bg-orange-500 transition-[width] duration-[1400ms] ease-out"
                        style={{ width: barVisible ? "62%" : "0%" }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {ratios.map((r, i) => (
                  <span key={r}
                    className={`cursor-default rounded-md border px-2.5 py-1 font-mono text-[11px] transition-all duration-300 hover:-translate-y-0.5 ${i === 0 ? "border-orange-500/40 bg-orange-500/10 text-orange-400" : "border-white/10 bg-white/[0.03] text-neutral-400 hover:border-orange-500/30 hover:text-orange-300"}`}>
                    {r}
                  </span>
                ))}
                <span className="ml-auto font-mono text-[11px] text-neutral-500">00:12 / 00:24</span>
              </div>
              <div className="mt-3 space-y-1.5">
                {["V1 · Drone Aerial", "V2 · Sun Flare", "A1 · Ambient Wind"].map((t) => (
                  <div key={t} className="flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-[11px] text-neutral-400 transition-colors duration-300 hover:border-orange-500/20 hover:text-neutral-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />{t}
                  </div>
                ))}
              </div>
            </div>
          </TiltCard>
        </Reveal>
        <Reveal delay={0} y={30} className="order-1 lg:order-2">
          <StudioHeading label="02 — Video Studio" title="From prompt to cinematic footage."
            desc="Describe a scene. Watch it render into a smooth, cinematic clip — with timeline, aspect ratios and export ready in one flow." />
          <div className="mt-8 grid grid-cols-2 gap-3">
            <FeatureRow icon={Video} title="Text-to-Video" status="Active" />
            <FeatureRow icon={Play} title="Cinematic Motion" status="Active" />
            <FeatureRow icon={ImageIcon} title="Aspect Ratios" status="Active" />
            <FeatureRow icon={Zap} title="Fast Rendering" status="Active" />
          </div>
          <button data-testid="open-video-studio"
            onClick={() => {
              if (isAuthenticated) navigate("/generate?tab=videos")
              else {
                toast({ title: "Authentication Required", description: "Please login or create an account to access the studios." })
                navigate("/login?redirect=/generate?tab=videos")
              }
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-orange-500/10 border border-orange-500/30 px-4 py-2.5 text-sm font-semibold text-orange-500 transition-all hover:bg-orange-500/20 hover:scale-[1.02] active:scale-95">
            <span>Open Video Studio</span><ArrowRight className="h-4 w-4" />
          </button>
        </Reveal>
      </div>
    </section>
  )
}

/* --------------------------- Blog Studio --------------------------- */

function BlogStudio() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { toast } = useToast()

  const blogs = [
    { title: "Modern SEO Strategies for Sustainable Business Growth: A Practical Guide for Long-Term Ranking", category: "Marketing", author: "Unassigned", date: "7/6/2026", seo: 95 },
    { title: "Using Customer Data to Improve Marketing ROI: A Practical Guide for Smarter, Privacy-First Growth", category: "Marketing", author: "Unassigned", date: "7/6/2026", seo: 95 },
    { title: "Content Marketing Strategies That Drive Conversions: A Practical Guide for B2C Growth", category: "Marketing", author: "Unassigned", date: "7/6/2026", seo: 95 },
    { title: "How AI is Transforming Social Media Marketing for Smarter Growth", category: "Marketing", author: "Unassigned", date: "7/6/2026", seo: 95 },
    { title: "AI Marketing Automation for Business Growth: A Practical Guide for SMBs", category: "Marketing", author: "Unassigned", date: "7/6/2026", seo: 95 },
  ]

  const [gridRef, gridVisible] = useReveal(0.15)
  const [tab, setTab] = useState("all")

  const openBlogStudio = (view = "list", suggestedTopicName) => {
    let path = "/blog-studio"
    if (view === "generate" && suggestedTopicName) path = `/blog-studio?view=generate&suggestedTopicName=${encodeURIComponent(suggestedTopicName)}`
    else if (view === "list") path = "/blog-studio?view=list"
    if (isAuthenticated) navigate(path)
    else {
      toast({ title: "Authentication Required", description: "Please login or create an account to access Blog Studio." })
      navigate(`/login?redirect=${encodeURIComponent(path)}`)
    }
  }

  return (
    <section id="blog" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <StudioHeading label="03 — Blog Studio" title="Publish long-form that actually ranks."
          desc="AI-drafted, SEO-tuned, source-cited articles — formatted in a Notion-style editor and exportable in one click." />
      </Reveal>

      <Reveal delay={80} className="pointer-events-auto mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
          <Sparkles className="h-4 w-4 shrink-0 text-orange-500" />
          <input data-testid="blog-search" placeholder="Search by title, category, author, or topic…"
            className="min-w-0 flex-1 bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600" />
        </div>
        <Magnetic strength={0.2}>
          <button data-testid="blog-generate-new" onClick={() => openBlogStudio("generate", "New topic")}
            className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-orange-500/25 transition-all hover:bg-orange-400 hover:scale-[1.02] active:scale-95">
            <Sparkles className="h-4 w-4" />Generate New Blog
            <span className="rounded-full bg-black/20 px-2 py-0.5 font-mono text-[10px]">10 credits</span>
          </button>
        </Magnetic>
      </Reveal>

      <div className="mt-6 flex items-center gap-6 border-b border-white/10 pb-2">
        {[{ id: "all", label: "All", count: 5 }, { id: "drafts", label: "Drafts", count: 5 }, { id: "archived", label: "Archived", count: 0 }].map((t) => (
          <button key={t.id} data-testid={`blog-tab-${t.id}`} onClick={() => setTab(t.id)}
            className={`relative flex items-center gap-2 pb-2 text-sm transition-colors ${tab === t.id ? "text-white" : "text-neutral-500 hover:text-neutral-300"}`}>
            {t.label}
            <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${tab === t.id ? "bg-orange-500/15 text-orange-400" : "bg-white/5 text-neutral-500"}`}>{t.count}</span>
            {tab === t.id && (<span className="absolute inset-x-0 -bottom-[9px] h-px bg-gradient-to-r from-transparent via-orange-500 to-transparent" />)}
          </button>
        ))}
      </div>

      <div ref={gridRef} className="pointer-events-auto mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {blogs.map((b, i) => (
          <div key={b.title}
            style={{ transitionDelay: `${i * 80}ms`, transform: gridVisible ? "translateY(0) scale(1)" : "translateY(18px) scale(0.98)" }}
            className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all duration-700 ease-out hover:-translate-y-1 hover:border-orange-500/30 hover:bg-white/[0.05] hover:shadow-lg hover:shadow-orange-500/[0.06] ${gridVisible ? "opacity-100" : "opacity-0"}`}>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-neutral-300">Draft</span>
              <span className="font-mono text-[11px] text-neutral-500">{b.date}</span>
            </div>
            <h3 className="mt-4 line-clamp-2 min-h-[3.25rem] text-[15px] font-semibold leading-snug text-white transition-colors group-hover:text-orange-100">{b.title}</h3>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Author</div>
                <div className="mt-0.5 text-xs text-neutral-300">{b.author}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Category</div>
                <div className="mt-0.5 text-xs text-neutral-300">{b.category}</div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-neutral-500">SEO Score:</span>
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-400">{b.seo}/100</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button data-testid={`blog-edit-${i}`} onClick={() => openBlogStudio("generate", b.title)}
                  className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-400 transition-all hover:bg-orange-500/20">
                  <Pencil className="h-3 w-3" />Edit
                </button>
                <button data-testid={`blog-preview-${i}`} onClick={() => openBlogStudio("list")}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-neutral-300 transition-all hover:border-white/20 hover:bg-white/10">
                  <Eye className="h-3 w-3" />Preview
                </button>
              </div>
            </div>
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-orange-500/10 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Magnetic strength={0.2}>
          <button data-testid="blog-open-studio" onClick={() => openBlogStudio("list")}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/10 hover:-translate-y-0.5 active:scale-95">
            Open Blog Studio<ArrowRight className="h-4 w-4" />
          </button>
        </Magnetic>
      </div>
    </section>
  )
}

/* ------------------------- Tracker Studio -------------------------- */

function TrackerStudio() {
  const stats = [
    { v: "128.4K", l: "Impressions", d: "+34.2%" },
    { v: "12.5K", l: "Engagement", d: "+18.7%" },
    { v: "492", l: "CTR", d: "+9.1%" },
    { v: "8.4K", l: "Followers", d: "+12.4%" },
  ]
  const bars = [420, 560, 690, 510, 780, 640, 910]
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const posts = [
    { r: "01", t: "How we used AI to write 40 case studies in 4 hours", a: "42.1K", b: "3.8K", c: "6.9%" },
    { r: "02", t: "The prompt template that got us 100K impressions", a: "38.7K", b: "3.1K", c: "5.4%" },
    { r: "03", t: "Why every marketer should learn one AI workflow a week", a: "24.2K", b: "1.9K", c: "4.1%" },
  ]
  const line = useMemo(() => {
    const pts = [120, 240, 210, 360, 420, 500, 620, 760]
    const max = Math.max(...pts)
    return pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${100 - (p / max) * 100}`).join(" ")
  }, [])
  const [statsRef, statsVisible] = useReveal(0.3)
  const [barsRef, barsVisible] = useReveal(0.3)
  const [lineRef, lineVisible] = useReveal(0.3)
  const [postsRef, postsVisible] = useReveal(0.3)

  return (
    <section id="tracker" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <StudioHeading label="04 — LinkedIn Tracker" title="See what's working. Do more of it."
          desc="A living dashboard tracking impressions, engagement, CTR and follower growth — with content-level analytics baked in." />
      </Reveal>
      <div ref={statsRef} className="pointer-events-auto mt-12 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.l}
            style={{ transitionDelay: `${i * 90}ms`, transform: statsVisible ? "translateY(0)" : "translateY(16px)" }}
            className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all duration-700 ease-out hover:-translate-y-1 hover:border-orange-500/20 hover:bg-white/[0.05] ${statsVisible ? "opacity-100" : "opacity-0"}`}>
            <div className="flex items-center gap-1 text-xs font-medium text-orange-400">
              <TrendingUp className="h-3.5 w-3.5" />{s.d}
            </div>
            <div className="mt-2 text-2xl font-bold text-white"><StatValue value={s.v} visible={statsVisible} /></div>
            <div className="mt-0.5 text-xs text-neutral-500">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Reveal delay={100} className="pointer-events-auto rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-500">Impressions · Last 7 days</span>
            <span className="text-xs font-medium text-orange-400">+34.2% WoW</span>
          </div>
          <div ref={barsRef} className="mt-6 flex h-44 items-end justify-between gap-3">
            {bars.map((b, i) => (
              <div key={days[i]} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t-md bg-gradient-to-t from-orange-600/40 to-orange-500 transition-[height] ease-out"
                    style={{ height: barsVisible ? `${(b / 910) * 100}%` : "0%", transitionDuration: "900ms", transitionDelay: `${i * 70}ms` }} />
                </div>
                <span className="font-mono text-[10px] text-neutral-600">{days[i]}</span>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={200} className="pointer-events-auto rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-500">Follower Growth</span>
            <span className="text-xs font-medium text-orange-400">+2,412</span>
          </div>
          <div ref={lineRef} style={{ transform: lineVisible ? "scale(1)" : "scale(0.96)", transitionDelay: "120ms" }}
            className={`mt-6 h-44 origin-bottom transition-all duration-700 ease-out ${lineVisible ? "opacity-100" : "opacity-0"}`}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
              <defs>
                <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(249 115 22)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="rgb(249 115 22)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={`0,100 ${line} 100,100`} fill="url(#fillGrad)" />
              <polyline points={line} fill="none" stroke="rgb(249 115 22)" strokeWidth="2"
                vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
                pathLength="100" strokeDasharray="100"
                strokeDashoffset={lineVisible ? "0" : "100"}
                style={{ transition: "stroke-dashoffset 1.4s ease-out 0.2s" }} />
            </svg>
          </div>
        </Reveal>
      </div>
      <Reveal delay={100} className="pointer-events-auto mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Top performing posts</span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-500">This month</span>
        </div>
        <div ref={postsRef} className="mt-4 divide-y divide-white/10">
          {posts.map((p, i) => (
            <div key={p.r}
              style={{ transitionDelay: `${i * 90}ms`, transform: postsVisible ? "translateX(0)" : "translateX(-12px)" }}
              className={`flex items-center gap-4 rounded-lg py-3.5 pl-2 transition-all duration-500 ease-out hover:bg-white/[0.04] hover:pl-4 ${postsVisible ? "opacity-100" : "opacity-0"}`}>
              <span className="font-mono text-sm text-orange-500">#{p.r}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">{p.t}</span>
              <div className="hidden shrink-0 gap-6 font-mono text-xs text-neutral-500 sm:flex">
                <span>{p.a} imp</span><span>{p.b} eng</span>
                <span className="text-orange-400">{p.c}</span>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

/* ------------------------- Platform Studio ------------------------- */

function PlatformStudio() {
  const nodes = [
    { icon: Layers, t: "Content Studio", s: "Universal generator" },
    { icon: ImageIcon, t: "Image Studio", s: "Text-to-Image" },
    { icon: Video, t: "Video Studio", s: "Text-to-Video" },
    { icon: FileText, t: "Blog Studio", s: "Long-form writing" },
    { icon: BarChart3, t: "LinkedIn Tracker", s: "Growth analytics" },
  ]
  const [nodesRef, nodesVisible] = useReveal(0.2)

  return (
    <section id="platform" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal className="text-center">
        <div className="flex justify-center"><SectionLabel>05 — Unified Platform</SectionLabel></div>
        <h2 className="mx-auto mt-5 max-w-2xl text-balance text-4xl font-bold tracking-tight text-white md:text-5xl">
          Everything you need to create content.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-neutral-400">
          One workspace. Five studios. Zero context-switching. Assets, prompts and analytics — all connected through the same intelligent core.
        </p>
      </Reveal>
      <div className="mt-14">
        <Reveal delay={100}>
          <div className="cos-core-ring pointer-events-auto mx-auto mb-8 flex max-w-sm flex-col items-center rounded-2xl border border-orange-500/30 bg-orange-500/[0.06] p-6 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-black">
              <Sparkles className="h-6 w-6" />
            </span>
            <div className="mt-3 text-lg font-bold text-white">CreativeOS Core</div>
            <div className="font-mono text-xs uppercase tracking-wider text-orange-400/80">Universal prompt bar</div>
          </div>
        </Reveal>
        <div ref={nodesRef} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {nodes.map((n, i) => (
            <div key={n.t}
              style={{ transitionDelay: `${i * 100}ms`, transform: nodesVisible ? "translateY(0)" : "translateY(18px)" }}
              className={`transition-all duration-700 ease-out ${nodesVisible ? "opacity-100" : "opacity-0"}`}>
              <TiltCard max={10} className="pointer-events-auto">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors duration-300 hover:border-orange-500/30 hover:bg-white/[0.05]">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-orange-500/10 text-orange-500">
                    <n.icon className="h-5 w-5" />
                  </span>
                  <div className="mt-4 text-sm font-semibold text-white">{n.t}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{n.s}</div>
                </div>
              </TiltCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------ Waitlist --------------------------- */

function Waitlist() {
  const [email, setEmail] = useState("")
  const [done, setDone] = useState(false)
  return (
    <section id="waitlist" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal className="pointer-events-auto relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center">
        <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[600px] -translate-x-1/2 rounded-full bg-orange-600/20 blur-[120px]" />
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-xs text-neutral-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />3 creators in queue
          </span>
          <h2 className="mx-auto mt-6 max-w-lg text-balance text-4xl font-bold tracking-tight text-white md:text-5xl">
            Creative<span className="text-orange-500">OS</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-pretty text-lg text-neutral-400">One AI platform. Unlimited creativity.</p>
          {done ? (
            <div className="mx-auto mt-8 inline-flex animate-[cos-float_1s_ease-in-out] items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-5 py-3 text-sm font-medium text-orange-300">
              <Check className="h-4 w-4" />You&apos;re on the list — see you soon.
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) setDone(true) }}
              className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address" aria-label="Email address" data-testid="waitlist-email-input"
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/40 px-5 py-3.5 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-orange-500/50" />
              <Magnetic strength={0.2}>
                <button type="submit" data-testid="waitlist-submit-btn"
                  className="w-full shrink-0 rounded-full bg-orange-500 px-6 py-3.5 text-sm font-semibold text-black transition-all hover:bg-orange-400 hover:scale-[1.02] active:scale-95 sm:w-auto">
                  Start Creating Today
                </button>
              </Magnetic>
            </form>
          )}
          <p className="mt-4 text-xs text-neutral-600">No spam. Unsubscribe any time.</p>
        </div>
      </Reveal>
    </section>
  )
}

/* ------------------------------ Footer ----------------------------- */

export function Footer() {
  return (
    <footer className="pointer-events-auto relative z-10 border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold text-white">Creative<span className="text-orange-500">OS</span></span>
          <span className="font-mono text-xs text-neutral-600">© 2026</span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-neutral-400">
          <a href="#" className="transition-colors hover:text-white">Home</a>
          <a href="#platform" className="transition-colors hover:text-white">Studios</a>
          <a href="#waitlist" className="transition-colors hover:text-white">Waitlist</a>
        </nav>
        <span className="font-mono text-xs text-neutral-600">Made for creators.</span>
      </div>
    </footer>
  )
}

/* --------------------------- Background ---------------------------- */

function SplineBackground() {
  return (
    <div
      className="fixed inset-0 z-0 h-[100dvh] w-full overflow-hidden bg-[#0a0705]"
      style={{ transform: "translateZ(0)", WebkitTransform: "translateZ(0)" }}
    >
      <Spline scene="https://prod.spline.design/1aDqxN5NtaOu23Lj/scene.splinecode"
        className="absolute inset-0 h-full w-full" />
    </div>
  )
}

export default LandingPage