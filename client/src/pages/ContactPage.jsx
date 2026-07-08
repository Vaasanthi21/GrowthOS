"use client"
import { useEffect, useRef, useState } from "react";
import { Mail, MapPin, MessageSquare, Send, Check, Sparkles } from "lucide-react";
import PageShell from "@/components/PageShell";
import SEO from "@/components/SEO";

/* ---------------------------------------------------------
   Shared motion helpers — same scroll-reveal + pointer-tilt
   pattern used on the Pricing and Blog pages.
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

function Reveal({ children, className = "", delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function useTilt(maxTilt = 6) {
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
    )}deg) rotateY(${(px * maxTilt).toFixed(2)}deg) translateY(-4px)`;
    el.style.setProperty("--glow-x", `${(px + 0.5) * 100}%`);
    el.style.setProperty("--glow-y", `${(py + 0.5) * 100}%`);

    const shine = el.querySelector(".tilt-shine");
    if (shine) {
      shine.style.opacity = "1";
      shine.style.background = `radial-gradient(circle at ${(px + 0.5) * 100}% ${
        (py + 0.5) * 100
      }%, rgba(255,255,255,0.06), transparent 55%)`;
    }
  };

  const onMouseLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)";
    const shine = el.querySelector(".tilt-shine");
    if (shine) shine.style.opacity = "0";
  };

  return { ref, onMouseMove, onMouseLeave };
}

function TiltCard({ children, className = "", maxTilt = 6 }) {
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
   Page
--------------------------------------------------------- */

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", topic: "General", message: "" });
  const [sent, setSent] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!form.email || !form.message) return;
    setSent(true);
    setForm({ name: "", email: "", topic: "General", message: "" });
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CreativeOS",
    email: "hello@creativeos.app",
    contactPoint: [
      { "@type": "ContactPoint", email: "hello@creativeos.app", contactType: "customer support" },
      { "@type": "ContactPoint", email: "sales@creativeos.app", contactType: "sales" },
    ],
  };

  return (
    <PageShell testid="contact-page">
      <SEO
        title="Contact — Talk to the CreativeOS team"
        description="Get in touch with CreativeOS for support, sales, partnerships or enterprise pricing. We reply within one business day."
        path="/contact"
        jsonLd={jsonLd}
      />

      <style>{`
        .tilt-card { transform-style: preserve-3d; }
        .glow-surface {
          background-image: radial-gradient(
            circle at var(--glow-x, 50%) var(--glow-y, 50%),
            rgba(249, 115, 22, 0.12),
            transparent 60%
          );
        }
        .tilt-shine { z-index: 1; }
        .tilt-card > *:not(.tilt-shine) { position: relative; z-index: 2; }
      `}</style>

      <section className="mx-auto max-w-6xl px-5 pt-32 pb-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 font-mono text-xs text-orange-300">
                <MessageSquare className="h-3.5 w-3.5" /> We&apos;re listening
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-6 text-balance text-5xl font-extrabold leading-[1.05] tracking-tight text-white md:text-6xl">
                Let&apos;s <span className="text-orange-500">talk</span>.
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-5 max-w-md text-neutral-400">
                Whether it&apos;s a sales question, feedback on a studio, or a
                partnership pitch — the CreativeOS team replies within one
                business day.
              </p>
            </Reveal>

            <ul className="mt-10 space-y-4">
              {[
                {
                  icon: Mail,
                  label: "Email",
                  value: "hello@creativeos.app",
                  href: "mailto:hello@creativeos.app",
                  testid: "contact-email-link",
                },
                {
                  icon: Sparkles,
                  label: "Sales",
                  value: "sales@creativeos.app",
                  href: "mailto:sales@creativeos.app",
                },
                {
                  icon: MapPin,
                  label: "Studio",
                  value: "Remote-first · Global",
                },
              ].map((item, i) => (
                <Reveal key={item.label} delay={240 + i * 80}>
                  <TiltCard
                    maxTilt={4}
                    className="glow-surface flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-500">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-white">{item.label}</div>
                      {item.href ? (
                        <a
                          href={item.href}
                          className="text-sm text-neutral-400 transition hover:text-orange-400"
                          data-testid={item.testid}
                        >
                          {item.value}
                        </a>
                      ) : (
                        <div className="text-sm text-neutral-400">{item.value}</div>
                      )}
                    </div>
                  </TiltCard>
                </Reveal>
              ))}
            </ul>
          </div>

          <Reveal delay={120}>
            <TiltCard
              maxTilt={3}
              className="glow-surface rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8"
            >
              {sent ? (
                <div
                  className="flex h-full flex-col items-center justify-center text-center"
                  data-testid="contact-success"
                >
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
                    <Check className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 text-2xl font-bold text-white">Message received.</h3>
                  <p className="mt-2 max-w-sm text-sm text-neutral-400">
                    Thanks — the CreativeOS team will get back to you within
                    one business day.
                  </p>
                  <button
                    data-testid="contact-send-another"
                    onClick={() => setSent(false)}
                    className="mt-6 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Send another
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4" data-testid="contact-form">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Your name">
                      <input
                        data-testid="contact-name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Jane Doe"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        required
                        type="email"
                        data-testid="contact-email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="jane@company.com"
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <Field label="Topic">
                    <select
                      data-testid="contact-topic"
                      value={form.topic}
                      onChange={(e) => setForm({ ...form, topic: e.target.value })}
                      className={inputCls}
                    >
                      <option>General</option>
                      <option>Sales</option>
                      <option>Support</option>
                      <option>Partnership</option>
                      <option>Enterprise</option>
                    </select>
                  </Field>
                  <Field label="Message">
                    <textarea
                      required
                      rows={5}
                      data-testid="contact-message"
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="Tell us what you're building..."
                      className={`${inputCls} resize-none`}
                    />
                  </Field>
                  <button
                    type="submit"
                    data-testid="contact-submit"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-orange-400 active:scale-95 sm:w-auto"
                  >
                    <Send className="h-4 w-4" /> Send message
                  </button>
                </form>
              )}
            </TiltCard>
          </Reveal>
        </div>
      </section>
    </PageShell>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-orange-500/50";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}