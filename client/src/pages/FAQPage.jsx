"use client"
import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, HelpCircle, Sparkles, ArrowRight } from "lucide-react";
import PageShell from "@/components/PageShell";
import SEO from "@/components/SEO";

const CATEGORIES = [
  {
    name: "General",
    faqs: [
      {
        q: "What is CreativeOS?",
        a: "CreativeOS is a unified AI content platform. From a single prompt bar you can generate text posts, HD images, cinematic video clips, SEO-ready long-form blogs, and LinkedIn analytics — across six connected studios (Content, Image, Video, Blog, Tracker, Platform Core).",
      },
      {
        q: "Who is CreativeOS for?",
        a: "Founders, marketers, agencies and creator-led teams who need to ship high-quality content weekly without juggling five different AI tools or paying for subscriptions they barely use.",
      },
      {
        q: "Is CreativeOS free to try?",
        a: "Yes. Every new account gets 100 free credits — enough to try every studio (text, image, video and a full blog draft) before deciding to top up.",
      },
    ],
  },
  {
    name: "Pricing & Billing",
    faqs: [
      {
        q: "How does usage-based pricing work?",
        a: "You buy credit packs once and spend credits as you generate content. There is no monthly subscription, no auto-renewal, and no expiry — credits stay in your balance forever. Think of it like topping up a prepaid card.",
      },
      {
        q: "Will I be charged automatically every month?",
        a: "Never. CreativeOS has no recurring payments. You only pay again if and when you choose to top up your credit balance.",
      },
      {
        q: "Do unused credits expire?",
        a: "No. Your credits never expire. Save 💾 today, spend them next quarter, next year, or whenever you need them.",
      },
      {
        q: "How many credits does each action cost?",
        a: "Text post = 1 credit · HD Image = 3 credits · Video clip (up to 10s) = 69 credits · Text + Image = 4 credits · Long-form blog = 10 credits · LinkedIn Tracker refresh = free.",
      },
      {
        q: "Can I get a refund?",
        a: "If a generation fails on our side, credits are automatically returned to your balance. Unspent credit packs are refundable within 14 days of purchase.",
      },
    ],
  },
  {
    name: "Studios & Features",
    faqs: [
      {
        q: "Which AI models power CreativeOS?",
        a: "We orchestrate best-in-class models per format — including modern LLMs for text/blogs, diffusion models for images, and video generation models for cinematic clips. The right model is auto-selected for the format you pick.",
      },
      {
        q: "Can I use CreativeOS for commercial content?",
        a: "Yes. Content generated with CreativeOS is licensed for commercial use, subject to the usage policies of the underlying model providers.",
      },
      {
        q: "Does CreativeOS help my content rank on Google?",
        a: "Blog Studio produces SEO-tuned, source-cited long-form drafts with keyword targeting and internal linking suggestions. Every article ships with an SEO score before you publish.",
      },
      {
        q: "Do you support LinkedIn analytics?",
        a: "Yes — LinkedIn Tracker gives you a live dashboard of impressions, engagement, CTR and follower growth, with post-level performance breakdowns.",
      },
    ],
  },
  {
    name: "Data & Privacy",
    faqs: [
      {
        q: "Do you train models on my prompts?",
        a: "No. Your prompts and outputs are private and are never used to train third-party models.",
      },
      {
        q: "Where is my content stored?",
        a: "Content is stored in encrypted object storage in secure cloud regions. You can export or delete everything from your workspace at any time.",
      },
      {
        q: "Do you support SSO and audit logs?",
        a: "Yes — SSO (SAML/OIDC) and audit logs are available on Enterprise. Contact us for a walkthrough.",
      },
    ],
  },
];

export default function FAQPage() {
  const [open, setOpen] = useState({ 0: 0 }); // {catIdx: qIdx}

  const flatFaqs = CATEGORIES.flatMap((c) => c.faqs);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: flatFaqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <PageShell testid="faq-page">
      <SEO
        title="Frequently Asked Questions"
        description="Answers about CreativeOS: usage-based pricing, no subscriptions, credits that never expire, studios, data privacy and more."
        path="/faq"
        jsonLd={jsonLd}
      />

      <section className="mx-auto max-w-4xl px-5 pt-32 pb-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-xs text-neutral-300">
          <HelpCircle className="h-3.5 w-3.5 text-orange-500" /> Answers, not marketing
        </span>
        <h1 className="mt-6 text-balance text-5xl font-extrabold leading-[1.05] tracking-tight text-white md:text-6xl">
          Frequently asked <span className="text-orange-500">questions</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-neutral-400">
          Everything you need to know about CreativeOS, our usage-based pricing and how Save 💾 and Grow works.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-16">
        {CATEGORIES.map((cat, ci) => (
          <div key={cat.name} className="mb-10">
            <h2 className="mb-4 font-mono text-[11px] uppercase tracking-widest text-orange-500">
              {cat.name}
            </h2>
            <div className="space-y-3">
              {cat.faqs.map((f, qi) => {
                const isOpen = open[ci] === qi;
                return (
                  <div
                    key={f.q}
                    className={`overflow-hidden rounded-2xl border transition-colors ${
                      isOpen
                        ? "border-orange-500/40 bg-orange-500/[0.04]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20"
                    }`}
                  >
                    <button
                      data-testid={`faq-question-${ci}-${qi}`}
                      onClick={() =>
                        setOpen((prev) => ({ ...prev, [ci]: prev[ci] === qi ? -1 : qi }))
                      }
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    >
                      <span className="text-[15px] font-medium text-white">{f.q}</span>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-orange-400 transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <div
                      className={`grid transition-all duration-300 ${
                        isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="px-5 pb-5 text-sm leading-relaxed text-neutral-300">
                          {f.a}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-24">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-orange-500/[0.12] to-transparent p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-orange-500" />
          <h3 className="mt-3 text-2xl font-bold text-white md:text-3xl">Still have questions?</h3>
          <p className="mt-3 text-neutral-300">
            We reply within one business day. Or jump straight in and start creating.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/contact"
              data-testid="faq-contact-cta"
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-orange-400"
            >
              Contact us <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/pricing"
              data-testid="faq-pricing-cta"
              className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-white/10"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}