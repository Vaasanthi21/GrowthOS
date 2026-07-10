"use client"
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  X,
  Sparkles,
  ArrowRight,
  Info,
  Film,
  Image as ImageIcon,
  Type,
  ChevronDown,
} from "lucide-react";
import PageShell from "@/components/PageShell";
import SEO from "@/components/SEO";

/* ---------------------------------------------------------
   Motion helpers — a scroll reveal hook and a pointer-tilt hook.
   Both respect prefers-reduced-motion.
--------------------------------------------------------- */

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, visible];
}

function Reveal({ children, className = "", delay = 0, as: Tag = "div" }) {
  const [ref, visible] = useReveal();
  return (
    <Tag
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

function useTilt(maxTilt = 7) {
  const ref = useRef(null);

  const onMouseMove = (e) => {
    if (prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(1000px) rotateX(${(-py * maxTilt).toFixed(
      2
    )}deg) rotateY(${(px * maxTilt).toFixed(2)}deg) translateY(-6px) scale(1.02)`;
    el.style.setProperty("--glow-x", `${(px + 0.5) * 100}%`);
    el.style.setProperty("--glow-y", `${(py + 0.5) * 100}%`);

    const shine = el.querySelector(".tilt-shine");
    if (shine) {
      shine.style.opacity = "1";
      shine.style.background = `radial-gradient(circle at ${(px + 0.5) * 100}% ${
        (py + 0.5) * 100
      }%, rgba(255,255,255,0.08), transparent 55%)`;
    }
  };

  const onMouseLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform =
      "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px) scale(1)";
    const shine = el.querySelector(".tilt-shine");
    if (shine) shine.style.opacity = "0";
  };

  return { ref, onMouseMove, onMouseLeave };
}

function TiltCard({ children, className = "", maxTilt = 9 }) {
  const { ref, onMouseMove, onMouseLeave } = useTilt(maxTilt);
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`tilt-card relative will-change-transform transition-transform duration-300 ease-out motion-reduce:transition-none ${className}`}
    >
      <span className="tilt-shine pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300" />
      {children}
    </div>
  );
}

/* ---------------------------------------------------------
   Content
--------------------------------------------------------- */

const FORMATS = [
  {
    eyebrow: "Everywhere · Free",
    icon: ImageIcon,
    title: "Still image",
    subtitle: "One frame, one moment",
    desc: "A still graphic for a post or thumbnail. Useful, but every AI tool — including the free ones — does this equally well.",
    highlight: false,
  },
  {
    eyebrow: "Creative Studio",
    icon: Film,
    title: "AI video, 10–12 sec",
    subtitle: "A scene that moves, with sound",
    desc: "Dozens of frames generated in sequence with synced audio — the part that normally needs a camera, an editor, and a day's work.",
    highlight: true,
  },
];

const BUNDLED = [
  { label: "Text generations", value: "300–600 / mo" },
  { label: "Image generations", value: "80–200 / mo" },
  { label: "Brand-matched styling", value: "Included" },
];

const BILLED = [
  { label: "AI video, 10–12 sec", value: "6–18 / mo" },
  { label: "Per-video cost to you", value: "~₹190–280" },
  { label: "Vs. an editor's day rate", value: "Cheaper" },
];

const PLANS = [
  {
    name: "Pro",
    testid: "pack-pro",
    tagline: "For creators shipping content weekly",
    price: "1,899",
    credits: "1,500",
    features: [
      "1,500 platform credits",
      "Unused credits never expire",
      "Generate text, images & video",
      "Brand-matched styling",
    ],
    cta: "Start with Pro",
    popular: false,
  },
  {
    name: "Studio",
    testid: "pack-studio",
    tagline: "For teams and high-output creators",
    price: "4,999",
    credits: "4,500",
    features: [
      "4,500 platform credits",
      "Unused credits never expire",
      "Generate text, images & video",
      "Brand-matched styling",
    ],
    cta: "Start with Studio",
    popular: true,
  },
];

const FAQ = [
  {
    q: "Why charge anything if images are free elsewhere?",
    a: "We don't really charge for images — they're bundled in generously on every plan, including the trial. The price on this page reflects video generation, which is the one format that isn't free anywhere else.",
  },
  {
    q: "What happens if I use all my videos for the month?",
    a: "You can top up with a one-time pack at any point, or upgrade to Studio. Text and image generation stay available even if your video count runs out.",
  },
  {
    q: "Do one-time packs expire?",
    a: "No. One-time packs are used at your pace. Monthly plans refresh automatically and are billed each cycle.",
  },
  {
    q: "Can I switch between Pro and Studio?",
    a: "Yes, anytime. Changes apply from your next billing cycle, or immediately if you're moving from a one-time pack.",
  },
];

/* ---------------------------------------------------------
   FAQ accordion item
--------------------------------------------------------- */

function FaqItem({ item, index }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid={`faq-toggle-${index}`}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-sm font-medium text-neutral-100 md:text-base">
          {item.q}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-orange-400 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className="grid overflow-hidden transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="pb-5 pr-8 text-sm leading-relaxed text-neutral-400">
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Page
--------------------------------------------------------- */

export default function PricingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "PriceSpecification",
    name: "Creative Studio Pricing",
    description:
      "Text and image generation come bundled generously into every plan. AI video with synced audio is the one format with real production cost behind it — and the only thing you're billed for.",
    priceCurrency: "INR",
    offers: PLANS.map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: p.price.replace(",", ""),
      priceCurrency: "INR",
      description: `${p.videos} AI videos / month — ${p.tagline}`,
    })),
  };

  return (
    <PageShell testid="pricing-page">
      <SEO
        title="Pricing — Creative Studio · Growth OS"
        description="Text and images are bundled in generously. AI video with synced audio is the one format that costs real money anywhere else — and the only thing billed here."
        path="/pricing"
        jsonLd={jsonLd}
      />

      <style>{`
        .tilt-card { transform-style: preserve-3d; }
        .glow-surface {
          background-image: radial-gradient(
            circle at var(--glow-x, 50%) var(--glow-y, 50%),
            rgba(249, 115, 22, 0.14),
            transparent 60%
          );
        }
        .tilt-shine { z-index: 1; }
        .tilt-card > *:not(.tilt-shine) { position: relative; z-index: 2; }
      `}</style>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-5 pt-32 pb-16 text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 font-mono text-xs text-orange-300">
            Creative Studio · Growth OS
          </span>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-white md:text-5xl">
            Everyone can make an image now.{" "}
            <span className="text-orange-500">Almost no one can make this.</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-neutral-400 md:text-lg">
            Text and images are common ground — every tool gives you those for
            free. Creative Studio&apos;s edge is the one format that still
            takes a real production budget anywhere else: AI video with
            synced audio, generated in your brand.
          </p>
        </Reveal>
      </section>

      {/* Format comparison — tilt cards */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="grid gap-6 md:grid-cols-2">
          {FORMATS.map((f, i) => (
            <Reveal key={f.title} delay={i * 120}>
              <TiltCard
                className={`glow-surface relative flex h-full flex-col rounded-2xl border p-7 ${
                  f.highlight
                    ? "border-orange-500/50 bg-gradient-to-b from-orange-500/[0.08] to-white/[0.02] shadow-[0_0_60px_-20px_rgba(249,115,22,0.4)]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <span
                  className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${
                    f.highlight
                      ? "bg-orange-500 text-black"
                      : "border border-white/15 text-neutral-400"
                  }`}
                >
                  {f.eyebrow}
                </span>
                <span
                  className={`mt-5 grid h-11 w-11 place-items-center rounded-lg ${
                    f.highlight
                      ? "bg-orange-500/15 text-orange-400"
                      : "bg-white/5 text-neutral-400"
                  }`}
                >
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-xl font-bold text-white">{f.title}</h3>
                <p className="mt-1 text-sm font-medium text-neutral-300">
                  {f.subtitle}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-neutral-400">
                  {f.desc}
                </p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* The honest breakdown */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <Reveal className="text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-orange-400">
            What&apos;s included, what&apos;s billed
          </span>
          <h2 className="mx-auto mt-3 max-w-xl text-2xl font-bold text-white md:text-3xl">
            The honest breakdown
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-neutral-400 md:text-base">
            You&apos;re not paying for the image. You&apos;re paying for the
            video. Text and image generation cost us next to nothing to
            provide, so they come generously bundled into every plan. Video
            is the one format with real production cost behind it — the
            only thing on this page with a number attached.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Reveal delay={80}>
            <TiltCard className="glow-surface h-full rounded-2xl border border-white/10 bg-white/[0.03] p-7">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
                  Bundled in, generously
                </h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                Available free elsewhere, so we don&apos;t ration it either.
                Use it as much as your plan allows without watching a
                counter.
              </p>
              <ul className="mt-6 space-y-3">
                {BUNDLED.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between border-b border-white/5 pb-3 text-sm last:border-b-0"
                  >
                    <span className="text-neutral-200">{row.label}</span>
                    <span className="font-mono text-emerald-400">
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
            </TiltCard>
          </Reveal>

          <Reveal delay={160}>
            <TiltCard className="glow-surface h-full rounded-2xl border border-orange-500/40 bg-orange-500/[0.05] p-7">
              <div className="flex items-center gap-2">
                <Film className="h-4 w-4 text-orange-400" />
                <h3 className="text-sm font-semibold uppercase tracking-widest text-orange-400">
                  What you&apos;re actually paying for
                </h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                AI video with synced audio — the format that needs real
                compute, and the one thing free tools don&apos;t hand out.
              </p>
              <ul className="mt-6 space-y-3">
                {BILLED.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between border-b border-white/5 pb-3 text-sm last:border-b-0"
                  >
                    <span className="text-neutral-200">{row.label}</span>
                    <span className="font-mono text-orange-400">
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      {/* Plans */}
      <section className="mx-auto max-w-5xl px-5 pb-10">
        <Reveal className="text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-orange-400">
            Choose a plan
          </span>
          <h2 className="mx-auto mt-3 max-w-lg text-2xl font-bold text-white md:text-3xl">
            Two ways to work, both built around video
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-neutral-400 md:text-base">
            Every plan includes generous text and image generation. The
            number that actually changes is how many videos you can make a
            month.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 120}>
              <TiltCard
                className={`glow-surface relative flex h-full flex-col rounded-2xl border p-7 ${
                  p.popular
                    ? "border-orange-500/60 bg-gradient-to-b from-orange-500/[0.08] to-white/[0.02] shadow-[0_0_60px_-20px_rgba(249,115,22,0.4)]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-7 rounded-full bg-orange-500 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-black">
                    Most output
                  </span>
                )}
                <div className="text-sm font-semibold uppercase tracking-widest text-orange-400">
                  {p.name}
                </div>
                <p className="mt-1 text-sm text-neutral-400">{p.tagline}</p>

                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold text-white">
                    ₹{p.price}
                  </span>
                  <span className="text-sm text-neutral-500">/ month</span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  or buy as a one-time pack — never expires
                </div>

                <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-orange-400">
                      {p.credits}
                    </span>
                    <span className="text-sm text-neutral-300">
                      credits per month
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Unused credits never expire, even if plan expires
                  </div>
                </div>

                <ul className="mt-6 space-y-2.5">
                  {p.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-neutral-200"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link
                    to="/signup"
                    data-testid={`${p.testid}-cta`}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all ${
                      p.popular
                        ? "bg-orange-500 text-black hover:bg-orange-400"
                        : "border border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                    }`}
                  >
                    {p.cta} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        {/* Trial pack */}
        <Reveal delay={240}>
          <TiltCard
            maxTilt={4}
            className="glow-surface mt-6 flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-7 py-6 text-center md:flex-row md:justify-between md:text-left"
          >
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">
                Try it first
              </h3>
              <p className="mt-1 text-base font-semibold text-white">
                Trial pack — 400 credits to test the workflow
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                A small one-time pack to test the platform: generate video, image, and text content. Unused credits never expire.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-white">₹499</span>
                <span className="text-xs text-neutral-500">
                  one-time · never expires
                </span>
              </div>
              <Link
                to="/signup"
                data-testid="pack-trial-cta"
                className="inline-flex items-center gap-2 rounded-full border border-orange-500/40 bg-orange-500/10 px-6 py-2.5 text-sm font-semibold text-orange-300 transition-all hover:bg-orange-500/20"
              >
                Try for ₹499 <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </TiltCard>
        </Reveal>

        <Reveal delay={280}>
          <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] px-5 py-4 text-sm text-orange-100">
            <Info className="h-4 w-4 shrink-0 text-orange-400" />
            <span>
              <strong className="text-white">No recurring surprises.</strong>{" "}
              One-time packs never expire, and monthly plans only bill on
              the cycle you choose.
            </span>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 pb-16">
        <Reveal className="text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-orange-400">
            Questions
          </span>
          <h2 className="mx-auto mt-3 text-2xl font-bold text-white md:text-3xl">
            Before you ask
          </h2>
          <p className="mt-2 text-sm text-neutral-400">Common questions</p>
        </Reveal>

        <Reveal delay={100}>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-6">
            {FAQ.map((item, i) => (
              <FaqItem key={item.q} item={item} index={i} />
            ))}
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-5 pb-24">
        <Reveal>
          <TiltCard
            maxTilt={3}
            className="glow-surface relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-orange-500/[0.15] to-transparent px-8 py-14 text-center"
          >
            <Sparkles className="mx-auto h-10 w-10 text-orange-500" />
            <h3 className="mt-4 text-3xl font-bold text-white md:text-4xl">
              Get started with credits today
            </h3>
            <p className="mx-auto mt-3 max-w-lg text-neutral-300">
              Start with the ₹499 trial pack, or jump straight into Pro or
              Studio — unused credits never expire!
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/signup"
                data-testid="pricing-cta-start"
                className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-7 py-3.5 text-sm font-semibold text-black transition-all hover:bg-orange-400"
              >
                <Sparkles className="h-4 w-4" />
                Try for ₹499
              </Link>
              <Link
                to="/faq"
                data-testid="pricing-cta-faq"
                className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
              >
                Read the FAQ
              </Link>
            </div>
          </TiltCard>
        </Reveal>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-neutral-600">
          Video generation features are offered subject to underlying
          provider availability and may be updated as the underlying
          technology changes. Pricing shown in INR, billed in your local
          currency where applicable.
          <br className="hidden md:block" /> Growth OS · Creative Studio — a
          Digverve Solutions product
        </p>
      </section>
    </PageShell>
  );
}